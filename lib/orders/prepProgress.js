// Station progress (each unit's stage, e.g. a corndog's frying → done) on
// this device, saved in the browser's localStorage so a reload, a restart or
// the phone switching off doesn't lose it. Never sent anywhere: each device
// tracks what it is making, the same as the iPhone app's PrepProgress.
//
// Kept free of React so it can be unit tested under plain `node --test`; the
// hook lives in usePrepProgress.js.

export const PREP_STORAGE_KEY = 'moonteaPrepProgress';

/**
 * The local calendar day, so progress starts fresh each day.
 *
 * @param {Date} [date]
 * @returns {string} YYYY-MM-DD
 */
export function dayKey(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Saved text → stages by row id. Anything unreadable, or another day's
 * progress, gives an empty map rather than throwing.
 *
 * @param {string|null} raw
 * @param {string} today
 * @returns {Record<string, string>}
 */
export function parseStages(raw, today) {
    if (!raw) return {};
    try {
        const saved = JSON.parse(raw);
        const byRow = saved?.byRow;
        const isMap = byRow !== null && typeof byRow === 'object' && !Array.isArray(byRow);
        return saved?.day === today && isMap ? byRow : {};
    } catch {
        return {};
    }
}

/**
 * @param {Record<string, string>} byRow
 * @param {string} today
 * @returns {string}
 */
export function serializeStages(byRow, today) {
    return JSON.stringify({ day: today, byRow });
}

/**
 * @param {Record<string, string>} byRow
 * @param {string} rowId
 * @param {string} stage
 * @returns {Record<string, string>} a new map; `byRow` is untouched
 */
export function withStage(byRow, rowId, stage) {
    return { ...byRow, [rowId]: stage };
}
