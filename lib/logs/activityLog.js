// The activity log the iPad app writes to Supabase (`activity_log`, see
// supabase/migrations/20261014120000_activity_log.sql), as the staff page
// /admin/logs and its API route read it: query parsing, row shaping, merging
// live updates, and CSV export.
//
// Relative imports only, so `node --test` can load this file.

import { zonedParts, zonedTimeToUtc } from '../online/shopTime.js';

export const CATEGORIES = [
    { id: 'printer', label: 'Printer' },
    { id: 'reader', label: 'Card reader' },
    { id: 'payment', label: 'Payments' },
    { id: 'order', label: 'Orders' },
    { id: 'station', label: 'Stations' },
    { id: 'sync', label: 'Order sync' },
    { id: 'app', label: 'App' },
];

/** Level filter choices, each the set of levels it shows. */
export const LEVEL_FILTERS = {
    all: { label: 'Everything', levels: null },
    issues: { label: 'Warnings & errors', levels: ['warning', 'error'] },
    errors: { label: 'Errors only', levels: ['error'] },
};

export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 1000;
/** Most rows one CSV download carries. */
export const CSV_LIMIT = 20000;
/**
 * How far back before the newest row it has seen a live poll looks again.
 * `received_at` is stamped when an insert starts, so a batch still being
 * written when the page last polled can land with an earlier stamp than rows
 * the page already has. Re-reading a short overlap catches those; merging by
 * id drops the repeats.
 */
export const LIVE_OVERLAP_MS = 15000;

export const COLUMNS =
    'id, created_at, received_at, source, device_id, device_name, app_version, session_id, location, level, category, message, details';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEVICE_RE = /^[A-Za-z0-9-]{1,64}$/;

/** 'YYYY-MM-DD' for a {year, month, day}. */
const dayKey = ({ year, month, day }) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** Today's 'YYYY-MM-DD' on the shop's calendar. */
export const todayKey = (now, timeZone) => dayKey(zonedParts(now, timeZone));

/** [from, to) ISO instants of a shop-calendar day, or null for a bad day. */
export function dayBounds(day, timeZone) {
    const match = DAY_RE.exec(day ?? '');
    if (!match) return null;
    const [year, month, date] = match.slice(1).map(Number);
    const check = new Date(Date.UTC(year, month - 1, date));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) return null;
    const next = new Date(Date.UTC(year, month - 1, date + 1));
    return {
        from: zonedTimeToUtc({ year, month, day: date }, timeZone).toISOString(),
        to: zonedTimeToUtc(
            { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() },
            timeZone
        ).toISOString(),
    };
}

/**
 * Search text made safe to put inside a PostgREST `or=(…)` filter: the
 * characters that filter syntax uses are dropped rather than escaped.
 */
export function cleanSearch(text) {
    return String(text ?? '')
        .replace(/[,()*"\\:%]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);
}

/**
 * The PostgREST `or` filter for a search: the message contains the text, or
 * — when it's a number — the entry is about that order.
 */
export function searchFilter(search) {
    const parts = [`message.ilike.*${search}*`];
    if (/^\d{1,6}$/.test(search)) parts.push(`details->>order.eq.${search}`);
    return parts.join(',');
}

/**
 * Validates the page's query string. Returns `{ query }` or `{ error }`.
 *
 * - `day`: 'YYYY-MM-DD' on the shop's calendar (default today)
 * - `since`: ISO time; only rows that reached the database after it (live polling)
 * - `level`: a LEVEL_FILTERS key · `category` · `device` · `q` (search) · `limit`
 * - `format=csv`: a download instead of JSON
 */
export function parseLogQuery(params, { timeZone, now = new Date() }) {
    const get = (name) => (params.get(name) ?? '').trim();

    const day = get('day') || todayKey(now, timeZone);
    const bounds = dayBounds(day, timeZone);
    if (!bounds) return { error: 'Pick a valid day (YYYY-MM-DD).' };

    let since = null;
    if (get('since')) {
        const at = Date.parse(get('since'));
        if (Number.isNaN(at)) return { error: '`since` must be a date and time.' };
        since = new Date(at - LIVE_OVERLAP_MS).toISOString();
    }

    const levelKey = get('level') || 'all';
    if (!LEVEL_FILTERS[levelKey]) return { error: 'Unknown level filter.' };

    const category = get('category') || null;
    if (category && !CATEGORIES.some((c) => c.id === category)) return { error: 'Unknown category.' };

    const device = get('device') || null;
    if (device && !DEVICE_RE.test(device)) return { error: 'Unknown device.' };

    const limitText = get('limit');
    const limit = limitText ? Number(limitText) : DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1) return { error: '`limit` must be a positive whole number.' };

    return {
        query: {
            day,
            ...bounds,
            since,
            levels: LEVEL_FILTERS[levelKey].levels,
            category,
            device,
            search: cleanSearch(get('q')) || null,
            limit: Math.min(limit, MAX_LIMIT),
            format: get('format') === 'csv' ? 'csv' : 'json',
        },
    };
}

/** A database row as the page uses it. */
export function entryFromRow(row) {
    return {
        id: row.id,
        createdAt: row.created_at,
        receivedAt: row.received_at,
        source: row.source,
        deviceId: row.device_id,
        deviceName: row.device_name ?? '',
        appVersion: row.app_version ?? '',
        sessionId: row.session_id ?? '',
        location: row.location ?? null,
        level: row.level,
        category: row.category,
        message: row.message,
        details: row.details ?? {},
    };
}

/** Newest first, by when it happened, then by id so ties keep one order. */
const newestFirst = (a, b) =>
    b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * Adds freshly polled entries to the ones on screen: no duplicates (live
 * polls overlap on purpose), newest first, at most `max`.
 */
export function mergeEntries(existing, incoming, max = MAX_LIMIT) {
    const byId = new Map(existing.map((e) => [e.id, e]));
    for (const entry of incoming) byId.set(entry.id, entry);
    return [...byId.values()].sort(newestFirst).slice(0, max);
}

/** The newest `receivedAt` among entries — where the next live poll starts. */
export function latestReceivedAt(entries) {
    let latest = null;
    for (const { receivedAt } of entries) {
        if (receivedAt && (!latest || Date.parse(receivedAt) > Date.parse(latest))) latest = receivedAt;
    }
    return latest;
}

/** Short, readable name for the device an entry came from. */
export function deviceLabel(entry) {
    const model = entry.deviceName || (entry.source === 'web' ? 'Web' : 'iPad');
    return `${model} · ${String(entry.deviceId).slice(0, 4)}`;
}

/** Details as `key=value; key=value`, keys sorted. */
export function formatDetails(details) {
    return Object.keys(details ?? {})
        .sort()
        .map((key) => `${key}=${details[key]}`)
        .join('; ');
}

/** 'YYYY-MM-DD HH:MM:SS' of an instant on the shop's clock. */
export function shopTimestamp(iso, timeZone) {
    const p = zonedParts(new Date(iso), timeZone);
    const two = (n) => String(n).padStart(2, '0');
    return `${dayKey(p)} ${two(p.hour)}:${two(p.minute)}:${two(p.second)}`;
}

const csvCell = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The entries as a CSV file, times on the shop's clock. */
export function toCsv(entries, timeZone) {
    const header = ['time', 'level', 'category', 'message', 'details', 'device', 'device_id', 'app_version', 'session_id'];
    const rows = entries.map((e) => [
        shopTimestamp(e.createdAt, timeZone),
        e.level,
        e.category,
        e.message,
        formatDetails(e.details),
        e.deviceName,
        e.deviceId,
        e.appVersion,
        e.sessionId,
    ]);
    return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
