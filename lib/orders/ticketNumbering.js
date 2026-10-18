// How the website gets a ticket number.
//
// With no main phone set up (a normal shop day) the database counter numbers
// the order, as always. At an event the booth's main phone (iPhone app) is in
// charge of every number: the website asks it through the database and waits
// a few seconds. If it doesn't answer (no signal, app closed), the website
// gives up on the request and numbers the order from its own sequence
// starting at 1000, which can never clash with the phone's numbers.
//
// Kept free of Supabase so it can be unit tested; lib/db.js supplies the calls.

/** Where the website's own sequence starts when the main phone is silent. */
export const FALLBACK_START = 1000;

/** How long the website waits for the main phone. */
export const MAIN_PHONE_WAIT_MS = 8000;

/** How often the website checks whether the main phone has answered. */
export const MAIN_PHONE_POLL_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks `fetchNumber` until it returns a number or `timeoutMs` passes. A
 * failed check (a dropped request) just waits for the next one.
 *
 * @param {{ fetchNumber: () => Promise<number|null>, timeoutMs?: number, pollMs?: number }} params
 * @returns {Promise<number|null>}
 */
export async function waitForNumber({ fetchNumber, timeoutMs = MAIN_PHONE_WAIT_MS, pollMs = MAIN_PHONE_POLL_MS }) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const number = await fetchNumber();
            if (Number.isInteger(number)) return number;
        } catch (err) {
            console.error('[ticket number] check failed:', err);
        }
        await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
    }
    return null;
}

/**
 * @param {{
 *   hasMainPhone: boolean,
 *   nextFromCounter: () => Promise<number>,
 *   askMainPhone: () => Promise<number|null>,
 *   abandonRequest: () => Promise<number|null>,
 *   nextFallback: () => Promise<number>,
 * }} steps
 * @returns {Promise<{ number: number, source: 'counter'|'mainPhone'|'fallback' }>}
 */
export async function resolveTicketNumber({ hasMainPhone, nextFromCounter, askMainPhone, abandonRequest, nextFallback }) {
    if (!hasMainPhone) return { number: await nextFromCounter(), source: 'counter' };

    const answered = await askMainPhone();
    if (Number.isInteger(answered)) return { number: answered, source: 'mainPhone' };

    // Giving up is atomic: if the phone answered at the last moment, that
    // number is returned instead, so an order never gets two numbers and the
    // phone's sequence never skips one.
    const late = await abandonRequest();
    if (Number.isInteger(late)) return { number: late, source: 'mainPhone' };

    return { number: await nextFallback(), source: 'fallback' };
}
