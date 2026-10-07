// The store's staff schedule: who works when.
//
// A shift either repeats every week (Mondays 10–4, from a start date, maybe
// until an end date) or happens once on a date. A weekly shift can skip single
// days (changed or removed for just that day), and days off hide all of that
// person's shifts on those days. `expandShifts` turns all of that into the
// actual workdays for a range of dates: the week view and each employee's
// calendar feed both come from it.
//
// Dates are 'YYYY-MM-DD' on the shop's calendar and times 'HH:MM'. No imports,
// so `node --test` and the page can both load this file.

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');

// ── dates ────────────────────────────────────────────────────────────────────
// 'YYYY-MM-DD' strings, done in UTC so no time zone can shift the day.

const toUtc = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);

export const isDateKey = (key) => typeof key === 'string' && DATE.test(key) && fromUtc(toUtc(key)) === key;
export const addDays = (key, days) => fromUtc(toUtc(key) + days * 86400000);
/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (key) => new Date(toUtc(key)).getUTCDay();
/** The Monday on or before a date (weeks run Monday to Sunday). */
export const weekStart = (key) => addDays(key, -((weekdayOf(key) + 6) % 7));
/** Every date from `from` to `to`, inclusive. */
export function datesBetween(from, to) {
    const dates = [];
    for (let day = from; day <= to; day = addDays(day, 1)) dates.push(day);
    return dates;
}
/** The first date on or after `from` that falls on `weekday`. */
export const nextWeekday = (from, weekday) => addDays(from, (weekday - weekdayOf(from) + 7) % 7);

// ── rows ─────────────────────────────────────────────────────────────────────

const hhmm = (time) => (time ? time.slice(0, 5) : time);

/** A `staff_shifts` row -> the shape the page and the feed use. */
export const shiftFromRow = (row) => ({
    id: row.id,
    employeeId: row.employee_id,
    repeat: row.repeat,
    weekday: row.weekday,
    startDate: row.start_date,
    endDate: row.end_date,
    date: row.date,
    start: hhmm(row.start_time),
    end: hhmm(row.end_time),
    note: row.note || null,
    skipDates: row.skip_dates ?? [],
});

/** A `staff_time_off` row -> the shape the page and the feed use. */
export const timeOffFromRow = (row) => ({
    id: row.id,
    employeeId: row.employee_id,
    startDate: row.start_date,
    endDate: row.end_date,
    note: row.note || null,
});

// ── checking what staff typed ────────────────────────────────────────────────

/**
 * The add-shift form -> { values } for `staff_shifts`, or { error } in words
 * staff will understand. A weekly shift repeats on the weekday of `date`,
 * starting that day.
 */
export function parseShiftInput(body) {
    if (!body || typeof body !== 'object') return { error: 'Nothing to save' };
    const employeeId = text(body.employeeId, 64);
    if (!employeeId) return { error: 'Pick who is working' };
    const date = text(body.date, 10);
    if (!isDateKey(date)) return { error: 'Pick a date' };
    const start = text(body.start, 5);
    const end = text(body.end, 5);
    if (!TIME.test(start) || !TIME.test(end)) return { error: 'Set a start and end time' };
    if (end <= start) return { error: 'The end time must be after the start time' };
    const note = text(body.note, 120) || null;
    const common = { employee_id: employeeId, start_time: start, end_time: end, note };
    if (body.weekly === true) {
        return { values: { ...common, repeat: 'weekly', weekday: weekdayOf(date), start_date: date, end_date: null, date: null } };
    }
    return { values: { ...common, repeat: 'once', date, weekday: null, start_date: null, end_date: null } };
}

/** The day-off form -> { values } for `staff_time_off`, or { error }. */
export function parseTimeOffInput(body) {
    if (!body || typeof body !== 'object') return { error: 'Nothing to save' };
    const employeeId = text(body.employeeId, 64);
    if (!employeeId) return { error: 'Pick who is off' };
    const startDate = text(body.startDate, 10);
    const endDate = text(body.endDate, 10) || startDate;
    if (!isDateKey(startDate) || !isDateKey(endDate)) return { error: 'Pick the day off' };
    if (endDate < startDate) return { error: 'The last day off must be on or after the first' };
    if (toUtc(endDate) - toUtc(startDate) > 366 * 86400000) return { error: 'Time off can be at most a year' };
    return { values: { employee_id: employeeId, start_date: startDate, end_date: endDate, note: text(body.note, 120) || null } };
}

/** An employee's name: required, short, tidy. */
export function parseEmployeeName(value) {
    const name = text(value, 60);
    return name ? { name } : { error: 'Enter a name' };
}

// ── the actual workdays ──────────────────────────────────────────────────────

/** Is `date` inside one of this person's days off? */
export function isOff(timeOff, employeeId, date) {
    return timeOff.some((off) => off.employeeId === employeeId && off.startDate <= date && date <= off.endDate);
}

/**
 * Shifts + days off -> every shift that actually happens from `from` to `to`
 * (inclusive), sorted by date, then start time.
 *
 * Each occurrence: { key, shiftId, employeeId, date, start, end, note, repeat }.
 * `key` (shift + date) is stable, so a calendar app updates an event in place
 * when it changes.
 */
export function expandShifts({ shifts, timeOff = [], from, to }) {
    const out = [];
    const add = (shift, date) => {
        if (isOff(timeOff, shift.employeeId, date)) return;
        out.push({
            key: `${shift.id}-${date}`,
            shiftId: shift.id,
            employeeId: shift.employeeId,
            date,
            start: shift.start,
            end: shift.end,
            note: shift.note,
            repeat: shift.repeat,
        });
    };
    for (const shift of shifts) {
        if (shift.repeat === 'once') {
            if (shift.date >= from && shift.date <= to) add(shift, shift.date);
            continue;
        }
        const first = shift.startDate > from ? shift.startDate : from;
        const last = shift.endDate && shift.endDate < to ? shift.endDate : to;
        for (let date = nextWeekday(first, shift.weekday); date <= last; date = addDays(date, 7)) {
            if (!shift.skipDates.includes(date)) add(shift, date);
        }
    }
    return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start) || a.employeeId.localeCompare(b.employeeId));
}

/**
 * One person's workdays -> calendar events at the store.
 *
 * @param {ReturnType<typeof expandShifts>} occurrences
 * @param {(date: string, time: string) => Date} instant local date + time -> UTC instant
 */
export function shiftEvents(occurrences, instant) {
    return occurrences.map((shift) => ({
        uid: `shift-${shift.key}@themoontea`,
        start: instant(shift.date, shift.start),
        end: instant(shift.date, shift.end),
        summary: 'Work: The Moon Tea',
        description: shift.note ?? '',
    }));
}
