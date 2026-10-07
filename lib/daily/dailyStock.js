// The end-of-day stock check and the Today board.
//
// At closing, staff count a short list of items. Each item has a target:
//   - a 'make' item (made in the shop: boba, jelly, batter…) under its target
//     goes on tomorrow's make list, for the difference;
//   - a 'buy' item (a supply: cups, milk…) under its target is running low.
// A target of 0 means just count it; it's never flagged.
//
// The make list, and anything else staff are asked to do, become tasks on the
// Today board (/today). A task stays on the board until someone ticks it off.
// A new check replaces the make list that isn't done yet, since the new count
// is the truth.
//
// Dates are 'YYYY-MM-DD' on the shop's calendar. Relative imports only, so
// `node --test` and the pages can both load this file.
import { addDays, isDateKey } from '../schedule/schedule.js';
import { shopDateKey, zonedParts } from '../online/shopTime.js';

export const KINDS = ['make', 'buy'];

/**
 * The shop's day ends at 4am, not midnight: a close that runs past midnight
 * still counts for that night, and its make list is still for "tomorrow".
 */
export const DAY_ENDS_AT_HOUR = 4;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_COUNT = 100000;
const text = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** A whole number 0 or more (typed or not), or null. */
export function toCount(value) {
    const n = typeof value === 'string' ? (value.trim() === '' ? NaN : Number(value)) : value;
    return Number.isInteger(n) && n >= 0 && n <= MAX_COUNT ? n : null;
}

/** The shop day an instant falls on: the shop's date, rolling over at 4am. */
export function shopDay(now, timeZone) {
    const key = shopDateKey(now, timeZone);
    return zonedParts(now, timeZone).hour < DAY_ENDS_AT_HOUR ? addDays(key, -1) : key;
}

/**
 * 3, 'tubs' -> '3 tubs'; 1, 'tubs' -> '1 tub'; 1, 'batches' -> '1 batch'.
 * Units are whatever staff typed, so only plain plurals are made singular.
 */
export function amount(n, unit) {
    if (!unit) return String(n);
    let word = unit;
    if (n === 1 && !/ss$/i.test(unit)) word = /(ch|sh|x)es$/i.test(unit) ? unit.slice(0, -2) : unit.replace(/s$/i, '');
    return `${n} ${word}`;
}

// ── rows ─────────────────────────────────────────────────────────────────────

/** A `daily_stock_items` row -> the shape the pages use. */
export const itemFromRow = (row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    unit: row.unit || null,
    target: row.target ?? 0,
});

/** A `daily_tasks` row -> the shape the pages use. */
export const taskFromRow = (row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    quantity: row.quantity ?? null,
    unit: row.unit || null,
    itemId: row.item_id ?? null,
    forDate: row.for_date,
    note: row.note || null,
    addedBy: row.added_by || null,
    doneAt: row.done_at ?? null,
    doneBy: row.done_by || null,
    createdAt: row.created_at,
});

/** A `daily_stock_checks` row -> the shape the pages use. */
export const checkFromRow = (row) => ({
    id: row.id,
    date: row.check_date,
    employeeName: row.employee_name,
    note: row.note || null,
    submittedAt: row.submitted_at,
    counts: Array.isArray(row.counts) ? row.counts : [],
});

// ── the check ────────────────────────────────────────────────────────────────

/**
 * Items + counts ({ [itemId]: n }) -> what to make and what's running low.
 *   make: [{ ...item, count, quantity }]  quantity = target - count
 *   low:  [{ ...item, count, out }]       out = nothing left
 * Items without a count, or with a target of 0, are never flagged.
 */
export function planFromCounts(items, counts) {
    const make = [];
    const low = [];
    for (const item of items) {
        const count = toCount(counts?.[item.id]);
        if (count === null || !(item.target > 0) || count >= item.target) continue;
        if (item.kind === 'make') make.push({ ...item, count, quantity: item.target - count });
        else low.push({ ...item, count, out: count === 0 });
    }
    return { make, low };
}

/** What a saved check said: its snapshot run through the same rules. */
export function planFromCheck(check) {
    const items = check.counts.map((c) => ({ id: c.itemId, name: c.name, kind: c.kind, unit: c.unit ?? null, target: c.target ?? 0 }));
    const counts = Object.fromEntries(check.counts.map((c) => [c.itemId, c.count]));
    return planFromCounts(items, counts);
}

