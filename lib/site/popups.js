// The pop-up calendar on the customer menu site (/menu#popups).
//
// Dates live in the Supabase table `site_popups` and are managed by staff at
// /admin/popups. Past dates drop off the public calendar on their own the
// day after, so there is nothing to clean up.
//
// No imports, so `node --test` and the page can both load this file.

/**
 * A pop-up as the calendar uses it.
 * @typedef {{ id?: string, date: string, start: string, end: string, name: string,
 *             place: string, address?: string|null, note?: string|null }} Popup
 */

/** A `site_popups` row -> the shape the calendar renders. */
export const popupFromRow = (row) => ({
    id: row.id,
    date: row.date,
    start: row.start_time,
    end: row.end_time,
    name: row.name,
    place: row.place,
    address: row.address || null,
    note: row.note || null,
});

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * What the admin page sends -> { values } ready for `site_popups`, or
 * { error } naming the first problem in words staff will understand.
 */
export function parsePopupInput(body) {
    if (!body || typeof body !== 'object') return { error: 'Nothing to save' };
    const date = text(body.date, 10);
    if (!DATE.test(date) || Number.isNaN(parseDate(date).getTime()) || dateKey(parseDate(date)) !== date) {
        return { error: 'Pick a date' };
    }
    const start = text(body.start, 5);
    const end = text(body.end, 5);
    if (!TIME.test(start) || !TIME.test(end)) return { error: 'Set a start and end time' };
    if (end <= start) return { error: 'The end time must be after the start time' };
    const name = text(body.name, 80);
    if (!name) return { error: 'Give the pop-up a name, e.g. Night Market' };
    const place = text(body.place, 120);
    if (!place) return { error: 'Say where it is, e.g. Riverside Park' };
    return {
        values: {
            date,
            start_time: start,
            end_time: end,
            name,
            place,
            address: text(body.address, 200) || null,
            note: text(body.note, 300) || null,
        },
    };
}

/** 'YYYY-MM-DD' of a Date in the viewer's own time zone. */
export const dateKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Pop-ups happening today or later, soonest first. */
export function upcomingPopups(popups, today = new Date()) {
    const todayKey = dateKey(today);
    return popups
        .filter((popup) => popup.date >= todayKey)
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/** A 'YYYY-MM-DD' date as a local Date at midnight (not UTC, which shifts a day). */
export function parseDate(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
}

/** '14:30' -> '2:30 PM', '11:00' -> '11 AM'. */
export function formatTime(hhmm) {
    const [hours, minutes] = hhmm.split(':').map(Number);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return minutes === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** A Google Calendar "add event" link. Times are left floating, i.e. local. */
export function googleCalendarUrl(popup) {
    const stamp = (time) => `${popup.date.replaceAll('-', '')}T${time.replace(':', '')}00`;
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: `The Moon Tea pop-up · ${popup.name}`,
        dates: `${stamp(popup.start)}/${stamp(popup.end)}`,
        location: [popup.place, popup.address].filter(Boolean).join(', '),
        details: popup.note ?? 'Boba & Korean corndogs from The Moon Tea.',
    });
    return `https://calendar.google.com/calendar/render?${params}`;
}

/** A Google Maps search link for a pop-up's location. */
export const directionsUrl = (popup) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [popup.place, popup.address].filter(Boolean).join(', ')
    )}`;
