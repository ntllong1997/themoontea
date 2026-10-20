// Ticket payment changes made on the website: pay, cancel, and corrections to
// a paid or cancelled ticket. Pure, so it can be unit tested directly.
//
// Mirrors the iPhone app (OrderViewModel+Tickets.swift) exactly, because both
// write the same columns on the same rows: each change is one PATCH of every
// row sharing the ticket's `order_uuid`, carrying the whole payment state plus
// the ticket's payment log with one line appended ("Cash → Card, Till B,
// 2:14 PM"). Only tickets with an `order_uuid` can be changed; older tickets
// have none and stay as they are.

/** @typedef {'pending'|'paid'|'cancelled'} OrderStatus */
/** @typedef {'pay'|'cancel'|'markUnpaid'|'restore'|'changeMethod'} PaymentAction */
/** @typedef {{ at: string, till: string, from: string, to: string }} PaymentLogEntry */
/**
 * @typedef {{
 *   orderUuid: string|null,
 *   status: OrderStatus,
 *   paymentMethod: string,
 *   paidAt: string|null,
 *   squarePaymentId: string|null,
 *   paymentLog: PaymentLogEntry[]|null,
 * }} Ticket
 */
/**
 * @typedef {{
 *   status: OrderStatus,
 *   paymentMethod: string|null,
 *   paid_at: string|null,
 *   square_payment_id: string|null,
 *   payment_log: PaymentLogEntry[],
 * }} PaymentPatch
 */

/** How the ticket card and payment log name each state — the app's wording. */
const STATUS_LABELS = { pending: 'Unpaid', paid: 'Paid', cancelled: 'Cancelled' };

/** Stored `paymentMethod` value -> how it reads. Same as the app's `PaymentMethod`. */
const METHOD_LABELS = { Cash: 'Cash', CashApp: 'Cash App', Card: 'Card' };

/**
 * The website's payment buttons. There is no card reader here, so a card is
 * charged in the Square app and only confirmed on the website.
 */
export const PAY_CHOICES = [
    { method: 'Card', title: 'Card', hint: 'Charge it in the Square app first, then confirm here.' },
    { method: 'Cash', title: 'Cash', hint: 'Only confirm once you have the money.' },
    { method: 'CashApp', title: 'Cash App', hint: 'Only confirm once you have the money.' },
];

/** The methods a paid ticket can be corrected to. */
export const PAYMENT_METHOD_KEYS = Object.keys(METHOD_LABELS);

/** @param {string|null|undefined} method */
export const methodLabel = (method) => METHOD_LABELS[method] ?? method ?? '';

/**
 * "Unpaid", "Cancelled", or how a paid ticket was paid ("Cash App").
 *
 * @param {Ticket} ticket
 * @returns {string}
 */
export function paymentStateLabel({ status, paymentMethod }) {
    if (status !== 'paid') return STATUS_LABELS[status] ?? status;
    return methodLabel(paymentMethod) || STATUS_LABELS.paid;
}

/** @param {Ticket} ticket */
export const canChangePayment = (ticket) => Boolean(ticket.orderUuid);

/**
 * Charged on an iPhone's card reader, so the money really moved in Square and
 * correcting it here does not refund it.
 *
 * @param {Ticket} ticket
 */
export const isChargedOnReader = ({ status, paymentMethod, squarePaymentId }) =>
    status === 'paid' && paymentMethod === 'Card' && Boolean(squarePaymentId);

function assertMethod(method) {
    if (!PAYMENT_METHOD_KEYS.includes(method)) {
        throw new Error(`Unknown payment method "${method}".`);
    }
}

/**
 * The state each action moves a ticket to, or null when the ticket isn't in
 * the state the action starts from (e.g. another phone paid it first).
 */
const TRANSITIONS = {
    pay: (ticket, method, now) => {
        assertMethod(method);
        if (ticket.status !== 'pending') return null;
        // Any id from an earlier reader charge that was marked unpaid is
        // dropped, so only this payment decides the "really charged" warning.
        return { status: 'paid', method, paidAt: now, squarePaymentId: null };
    },
    cancel: (ticket) =>
        ticket.status === 'pending'
            ? { status: 'cancelled', method: null, paidAt: null, squarePaymentId: ticket.squarePaymentId }
            : null,
    markUnpaid: (ticket) =>
        ticket.status === 'paid'
            ? { status: 'pending', method: null, paidAt: null, squarePaymentId: ticket.squarePaymentId }
            : null,
    restore: (ticket) =>
        ticket.status === 'cancelled'
            ? { status: 'pending', method: null, paidAt: null, squarePaymentId: ticket.squarePaymentId }
            : null,
    changeMethod: (ticket, method) => {
        assertMethod(method);
        if (ticket.status !== 'paid' || ticket.paymentMethod === method) return null;
        return { status: 'paid', method, paidAt: ticket.paidAt, squarePaymentId: ticket.squarePaymentId };
    },
};

/**
 * The PATCH body for one payment action, or null when it no longer applies.
 *
 * @param {Ticket} ticket
 * @param {PaymentAction} action
 * @param {{ method?: string, till: string, now?: Date }} options
 * @returns {PaymentPatch|null}
 */
export function paymentPatch(ticket, action, { method, till, now = new Date() }) {
    const transition = TRANSITIONS[action];
    if (!transition) throw new Error(`Unknown payment action "${action}".`);

    const nowIso = now.toISOString();
    const next = transition(ticket, method, nowIso);
    if (!next || !canChangePayment(ticket)) return null;

    const to = next.status === 'paid' ? methodLabel(next.method) : STATUS_LABELS[next.status];
    const log = Array.isArray(ticket.paymentLog) ? ticket.paymentLog : [];

    return {
        status: next.status,
        paymentMethod: next.method,
        paid_at: next.paidAt,
        square_payment_id: next.squarePaymentId ?? null,
        payment_log: [...log, { at: nowIso, till, from: paymentStateLabel(ticket), to }],
    };
}

/** The History tab's filters. History never shows unpaid tickets. */
export const HISTORY_FILTERS = [
    { key: 'all', title: 'All', matches: (status) => status !== 'pending' },
    { key: 'paid', title: 'Paid', matches: (status) => status === 'paid' },
    { key: 'cancelled', title: 'Cancelled', matches: (status) => status === 'cancelled' },
];

/**
 * Whether a ticket belongs on a list: Tickets is the unpaid work list,
 * History the day's paid and cancelled tickets — the same split as the app.
 *
 * @param {OrderStatus} status
 * @param {'tickets'|'history'} list
 * @param {'all'|'paid'|'cancelled'} [filter] History only
 */
export function isInList(status, list, filter = 'all') {
    if (list === 'tickets') return status === 'pending';
    const historyFilter = HISTORY_FILTERS.find((f) => f.key === filter) ?? HISTORY_FILTERS[0];
    return historyFilter.matches(status);
}

/**
 * The ticket as it reads once the patch is saved, without touching the
 * original — so the page can show the change before the next fetch.
 *
 * @template {Ticket} T
 * @param {T} ticket
 * @param {PaymentPatch} patch
 * @returns {T}
 */
export function applyPaymentPatch(ticket, patch) {
    return {
        ...ticket,
        status: patch.status,
        paymentMethod: patch.paymentMethod ?? '',
        paidAt: patch.paid_at,
        squarePaymentId: patch.square_payment_id,
        paymentLog: patch.payment_log,
    };
}
