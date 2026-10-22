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
 * Unlike {@link getTodayOrderRows} this is not day-scoped: the sales summary
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
 * Today's order rows at one location, ungrouped — what lib/orders/ticketCache.js
 * keeps. Throws, so a failed read leaves the cached tickets on screen rather
 * than blanking them.
 *
 * @param {number} locationId
 * @returns {Promise<Array<object>>}
 */
export async function getTodayOrderRows(locationId) {
    const { start, end } = dayBounds();
    const { data, error } = await supabase
        .from(ORDERS_TABLE)
        .select('*')
        .eq('location', locationId)
        .gte('timestamp', start)
        .lt('timestamp', end);

    if (error) throw new Error(error?.message || 'Could not read orders from Supabase.');
    return data;
}

/**
 * One of today's orders at one location, read fresh — or `null` if it isn't
 * there. A row insert reaches Realtime one row at a time, but this reads the
 * whole order at once, so a station can print every item of a new ticket.
 *
 * @param {number} orderNumber
 * @param {number} locationId
 */
export async function getTodayOrder(orderNumber, locationId) {
    const { start, end } = dayBounds();
    const { data, error } = await supabase
        .from(ORDERS_TABLE)
        .select('*')
        .eq('orderNumber', orderNumber)
        .eq('location', locationId)
        .gte('timestamp', start)
        .lt('timestamp', end)
        .order('id');

    if (error) throw new Error(error.message);
    return data.length > 0 ? buildOrder(orderNumber, data) : null;
}

/**
 * Which rows today's ticket cache holds: the same day and location bounds
 * {@link getTodayOrderRows} reads with.
 *
 * @param {number} locationId
 * @returns {import('@/lib/orders/ticketCache').TicketScope}
 */
export function todayScope(locationId) {
    return { locationId, ...dayBounds() };
}

// Waits before replacing a dead live-updates channel: 1 s, 2 s, 5 s, then every 10 s.
const RESUBSCRIBE_DELAYS_MS = [1000, 2000, 5000, 10000];

/**
 * Live row changes to `orders` over Supabase Realtime, every location's — a
 * DELETE can't be filtered server-side, so the caller filters instead.
 *
 * Realtime doesn't replay changes missed while disconnected, so
 * `onSubscribed` runs after every join, the first and each reconnect: the
 * caller re-reads there to catch up.
 *
 * A channel that errors or times out is replaced with a fresh one, rather
 * than left to rejoin itself: the installed realtime-js tears every channel
 * down when its socket reconnects, so a channel that lost its connection
 * once would otherwise never hear another change.
 *
 * @param {{
 *   onChange: (change: { type: 'INSERT'|'UPDATE'|'DELETE', record: object, oldRecord: object }) => void,
 *   onSubscribed: () => void,
 * }} handlers
 * @returns {() => void} stops listening
 */
export function subscribeToOrderChanges({ onChange, onSubscribed }) {
    let channel = null;
    let retryTimer = null;
    let failures = 0;
    let stopped = false;

    const open = async () => {
        retryTimer = null;
        // Removed and waited for first: with no channels left the socket
        // closes, so the new channel starts on a fresh connection instead of
        // the broken one.
        const old = channel;
        channel = null;
        if (old) await supabase.removeChannel(old);
        if (stopped) return;
        const current = supabase
            // Unique, so two screens in one tab never share (and close) a channel.
            .channel(`orders-web-${newOrderUuid()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: ORDERS_TABLE }, (payload) =>
                onChange({ type: payload.eventType, record: payload.new, oldRecord: payload.old })
            );
        channel = current;
        current.subscribe((status, error) => {
            // A replaced channel reports CLOSED as it goes; that's expected.
            if (stopped || current !== channel) return;
            if (status === 'SUBSCRIBED') {
                failures = 0;
                clearTimeout(retryTimer);
                retryTimer = null;
                onSubscribed();
            } else if (!retryTimer) {
                const delay = RESUBSCRIBE_DELAYS_MS[Math.min(failures, RESUBSCRIBE_DELAYS_MS.length - 1)];
                failures += 1;
                console.warn(`Live order updates ${status}; reconnecting in ${delay / 1000} s.`, error ?? '');
                retryTimer = setTimeout(open, delay);
            }
        });
    };

    open();
    return () => {
        stopped = true;
        clearTimeout(retryTimer);
        if (channel) supabase.removeChannel(channel);
        channel = null;
    };
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
 * `numberSource` saying where its ticket number came from and `rows` the
 * saved rows themselves (for lib/orders/ticketCache.js).
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
    return { ...buildOrder(orderNumber, data), numberSource, rows: data };
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
