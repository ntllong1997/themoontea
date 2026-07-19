// Pure mapping between the cart / UI shapes and the Supabase `orders` row
// shape. Kept free of Supabase imports so it can be unit tested directly.
//
// The DB stores ONE ROW PER ORDER with line items collapsed into an `items`
// jsonb array (see supabase_schema.sql):
//     [{ name, modifiers, unit_price, quantity, type }]
// The station screens, however, track status per physical unit (each drink
// gets its own new -> ready -> picked up state), so `expandUnits` re-expands a
// collapsed line into one entry per unit for the UI.

// Relative (not the "@/" alias) so this module can be unit tested under plain
// `node --test`, without the Next.js path-alias resolver.
import { TAX_RATE } from '../constants.js';

export const ORDER_SOURCE = {
    online: 'online', // placed by a customer on the website
    pos: 'pos',       // rung up by staff in store
};

export const PRINT_STATUS = {
    pending: 'pending', // waiting for the iPad POS to claim and print it
    printed: 'printed',
};

// Prefix for the human-facing order code, so a website code (W-1042) is
// instantly distinguishable from an in-store one (P-1043).
const ORDER_CODE_PREFIX = {
    [ORDER_SOURCE.online]: 'W',
    [ORDER_SOURCE.pos]: 'P',
};

// Orders placed in store are printed by the POS itself at checkout, so they
// must never re-enter the iPad's auto-print queue.
const DEFAULT_PRINT_STATUS = {
    [ORDER_SOURCE.online]: PRINT_STATUS.pending,
    [ORDER_SOURCE.pos]: PRINT_STATUS.printed,
};

const round2 = (value) => Math.round(value * 100) / 100;

export function orderCodePrefix(source) {
    return ORDER_CODE_PREFIX[source] ?? ORDER_CODE_PREFIX[ORDER_SOURCE.pos];
}

export function defaultPrintStatus(source) {
    return DEFAULT_PRINT_STATUS[source] ?? PRINT_STATUS.printed;
}

/**
 * "Taro Milk Tea" + ["Tapioca"] -> "Taro Milk Tea (Tapioca)".
 * Mirrors OnlineOrderItem.displayName in the iOS app so a receipt printed by
 * the iPad reads identically to the web history.
 *
 * @param {{ name: string, modifiers?: string[] }} item
 * @returns {string}
 */
export function formatItemName({ name, modifiers = [] }) {
    return modifiers.length > 0 ? `${name} (${modifiers.join(', ')})` : name;
}

/**
 * Cart items -> the `items` jsonb payload.
 *
 * @param {Array<{name: string, modifiers?: string[], price: number, type: string, quantity: number}>} cartItems
 */
export function toOrderItems(cartItems) {
    return cartItems.map(({ name, modifiers = [], price, type, quantity }) => ({
        name,
        modifiers,
        unit_price: price,
        quantity,
        // Not part of the shared contract in supabase_schema.sql, but jsonb is
        // schemaless and the iOS decoder ignores unknown keys. The boba and
        // corndog station screens need it to filter their own items.
        type,
    }));
}

/**
 * Money columns are numeric(10,2), so every value is rounded to cents before
 * it is sent — otherwise Postgres rounds for us and the stored total can
 * disagree with the total that was printed on the receipt.
 *
 * @param {Array<{unit_price: number, quantity: number}>} items
 * @returns {{subtotal: number, tax: number, total: number}}
 */
export function calculateTotals(items, taxRate = TAX_RATE) {
    const subtotal = round2(
        items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
    );
    const tax = round2(subtotal * taxRate);
    return { subtotal, tax, total: round2(subtotal + tax) };
}

/**
 * Collapsed `items` jsonb -> one entry per physical unit, so the station
 * screens can key status by position. `lineIndex`/`unitIndex` together
 * identify a unit stably across refetches.
 */
export function expandUnits(items = []) {
    return items.flatMap((item, lineIndex) =>
        Array.from({ length: Math.max(item.quantity ?? 1, 1) }, (_, unitIndex) => ({
            name: item.name,
            modifiers: item.modifiers ?? [],
            displayName: formatItemName(item),
            price: Number(item.unit_price ?? 0),
            type: item.type,
            lineIndex,
            unitIndex,
        }))
    );
}

/** A Supabase `orders` row -> the shape the web UI renders. */
export function mapOrderRow(row) {
    return {
        id: row.id,
        orderNumber: row.order_number,
        source: row.source,
        createdAt: row.created_at,
        customerName: row.customer_name ?? '',
        phone: row.customer_phone ?? '',
        notes: row.notes ?? '',
        paymentMethod: row.payment_method,
        printStatus: row.print_status,
        subtotal: Number(row.subtotal ?? 0),
        tax: Number(row.tax ?? 0),
        total: Number(row.total ?? 0),
        items: expandUnits(row.items),
    };
}

/** Sum of `total` across orders, for the revenue counters. */
export function calculateTotalRevenue(orders) {
    return orders.reduce((sum, order) => sum + order.total, 0).toFixed(2);
}
