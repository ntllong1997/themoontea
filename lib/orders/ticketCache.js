// Today's order rows for one location, kept in memory and updated in place.
//
// The till and the station screens used to re-read every row of the day every
// 3 seconds. Now they read the day once, then apply Supabase Realtime changes
// (INSERT / UPDATE / DELETE, one per row) as they arrive, with a full re-read
// now and then as a safety net. Rows are keyed by their `id`, so a change
// that arrives twice — this page's own save and its Realtime echo, say — is a
// no-op the second time.
//
// A full read takes a moment, and anything that happens meanwhile (a Realtime
// change, or this page's own save) may or may not be in its answer. So while
// a read is out, every change is also noted down, and replayed on top of the
// read's answer when it lands. That is what keeps a read that left just
// before a payment from showing the ticket unpaid again.
//
// No Supabase imports, so `node --test` can load this file.

import { groupRowsToOrders } from './orderModel.js';
import { parseOrderTimestamp } from './dateRange.js';

/**
 * Which rows belong in the cache: one location, today. `start` and `end` are
 * the same `[start, end)` bounds the full read is scoped to (see `dayBounds()`
 * in lib/db.js).
 *
 * @typedef {{ locationId: number, start: string, end: string }} TicketScope
 */

/** Whether a row belongs to the scope. A row without a location is Location 1's. */
export function isInScope(row, { locationId, start, end }) {
    if (Number(row?.location ?? 1) !== Number(locationId)) return false;
    const at = parseOrderTimestamp(row.timestamp);
    if (Number.isNaN(at.getTime())) return false;
    return at >= new Date(start) && at < new Date(end);
}

// The order the full read used to come back in — newest order first, then the
// order's rows by time — with the row id as a tiebreak, so an order's items
// keep their places from one update to the next.
function compareRows(a, b) {
    return (
        b.orderNumber - a.orderNumber ||
        String(a.timestamp).localeCompare(String(b.timestamp)) ||
        String(a.id).localeCompare(String(b.id))
    );
}

export function createTicketCache() {
    /** @type {Map<string, object>} */
    let rows = new Map();
    /** Changes made while a full read is out; `null` when none is. */
    let journal = null;

    const put = (row, scope) => {
        if (row?.id == null) return;
        if (isInScope(row, scope)) rows.set(row.id, row);
        // An update that moves a row out of today or this location drops it.
        else rows.delete(row.id);
    };

    const apply = (op, scope) => {
        switch (op.kind) {
            case 'change': {
                const { type, record, oldRecord } = op.change;
                if (type === 'INSERT' || type === 'UPDATE') put(record, scope);
                // A DELETE carries only the primary key.
                else if (type === 'DELETE' && oldRecord?.id != null) rows.delete(oldRecord.id);
                break;
            }
            case 'rows':
                op.rows.forEach((row) => put(row, scope));
                break;
            case 'patch':
                for (const [id, row] of rows) {
                    if (row.order_uuid === op.orderUuid) rows.set(id, { ...row, ...op.patch });
                }
                break;
        }
    };

    const record = (op, scope) => {
        apply(op, scope);
        journal?.push(op);
    };

    return {
        /**
         * One Realtime change, as `{ type, record, oldRecord }`.
         * @param {{ type: string, record?: object, oldRecord?: object }} change
         * @param {TicketScope} scope
         */
        applyChange: (change, scope) => record({ kind: 'change', change }, scope),

        /** Rows this page has just saved, e.g. a new order. */
        addRows: (newRows, scope) => record({ kind: 'rows', rows: newRows }, scope),

        /**
         * A payment change this page has just saved, applied to every row of
         * the ticket as `updateTicketPayment` wrote it.
         */
        patchOrder: (orderUuid, patch, scope) => {
            if (orderUuid) record({ kind: 'patch', orderUuid, patch }, scope);
        },

        /** Call as a full read leaves. Only one may be out at a time. */
        startRead: () => {
            journal = [];
        },

        /** The full read's answer: replaces every row, then replays what happened since it left. */
        finishRead: (freshRows, scope) => {
            const missed = journal ?? [];
            journal = null;
            rows = new Map();
            freshRows.forEach((row) => put(row, scope));
            missed.forEach((op) => apply(op, scope));
        },

        /** The full read failed: keep what we have. */
        abandonRead: () => {
            journal = null;
        },

        /**
         * The cached rows as UI orders, newest first. Re-checked against the
         * scope, so yesterday's tickets go at midnight without waiting for a
         * full read.
         *
         * @param {TicketScope} scope
         */
        orders: (scope) => groupRowsToOrders([...rows.values()].filter((row) => isInScope(row, scope)).sort(compareRows)),
    };
}
