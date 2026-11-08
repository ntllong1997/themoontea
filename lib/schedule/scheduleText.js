// Shifts as plain text messages: one employee's (for anyone whose phone can't
// subscribe to their calendar link; Android phones can't, and Google Calendar
// only takes a link on a computer), or the whole team's week for the staff
// group chat. The schedule page puts them in a text message, copies them, or
// shares them to WhatsApp and the like.
//
// Relative imports so `node --test` can load this without the "@/" alias.
import { addDays, datesBetween, expandShifts, isOff, weekStart, weekdayOf } from './schedule.js';
import { formatTime } from '../site/popups.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthDay = (key) => {
    const [, month, day] = key.split('-').map(Number);
    return { month: MONTHS[month - 1], day };
};

/** '2026-11-09' -> 'Mon, Nov 9'. */
export function dayLabel(key) {
    const { month, day } = monthDay(key);
    return `${DAYS[weekdayOf(key)]}, ${month} ${day}`;
}

/** 'Nov 9 – 15', 'Oct 26 – Nov 1' across months, or 'Nov 9' for a single day. */
export function rangeLabel(from, to) {
    const a = monthDay(from);
    const b = monthDay(to);
    if (from === to) return `${a.month} ${a.day}`;
    return a.month === b.month ? `${a.month} ${a.day} – ${b.day}` : `${a.month} ${a.day} – ${b.month} ${b.day}`;
}

const minutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

/**
 * The stretches a message can cover, seen from `today`: the rest of this week,
 * next week, or both (weeks run Monday to Sunday, like the schedule page).
 */
export function textRanges(today) {
    const sunday = addDays(weekStart(today), 6);
    const nextMonday = addDays(sunday, 1);
    const nextSunday = addDays(nextMonday, 6);
    return [
        { id: 'this', label: 'This week', period: 'this week', from: today, to: sunday },
        { id: 'next', label: 'Next week', period: 'next week', from: nextMonday, to: nextSunday },
        { id: 'both', label: 'Next 2 weeks', period: 'for the next two weeks', from: today, to: nextSunday },
    ];
}

/** Friday to Sunday, people are usually asking about next week. */
export const defaultRangeId = (today) => ([5, 6, 0].includes(weekdayOf(today)) ? 'next' : 'this');

/**
 * One person's shifts and days off from `from` to `to` (inclusive), ready to send:
 *
 *   Hi Anna! Your Moon Tea shifts next week (Nov 9 – 15):
 *
 *   Mon, Nov 9 · 11:30 AM – 5 PM
 *   Sun, Nov 15 · 3 PM – 10 PM (closing)
 *
 *   Off: Fri, Nov 13
 *
 *   2 shifts · 12.5 hours
 *
 * Day-off notes stay out of it; they can be private.
 */
export function scheduleText({ employee, shifts, timeOff = [], from, to, period }) {
    const mine = shifts.filter((s) => s.employeeId === employee.id);
    const offs = timeOff.filter((o) => o.employeeId === employee.id && o.endDate >= from && o.startDate <= to);
    const work = expandShifts({ shifts: mine, timeOff: offs, from, to });
    const when = `${period} (${rangeLabel(from, to)})`;

    if (work.length === 0 && offs.length === 0) {
        return `Hi ${employee.name}! You have no Moon Tea shifts ${when}.`;
    }

    const lines = [`Hi ${employee.name}! Your Moon Tea shifts ${when}:`, ''];
    if (work.length === 0) lines.push('No shifts.');
    for (const shift of work) {
        const note = shift.note ? ` (${shift.note})` : '';
        lines.push(`${dayLabel(shift.date)} · ${formatTime(shift.start)} – ${formatTime(shift.end)}${note}`);
    }

    if (offs.length) {
        const ranges = offs
            .map((o) => ({ start: o.startDate < from ? from : o.startDate, end: o.endDate > to ? to : o.endDate }))
            .sort((a, b) => a.start.localeCompare(b.start))
            .map(({ start, end }) => (start === end ? dayLabel(start) : `${dayLabel(start)} – ${dayLabel(end)}`));
        lines.push('', `Off: ${ranges.join(', ')}`);
    }

    if (work.length) {
        const total = work.reduce((sum, s) => sum + minutes(s.end) - minutes(s.start), 0) / 60;
        const hours = Number.isInteger(total) ? total : total.toFixed(1);
        lines.push('', `${work.length} ${work.length === 1 ? 'shift' : 'shifts'} · ${hours} ${total === 1 ? 'hour' : 'hours'}`);
    }
    return lines.join('\n');
}

/**
 * Everyone's shifts, day by day, for the staff group chat:
 *
 *   The Moon Tea schedule next week (Nov 9 – 15):
 *
 *   Mon, Nov 9
 *   • Anna 11:30 AM – 5 PM
 *   • Ben 4 PM – 10 PM (closing)
 *   Off: Cara
 *
 *   Tue, Nov 10
 *   • No one scheduled
 *
 * `period` ('this week', 'next week') may be empty for weeks further out.
 * Day-off notes stay out of it, as in the one-person message.
 */
export function teamScheduleText({ employees, shifts, timeOff = [], from, to, period = '' }) {
    const names = new Map(employees.map((e) => [e.id, e.name]));
    const work = expandShifts({ shifts: shifts.filter((s) => names.has(s.employeeId)), timeOff, from, to });
    const lines = [`The Moon Tea schedule ${period ? `${period} ` : ''}(${rangeLabel(from, to)}):`];
    for (const date of datesBetween(from, to)) {
        lines.push('', dayLabel(date));
        const day = work.filter((s) => s.date === date);
        if (day.length === 0) lines.push('• No one scheduled');
        for (const shift of day) {
            const note = shift.note ? ` (${shift.note})` : '';
            lines.push(`• ${names.get(shift.employeeId)} ${formatTime(shift.start)} – ${formatTime(shift.end)}${note}`);
        }
        const off = employees.filter((e) => isOff(timeOff, e.id, date)).map((e) => e.name);
        if (off.length) lines.push(`Off: ${off.join(', ')}`);
    }
    return lines.join('\n');
}
