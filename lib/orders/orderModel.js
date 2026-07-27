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
 * }} params
 * @returns {Array<{orderNumber: number, name: string, price: number, type: string, timestamp: string, phone: string|null, paymentMethod: string|null, quantity: null}>}
 */
export function toOrderRows({
    cartItems,
    orderNumber,
    timestamp,
    phone = null,
    paymentMethod = null,
}) {
    return cartItems.flatMap((item) =>
        Array.from({ length: Math.max(item.quantity ?? 1, 1) }, () => ({
            orderNumber,
            name: formatItemName(item),
            price: item.price,
            type: item.type,
            timestamp,
            phone: phone || null,
            paymentMethod: paymentMethod || null,
            quantity: null,
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
 * Rows arrive flat and are grouped by `orderNumber`. Each row is already one
 * unit, so it maps straight onto a UI item — `lineIndex`/`unitIndex` are kept
 * as positional identifiers because the station screens key their per-unit
 * status by them.
 *
 * @param {Array<object>} rows
 */
export function groupRowsToOrders(rows = []) {
    const buckets = new Map();
    for (const row of rows) {
        const existing = buckets.get(row.orderNumber);
        if (existing) existing.push(row);
        else buckets.set(row.orderNumber, [row]);
    }

    return [...buckets.entries()]
        .sort(([a], [b]) => b - a)
        .map(([orderNumber, orderRows]) => buildOrder(orderNumber, orderRows));
}

/** One order's rows -> the UI order shape. */
export function buildOrder(orderNumber, rows) {
    const first = rows[0] ?? {};
    const { subtotal, tax, total } = calculateTotals(rows);

    return {
        id: first.id ?? String(orderNumber),
        orderNumber,
        createdAt: first.timestamp ?? null,
        phone: first.phone ?? '',
        paymentMethod: first.paymentMethod ?? '',
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
