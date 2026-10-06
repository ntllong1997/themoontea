// When online ordering is open: only during a scheduled pop-up, on the shop's
// clock, and only for a pop-up that has a location pin (so "are you nearby?"
// has something to measure against). No imports beyond ./shopTime.js.
import { shopDateKey, shopTimeOfDay } from './shopTime.js';

/** Ordering closes this many minutes before the pop-up ends, so the last order can be made. */
export const LAST_ORDER_MINUTES_BEFORE_END = 15;

const minutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

/**
 * The pop-up taking online orders right now, or null; plus the next one, so
 * a closed page can say when to come back.
 *
 * @param {Array<{ date: string, start: string, end: string, latitude?: number|null }>} popups
 */
export function onlineOrderingWindow(popups, now, timeZone) {
    const today = shopDateKey(now, timeZone);
    const nowMinutes = minutes(shopTimeOfDay(now, timeZone));
    const sorted = [...popups].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

    const open = sorted.find(
        (p) =>
            p.date === today &&
            minutes(p.start) <= nowMinutes &&
            nowMinutes < minutes(p.end) - LAST_ORDER_MINUTES_BEFORE_END
    );
    const next = sorted.find((p) => p.date > today || (p.date === today && minutes(p.start) > nowMinutes)) ?? null;

    if (!open) return { open: null, next, reason: 'closed' };
    if (open.latitude == null || open.longitude == null) return { open: null, next, reason: 'no_location', popup: open };
    return { open, next, reason: 'open' };
}
