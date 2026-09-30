// The pop-up calendar on the public site (/menu#popups).
//
// ── Adding a pop-up ─────────────────────────────────────────────────────────
// Copy the example below into POPUPS, uncomment it and fill it in:
//
//   {
//       date: '2026-10-18',            // YYYY-MM-DD
//       start: '11:00',                // 24-hour time, HH:MM
//       end: '16:00',
//       name: 'Harvest Night Market',
//       place: 'Riverside Park',
//       address: '123 Main St, Springfield',   // optional, powers "Directions"
//       note: 'Look for the moon flag!',        // optional
//   },
//
// Order doesn't matter — the page sorts by date. Past dates drop off the
// list on their own the day after, so there is nothing to clean up.

/**
 * @typedef {{ date: string, start: string, end: string, name: string,
 *             place: string, address?: string, note?: string }} Popup
 */

/** @type {Popup[]} */
export const POPUPS = [
];

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
