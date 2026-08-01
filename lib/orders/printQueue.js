/**
 * Shapes for the `print_jobs` queue that feeds the receipt-printer bridge.
 *
 * Pure on purpose: every function here is a value transform, so the queue's
 * rules (identity, retry ceiling, reap window) are testable without a database
 * or a printer. The PostgREST calls live in `lib/db.js`.
 *
 * See supabase/migrations/20260801120000_add_print_jobs_queue.sql for why the
 * job identity is (order_number, order_timestamp) rather than a day bucket.
 */

export const PRINT_JOB_STATUS = Object.freeze({
    PENDING: 'pending',
    CLAIMED: 'claimed',
    PRINTED: 'printed',
    FAILED: 'failed',
});

/**
 * How long a claim may be held before another device may take the job. Long
 * enough that a slow printer is never stolen from mid-print, short enough that
 * a device dying at the till does not strand a customer's receipt.
 */
export const STALE_CLAIM_MS = 2 * 60 * 1000;

/** Retry ceiling, so one poisoned job cannot cycle through the queue forever. */
export const MAX_PRINT_ATTEMPTS = 5;

const UNKNOWN_DEVICE = 'unknown';

function describeError(error) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return 'Unknown print failure';
    }
}

/**
 * One queue row for an order that has just been written.
 *
 * `timestamp` must be the exact value the order's line rows carry — it is half
 * the unique key, and the bridge matches line rows back by equality on it.
 *
 * @param {{ orderNumber: number, timestamp: string }} params
 * @returns {{ order_number: number, order_timestamp: string }}
 */
export function buildPrintJob({ orderNumber, timestamp }) {
    if (!Number.isInteger(orderNumber) || orderNumber <= 0) {
        throw new Error(
            `Cannot enqueue a print job for order number ${String(orderNumber)}.`,
        );
    }
    if (typeof timestamp !== 'string' || timestamp.trim() === '') {
        throw new Error('Cannot enqueue a print job without an order timestamp.');
    }

    return { order_number: orderNumber, order_timestamp: timestamp };
}

/**
 * The patch a device sends to take ownership of a pending job. Paired with an
 * `eq('status', 'pending')` filter this is the atomic claim: a second device
 * matches zero rows and backs off.
 */
export function buildClaimPatch({ deviceName, now = new Date() }) {
    return {
        status: PRINT_JOB_STATUS.CLAIMED,
        claimed_by: deviceName?.trim() || UNKNOWN_DEVICE,
        claimed_at: now.toISOString(),
    };
}

/**
 * Applied only after the printer transport confirms — never at enqueue time.
 * Marking early would let an app reinstall drop a receipt the database
 * believes was printed.
 */
export function buildPrintedPatch({ now = new Date() } = {}) {
    return {
        status: PRINT_JOB_STATUS.PRINTED,
        printed_at: now.toISOString(),
        last_error: null,
    };
}

/**
 * Releases a failed job back to the queue, or retires it once it has burned
 * through {@link MAX_PRINT_ATTEMPTS}.
 */
export function buildFailurePatch({ error, attempts = 0 }) {
    const nextAttempts = attempts + 1;
    const exhausted = nextAttempts >= MAX_PRINT_ATTEMPTS;

    return {
        status: exhausted ? PRINT_JOB_STATUS.FAILED : PRINT_JOB_STATUS.PENDING,
        attempts: nextAttempts,
        last_error: describeError(error),
        claimed_by: null,
        claimed_at: null,
    };
}

/**
 * True when a claimed job has been held too long and may be reclaimed.
 *
 * A claimed row with no `claimed_at` is treated as stale rather than left
 * stuck: the alternative is a receipt nobody can ever pick up.
 */
export function isStaleClaim(job, { now = new Date(), timeoutMs = STALE_CLAIM_MS } = {}) {
    if (job?.status !== PRINT_JOB_STATUS.CLAIMED) return false;
    if (!job.claimed_at) return true;

    const claimedAt = Date.parse(job.claimed_at);
    if (Number.isNaN(claimedAt)) return true;

    return now.getTime() - claimedAt >= timeoutMs;
}