/** The `counts` snapshot saved with a check. */
export const checkSnapshot = (items, counts) =>
    items.map((item) => ({ itemId: item.id, name: item.name, kind: item.kind, unit: item.unit, target: item.target, count: counts[item.id] }));

/** A check's make list -> `daily_tasks` rows, for the day after the check. */
export const makeTaskRows = (make, { checkId, checkDate, by }) =>
    make.map((item) => ({
        kind: 'make',
        title: item.name,
        quantity: item.quantity,
        unit: item.unit,
        item_id: item.id,
        check_id: checkId,
        for_date: addDays(checkDate, 1),
        added_by: by,
    }));

// ── checking what staff typed ────────────────────────────────────────────────

/** The item form -> { values } for `daily_stock_items`, or { error }. */
export function parseItemInput(body) {
    if (!body || typeof body !== 'object') return { error: 'Nothing to save' };
    const name = text(body.name, 80);
    if (!name) return { error: 'Enter the item name' };
    if (!KINDS.includes(body.kind)) return { error: 'Pick made in-house or supply' };
    const target = body.target === '' || body.target == null ? 0 : toCount(body.target);
    if (target === null) return { error: 'The target must be a whole number, 0 or more' };
    return { values: { name, kind: body.kind, unit: text(body.unit, 30) || null, target } };
}

/**
 * A finished check -> { values }, or { error }. Every item on the list needs a
 * count, so the make list and running-low list are never missing anything.
 */
export function parseCheckInput(body, items) {
    if (!body || typeof body !== 'object') return { error: 'Nothing to save' };
    const employeeName = text(body.employeeName, 60);
    if (!employeeName) return { error: 'Sign in first' };
    const employeeId = typeof body.employeeId === 'string' && UUID.test(body.employeeId) ? body.employeeId : null;
    if (items.length === 0) return { error: 'Add the items to count first' };
    const given = body.counts && typeof body.counts === 'object' ? body.counts : {};
    const counts = {};
    const missing = [];
    for (const item of items) {
        const count = toCount(given[item.id]);
        if (count === null) missing.push(item.name);
        else counts[item.id] = count;
    }
    if (missing.length) {
        const more = missing.length > 3 ? ` and ${missing.length - 3} more` : '';
        return { error: `Count every item first: ${missing.slice(0, 3).join(', ')}${more}` };
    }
    return { values: { employeeId, employeeName, note: text(body.note, 200) || null, counts } };
}

/** The add-task form -> { values } for `daily_tasks`, or { error }. */
export function parseTaskInput(body, today) {
    if (!body || typeof body !== 'object') return { error: 'Nothing to save' };
    const title = text(body.title, 140);
    if (!title) return { error: 'Say what needs doing' };
    const forDate = text(body.forDate, 10) || today;
    if (!isDateKey(forDate)) return { error: 'Pick a day' };
    if (forDate < today) return { error: 'Pick today or a later day' };
    const addedBy = text(body.addedBy, 60);
    if (!addedBy) return { error: 'Pick your name first' };
    return { values: { kind: 'task', title, for_date: forDate, note: text(body.note, 200) || null, added_by: addedBy } };
}

// ── the Today board ──────────────────────────────────────────────────────────

const byCreated = (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
const makeFirst = (a, b) => (a.kind === b.kind ? 0 : a.kind === 'make' ? -1 : 1);

/**
 * Tasks -> the board for `today`:
 *   todo:     not done, for today or earlier (`carriedFrom` = the day it was for, if earlier)
 *   upcoming: not done, for a later day
 *   done:     ticked off today, newest first
 * Tasks done on an earlier day are left off.
 */
export function buildBoard(tasks, { today, timeZone }) {
    const todo = [];
    const upcoming = [];
    const done = [];
    for (const task of tasks) {
        if (task.doneAt) {
            if (shopDay(new Date(task.doneAt), timeZone) === today) done.push(task);
        } else if (task.forDate <= today) {
            todo.push({ ...task, carriedFrom: task.forDate < today ? task.forDate : null });
        } else {
            upcoming.push(task);
        }
    }
    todo.sort((a, b) => makeFirst(a, b) || a.forDate.localeCompare(b.forDate) || byCreated(a, b));
    upcoming.sort((a, b) => a.forDate.localeCompare(b.forDate) || makeFirst(a, b) || byCreated(a, b));
    done.sort((a, b) => b.doneAt.localeCompare(a.doneAt));
    return { todo, upcoming, done };
}
