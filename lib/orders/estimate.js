// "When will my order be ready?" for the customer self-order confirmation
// screen and the text/WhatsApp message sent after checkout.
//
// This is deliberately a rough estimate, not a promise: stations don't report
// real-time load anywhere the web app can read, so this only ever sees the
// cart being placed and how many other orders were placed recently.
//
// Relative import so this stays testable under plain `node --test`.
import { categoryFor, DEFAULT_PREP_MINUTES } from '../menu/catalog.js';

// Time to take payment and start the first drink/food moving, on top of
// whichever station ends up busiest.
const BASE_MINUTES = 3;

// Each other order placed recently adds a little queue delay, capped so a
// sudden rush doesn't quote an hour.
const PER_QUEUED_ORDER_MINUTES = 1.5;
const MAX_QUEUE_BONUS_MINUTES = 15;

/**
 * Total prep minutes per station (catalog category) for this cart. Stations
 * work in parallel — the drink station and the corndog fryer don't wait on
 * each other — so the cart's ETA is driven by whichever station has the most
 * work, not the sum of everything.
 *
 * @param {Array<{type: string, quantity?: number}>} cartItems
 * @returns {Map<string, number>} minutes of work per category key
 */
export function stationMinutesFor(cartItems) {
    const perStation = new Map();
    for (const item of cartItems) {
        const minutes = categoryFor(item.type)?.prepMinutes ?? DEFAULT_PREP_MINUTES;
        const qty = Math.max(item.quantity ?? 1, 1);
        perStation.set(item.type, (perStation.get(item.type) ?? 0) + minutes * qty);
    }
    return perStation;
}

/** Extra minutes from other orders placed recently, capped. */
export function estimateQueueDelayMinutes(recentOrderCount = 0) {
    return Math.min(Math.max(recentOrderCount, 0) * PER_QUEUED_ORDER_MINUTES, MAX_QUEUE_BONUS_MINUTES);
}

/**
 * Minutes until this cart should be ready, rounded to a whole minute for
 * display. `recentOrderCount` is however many other orders are already ahead
 * of it — see `getRecentOrderCount` in lib/db.js.
 *
 * @param {Array<{type: string, quantity?: number}>} cartItems
 * @param {number} recentOrderCount
 * @returns {number}
 */
export function estimateReadyMinutes(cartItems, recentOrderCount = 0) {
    if (cartItems.length === 0) return 0;
    const busiestStation = Math.max(0, ...stationMinutesFor(cartItems).values());
    return Math.round(BASE_MINUTES + busiestStation + estimateQueueDelayMinutes(recentOrderCount));
}

/**
 * `estimateReadyMinutes` plus the clock time it resolves to, for the
 * confirmation screen ("ready around 3:42 PM") and the `estimated_ready_at`
 * column written alongside the order.
 *
 * @returns {{ minutes: number, readyAt: Date }}
 */
export function estimateReadyAt(cartItems, recentOrderCount = 0, now = new Date()) {
    const minutes = estimateReadyMinutes(cartItems, recentOrderCount);
    return { minutes, readyAt: new Date(now.getTime() + minutes * 60000) };
}
