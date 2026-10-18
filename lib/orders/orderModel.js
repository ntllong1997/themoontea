// Pure mapping between the cart / UI shapes and the Supabase `orders` row
// shape. Kept free of Supabase imports so it can be unit tested directly.
//
// The DB stores ONE ROW PER PHYSICAL UNIT: a quantity of 3 is three rows
// sharing an integer `orderNumber`. That is the same schema the iPad app reads
// and writes, so both clients agree without a translation layer.
//
// A row's `name` is already the flattened display name ("Brown Sugar
// (Tapioca)") because the table has no modifiers column — `toOrderRows`
// flattens on the way in, and the UI reads `displayName` straight back out.

// Relative (not the "@/" alias) so this module can be unit tested under plain
// `node --test`, without the Next.js path-alias resolver.
import { TAX_RATE } from '../constants.js';

const round2 = (value) => Math.round(value * 100) / 100;

/** The values `orders.status` allows. */
export const ORDER_STATUSES = ['pending', 'paid', 'cancelled'];

/**
 * A random v4 uuid for `orders.order_uuid`, the hidden id every row of one
 * order shares. The iPhone app pays, edits and cancels a ticket by this id.
 *
 * `crypto.randomUUID` only exists on https pages, and staff may open the till
 * over plain http on the booth WiFi, so fall back to `getRandomValues`, which
 * exists everywhere.
 *
 * @param {Crypto} [cryptoImpl] injectable for tests
 * @returns {string}
 */
export function newOrderUuid(cryptoImpl = globalThis.crypto) {
    if (typeof cryptoImpl.randomUUID === 'function') return cryptoImpl.randomUUID();
    const bytes = cryptoImpl.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * "Taro Milk Tea" + ["Tapioca"] -> "Taro Milk Tea (Tapioca)".
 * Mirrors the iPad app's item naming so a receipt printed there reads
 * identically to the web history.
 *
 * @param {{ name: string, modifiers?: string[] }} item
 * @returns {string}
 */
export function formatItemName({ name, modifiers = [] }) {
    return modifiers.length > 0 ? `${name} (${modifiers.join(', ')})` : name;
}

/**
 * Cart lines -> one DB row per physical unit.
 *
 * Quantity is expressed as row *count*, not a column, so a line of 3 becomes
 * three rows. `quantity` is left null to match what the iPad app writes.
 *
 * @param {{
 *   cartItems: Array<{name: string, modifiers?: string[], price: number, type: string, quantity: number}>,
 *   orderNumber: number,
 *   timestamp: string,
 *   phone?: string|null,
 *   paymentMethod?: string|null,
 *   locationId?: number,
 *   status?: 'pending'|'paid'|'cancelled',
 *   orderUuid?: string|null,
 * }} params
 * @returns {Array<{orderNumber: number, location: number, name: string, price: number, type: string, timestamp: string, phone: string|null, paymentMethod: string|null, quantity: null, status: string, order_uuid: string|null}>}
 */
export function toOrderRows({
    cartItems,
    orderNumber,
    timestamp,
    phone = null,
    paymentMethod = null,
    locationId = 1,
    status = 'paid',
    orderUuid = null,
}) {
    if (!ORDER_STATUSES.includes(status)) {
        throw new Error(`Unknown order status "${status}".`);
    }
    return cartItems.flatMap((item) =>
        Array.from({ length: Math.max(item.quantity ?? 1, 1) }, () => ({
            orderNumber,
            location: locationId,
            name: formatItemName(item),
            price: item.price,
            type: item.type,
            timestamp,
            phone: phone || null,
            paymentMethod: paymentMethod || null,
            quantity: null,
            status,
            order_uuid: orderUuid,
        }))
    );
}

/**
 * Money is stored as double precision, so values are rounded to cents before
 * they are read back into totals — otherwise a printed receipt and the summary
 * page can disagree by a cent.
 *
 * @param {Array<{price: number}>} rows one entry per unit
 * @returns {{subtotal: number, tax: number, total: number}}
 */
export function calculateTotals(rows, taxRate = TAX_RATE) {
    const subtotal = round2(rows.reduce((sum, row) => sum + Number(row.price ?? 0), 0));
    const tax = round2(subtotal * taxRate);
    return { subtotal, tax, total: round2(subtotal + tax) };
}

/**
 * Per-unit rows -> the order shape the web UI renders, newest order first.
 *
 * Rows arrive flat and are grouped by location and `orderNumber` — each
 * location counts from 1, so the same number at two locations is two orders.
 * Each row is already one unit, so it maps straight onto a UI item —
 * `lineIndex`/`unitIndex` are kept as positional identifiers because the
 * station screens key their per-unit status by them.
 *
 * @param {Array<object>} rows
 */
export function groupRowsToOrders(rows = []) {
    const buckets = new Map();
    for (const row of rows) {
        const key = `${row.location ?? 1}:${row.orderNumber}`;
        const existing = buckets.get(key);
        if (existing) existing.push(row);
        else buckets.set(key, [row]);
    }

    return [...buckets.values()]
        .sort((a, b) => b[0].orderNumber - a[0].orderNumber)
        .map((orderRows) => buildOrder(orderRows[0].orderNumber, orderRows));
}

/** One order's rows -> the UI order shape. */
export function buildOrder(orderNumber, rows) {
    const first = rows[0] ?? {};
    const { subtotal, tax, total } = calculateTotals(rows);

    return {
        id: first.id ?? String(orderNumber),
        orderNumber,
        location: first.location ?? 1,
        createdAt: first.timestamp ?? null,
        phone: first.phone ?? '',
        paymentMethod: first.paymentMethod ?? '',
        // Rows from before the status column were paid when saved.
        status: first.status ?? 'paid',
        subtotal,
        tax,
        total,
        items: rows.map((row, index) => ({
            id: row.id,
            name: row.name,
            displayName: row.name,
            price: Number(row.price ?? 0),
            type: row.type,
            lineIndex: index,
            unitIndex: 0,
        })),
    };
}

/** Sum of `total` across orders, for the revenue counters. */
export function calculateTotalRevenue(orders) {
    return orders.reduce((sum, order) => sum + order.total, 0).toFixed(2);
}
