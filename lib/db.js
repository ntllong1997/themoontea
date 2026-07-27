import { createClient } from '@supabase/supabase-js';
import { buildOrder, groupRowsToOrders, toOrderRows } from '@/lib/orders/orderModel';
import { DEFAULT_PAYMENT_METHOD } from '@/lib/orders/paymentMethods';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ORDERS_TABLE = 'orders';

// `orderNumber` resets to 1 every day, so it only identifies an order *within*
// a day. Every read and write is therefore day-scoped — without the bounds a
// phone update would hit every past day's order sharing that number.
//
// The `timestamp` column is `timestamp without time zone`, and the iPad app
// writes local-midnight bounds serialised as UTC ISO8601. Matching that here
// exactly is what keeps both clients agreeing on which rows are "today".
function dayBounds() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
}

// PostgREST caps a response at 1000 rows unless asked otherwise. A busy day is
// a few hundred one-per-unit rows, so this leaves years of headroom — and we
// still shout if it is ever reached rather than reporting a short total.
const MAX_RANGE_ROWS = 50000;

/**
 * A window bound as the column stores it: UTC.
 *
 * Both tills write `new Date().toISOString()` into a `timestamp without time
 * zone` column, so the stored values are UTC wearing no marker. A bound picked
 * as a local day therefore has to be converted the same way — this is exactly
 * what `dayBounds()` above does, and sending local wall clock instead would
 * slide every window by the UTC offset.
 */
const toStoredTimestamp = (date) => date.toISOString();

/**
 * Orders in a half-open `[from, to)` window, newest first. A `null` bound is
 * open, so `getOrdersInRange(null, null)` is every order ever taken.
 *
 * Unlike {@link getOrderHistory} this is not day-scoped: the sales summary
 * reports across days, and reading a single day would cap every total at
 * whatever happened since midnight.
 *
 * @param {Date | null} from inclusive lower bound
 * @param {Date | null} to exclusive upper bound
 * @returns {Promise<Array<ReturnType<typeof buildOrder>>>}
 */
export async function getOrdersInRange(from = null, to = null) {
    let query = supabase.from(ORDERS_TABLE).select('*');
    if (from) query = query.gte('timestamp', toStoredTimestamp(from));
    if (to) query = query.lt('timestamp', toStoredTimestamp(to));

    const { data, error } = await query
        .order('timestamp', { ascending: false })
        .limit(MAX_RANGE_ROWS);

    // Thrown, not swallowed: a summary that quietly reports $0.00 because the
    // network failed is worse than one that says it could not load.
    if (error) {
        throw new Error(error?.message || 'Could not read orders from Supabase.');
    }
    if (data.length === MAX_RANGE_ROWS) {
        console.warn(
            `Order history hit the ${MAX_RANGE_ROWS}-row ceiling — totals may be short.`
        );
    }

    return groupRowsToOrders(data);
}

/**
 * Today's orders, newest first. Rows are one-per-unit, so they are grouped
 * back into orders by `orderNumber`.
 *
 * @returns {Promise<Array<ReturnType<typeof buildOrder>>>}
 */
export async function getOrderHistory() {
    const { start, end } = dayBounds();
    const { data, error } = await supabase
        .from(ORDERS_TABLE)
        .select('*')
        .gte('timestamp', start)
        .lt('timestamp', end)
        .order('orderNumber', { ascending: false })
        .order('timestamp', { ascending: true });

    if (error) {
        console.error('Supabase fetch error:', error?.message || JSON.stringify(error));
        return [];
    }

    return groupRowsToOrders(data);
}

/**
 * Reserves today's next order number from the `next_order_number` Postgres
 * function, which serialises concurrent callers — website or iPad — behind an
 * advisory lock scoped to the day. Collisions are structurally impossible
 * rather than avoided by retrying.
 *
 * @returns {Promise<number>}
 */
export async function getNextOrderNumber() {
    const { start, end } = dayBounds();
    const { data, error } = await supabase.rpc('next_order_number', {
        range_start: start,
        range_end: end,
    });
    if (error) {
        console.error('Failed to get next order number:', error);
        throw new Error(error.message);
    }
    return data;
}

/**
 * Inserts one row per physical unit and returns the order in UI shape.
 *
 * All rows of an order share the `orderNumber` and `timestamp` the number was
 * reserved against, so the order stays inside the day bounds every other query
 * is scoped to.
 *
 * @param {{
 *   cartItems: Array<{name: string, modifiers?: string[], price: number, type: string, quantity: number}>,
 *   phone?: string,
 *   paymentMethod?: string,
 * }} params
 */
export async function createOrder({
    cartItems,
    phone = '',
    paymentMethod = DEFAULT_PAYMENT_METHOD,
}) {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
        throw new Error('Cannot create an order with no items.');
    }

    const orderNumber = await getNextOrderNumber();
    const rows = toOrderRows({
        cartItems,
        orderNumber,
        timestamp: new Date().toISOString(),
        phone: phone.trim(),
        paymentMethod,
    });

    const { data, error } = await supabase.from(ORDERS_TABLE).insert(rows).select();

    if (error) {
        console.error('Supabase insert error:', error);
        throw new Error(error.message);
    }

    // Build from the returned rows so the UI holds the real row ids, matching
    // what a later refetch will produce.
    return buildOrder(orderNumber, data);
}

/**
 * Day-bounded on purpose: `orderNumber` repeats across days, so an unbounded
 * update would rewrite the phone on every past order sharing this number.
 */
export async function updateOrderPhone(orderNumber, phone) {
    const { start, end } = dayBounds();
    const { error } = await supabase
        .from(ORDERS_TABLE)
        .update({ phone: phone || null })
        .eq('orderNumber', orderNumber)
        .gte('timestamp', start)
        .lt('timestamp', end);

    if (error) console.error('Failed to update phone:', error);
}
