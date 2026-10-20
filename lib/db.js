import { createClient } from '@supabase/supabase-js';
import { buildOrder, groupRowsToOrders, newOrderUuid, toOrderRows } from '@/lib/orders/orderModel';
import { DEFAULT_PAYMENT_METHOD } from '@/lib/orders/paymentMethods';
import { resolveTicketNumber, waitForNumber } from '@/lib/orders/ticketNumbering';

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
 * Paid tickets only: the iPhone app saves a ticket as `pending` when it goes
 * to the kitchen and `paid` once the customer pays, and a `cancelled` ticket
 * was never paid. Rows from before the `status` column default to `paid`.
 *
 * @param {Date | null} from inclusive lower bound
 * @param {Date | null} to exclusive upper bound
 * @param {number | null} locationId one location, or `null` for every location
 * @returns {Promise<Array<ReturnType<typeof buildOrder>>>}
 */
export async function getOrdersInRange(from = null, to = null, locationId = null) {
    let query = supabase.from(ORDERS_TABLE).select('*').eq('status', 'paid');
    if (from) query = query.gte('timestamp', toStoredTimestamp(from));
    if (to) query = query.lt('timestamp', toStoredTimestamp(to));
    if (locationId) query = query.eq('location', locationId);

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
 * Today's orders at one location, newest first. Rows are one-per-unit, so they
 * are grouped back into orders by `orderNumber`.
 *
 * @param {number} locationId
 * @returns {Promise<Array<ReturnType<typeof buildOrder>>>}
 */
export async function getOrderHistory(locationId) {
    const { start, end } = dayBounds();
    const { data, error } = await supabase
        .from(ORDERS_TABLE)
        .select('*')
        .eq('location', locationId)
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
 * Reserves today's next order number at one location from the
 * `next_order_number` Postgres function, which serialises concurrent callers —
 * website or iPad — behind an advisory lock scoped to the day and location.
 * Each location counts from 1. Collisions are structurally impossible rather
 * than avoided by retrying.
 *
 * @param {number} locationId
 * @returns {Promise<number>}
 */
export async function getNextOrderNumber(locationId) {
    const { start, end } = dayBounds();
    const { data, error } = await supabase.rpc('next_order_number', {
        range_start: start,
        range_end: end,
        p_location: locationId,
    });
    if (error) {
        console.error('Failed to get next order number:', error);
        throw new Error(error.message);
    }
    return data;
}

/** Whether a booth main phone is numbering this location's tickets. */
async function hasMainPhone(locationId) {
    const { data, error } = await supabase
        .from('booth_main_phone')
        .select('location')
        .eq('location', locationId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data !== null;
}

/** Asks the main phone for a number and waits for its answer (or null). */
async function askMainPhone(orderUuid, locationId) {
    const { error } = await supabase
        .from('ticket_number_requests')
        .insert({ order_uuid: orderUuid, location: locationId });
    if (error) throw new Error(error.message);

    return waitForNumber({
        fetchNumber: async () => {
            const { data, error: readError } = await supabase
                .from('ticket_number_requests')
                .select('order_number')
                .eq('order_uuid', orderUuid)
                .single();
            if (readError) throw new Error(readError.message);
            return data.order_number;
        },
    });
}

async function rpcNumber(name, params) {
    const { data, error } = await supabase.rpc(name, params);
    if (error) {
        console.error(`Failed to get a ticket number (${name}):`, error);
        throw new Error(error.message);
    }
    return data;
}

/**
 * The order's ticket number: from the booth's main phone when one is in
 * charge (or 1000+ if it doesn't answer), otherwise the database counter.
 * See lib/orders/ticketNumbering.js.
 *
 * @returns {Promise<{ number: number, source: 'counter'|'mainPhone'|'fallback' }>}
 */
async function getTicketNumber(orderUuid, locationId) {
    const { start, end } = dayBounds();
    return resolveTicketNumber({
        hasMainPhone: await hasMainPhone(locationId),
        nextFromCounter: () => getNextOrderNumber(locationId),
        askMainPhone: () => askMainPhone(orderUuid, locationId),
        abandonRequest: () => rpcNumber('abandon_ticket_number_request', { p_order_uuid: orderUuid }),
        nextFallback: () => rpcNumber('next_fallback_order_number', {
            range_start: start,
            range_end: end,
            p_location: locationId,
        }),
    });
}

/**
 * Inserts one row per physical unit and returns the order in UI shape, with
 * `numberSource` saying where its ticket number came from.
 *
 * All rows of an order share the `orderNumber` and `timestamp` the number was
 * reserved against, so the order stays inside the day bounds every other query
 * is scoped to. Every order gets a hidden `order_uuid`, which is how the iPhone
 * app pays, edits and cancels it.
 *
 * `status: 'pending'` is a pre-order: taken by someone who doesn't take
 * payment, then paid on an iPhone before the customer gets it. It has no
 * payment method until then.
 *
 * @param {{
 *   cartItems: Array<{name: string, modifiers?: string[], price: number, type: string, quantity: number}>,
 *   phone?: string,
 *   paymentMethod?: string,
 *   locationId?: number,
 *   status?: 'pending'|'paid',
 * }} params
 */
export async function createOrder({
    cartItems,
    phone = '',
    paymentMethod = DEFAULT_PAYMENT_METHOD,
    locationId = 1,
    status = 'paid',
}) {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
        throw new Error('Cannot create an order with no items.');
    }

    const orderUuid = newOrderUuid();
    const { number: orderNumber, source: numberSource } = await getTicketNumber(orderUuid, locationId);
    const rows = toOrderRows({
        cartItems,
        orderNumber,
        timestamp: new Date().toISOString(),
        phone: phone.trim(),
        paymentMethod: status === 'pending' ? null : paymentMethod,
        locationId,
        status,
        orderUuid,
    });

    const { data, error } = await supabase.from(ORDERS_TABLE).insert(rows).select();

    if (error) {
        console.error('Supabase insert error:', error);
        throw new Error(error.message);
    }

    // Build from the returned rows so the UI holds the real row ids, matching
    // what a later refetch will produce.
    return { ...buildOrder(orderNumber, data), numberSource };
}

/**
 * Writes a ticket's whole payment state (from lib/orders/ticketPayments.js)
 * onto every row of it, matched by the hidden `order_uuid` — exactly what the
 * iPhone app sends, so the main phone picks it up over Realtime.
 *
 * Only applied while the ticket still has the status and payment log this
 * browser saw (see `expectedPaymentState`). The patch replaces the whole log,
 * so if another device changed the ticket in the meantime — even a paid →
 * paid method correction — nothing is overwritten and this throws so staff
 * can look at the ticket again. jsonb compares by value, not text.
 *
 * @param {string} orderUuid
 * @param {{ status: 'pending'|'paid'|'cancelled', paymentLog: Array<object> }} expected the state the change starts from
 * @param {import('@/lib/orders/ticketPayments').PaymentPatch} patch
 */
export async function updateTicketPayment(orderUuid, expected, patch) {
    if (!orderUuid) throw new Error("This ticket has no id, so its payment can't be changed here.");

    const { data, error } = await supabase
        .from(ORDERS_TABLE)
        .update(patch)
        .eq('order_uuid', orderUuid)
        .eq('status', expected.status)
        .eq('payment_log', JSON.stringify(expected.paymentLog))
        .select('id');

    if (error) {
        console.error('Failed to update ticket payment:', error);
        throw new Error(error.message);
    }
    if (data.length === 0) {
        throw new Error('This ticket was changed on another device. Check it and try again.');
    }
}

/**
 * Day- and location-bounded on purpose: `orderNumber` repeats across days and
 * across locations, so an unbounded update would rewrite the phone on every
 * other order sharing this number.
 */
export async function updateOrderPhone(orderNumber, phone, locationId) {
    const { start, end } = dayBounds();
    const { error } = await supabase
        .from(ORDERS_TABLE)
        .update({ phone: phone || null })
        .eq('orderNumber', orderNumber)
        .eq('location', locationId)
        .gte('timestamp', start)
        .lt('timestamp', end);

    if (error) console.error('Failed to update phone:', error);
}
