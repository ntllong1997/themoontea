// Canonical payment buckets for reporting.
//
// The two clients disagree on what they write to `orders.paymentMethod`: the
// iPad writes "Cash" / "CashApp" / "Card", the web till writes lowercase
// "cash", the online page writes "online", and older rows have null. Reports
// must not show "Cash" and "cash" as separate lines, and must not quietly drop
// the unattributed rows — so everything is folded into one of these buckets and
// UNRECORDED catches the rest, keeping per-category figures reconcilable with
// the grand total.

/** @typedef {{ key: string, label: string, aliases: string[] }} PaymentBucket */

/** Bucket for a row whose method is missing or unrecognised. */
export const UNRECORDED = { key: 'Other', label: 'Other', aliases: [] };

/** @type {PaymentBucket[]} */
export const PAYMENT_METHODS = [
    { key: 'Cash', label: 'Cash', aliases: ['cash'] },
    { key: 'Card', label: 'Credit Card', aliases: ['card', 'credit', 'creditcard', 'credit card'] },
    { key: 'CashApp', label: 'Cash App', aliases: ['cashapp', 'cash app'] },
];

/** Every bucket a report can show, in column order. */
export const PAYMENT_BUCKETS = [...PAYMENT_METHODS, UNRECORDED];

const BY_ALIAS = new Map(
    PAYMENT_METHODS.flatMap((bucket) =>
        [bucket.key.toLowerCase(), ...bucket.aliases].map((alias) => [alias, bucket.key])
    )
);

/**
 * Fold a stored `paymentMethod` into a canonical bucket key.
 *
 * "online" is NOT treated as Cash App: the online page takes no payment, so
 * counting it there would overstate Cash App revenue. It falls to Other.
 *
 * @param {string|null|undefined} raw
 * @returns {string} a key from PAYMENT_BUCKETS
 */
export function normalizePaymentMethod(raw) {
    if (typeof raw !== 'string') return UNRECORDED.key;
    const normalized = raw.trim().toLowerCase();
    if (normalized === '') return UNRECORDED.key;
    return BY_ALIAS.get(normalized) ?? UNRECORDED.key;
}

/**
 * Revenue per category per payment bucket.
 *
 * @param {Array<{type: string, price: number, paymentMethod: string|null}>} items one entry per unit
 * @param {(price: number) => number} withTax how to turn a unit price into revenue
 * @returns {Map<string, {total: number, byMethod: Record<string, number>}>} keyed by category
 */
export function summarizeByCategoryAndPayment(items, withTax) {
    const emptyRow = () => Object.fromEntries(PAYMENT_BUCKETS.map((bucket) => [bucket.key, 0]));

    const rows = new Map();

    for (const item of items) {
        const category = item.type ?? UNRECORDED.key;
        if (!rows.has(category)) rows.set(category, { total: 0, byMethod: emptyRow() });

        const revenue = withTax(Number(item.price ?? 0));
        const bucket = normalizePaymentMethod(item.paymentMethod);

        const row = rows.get(category);
        row.byMethod[bucket] += revenue;
        row.total += revenue;
    }

    return rows;
}
