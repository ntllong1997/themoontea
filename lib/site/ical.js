// The pop-up calendar as an iCalendar (.ics) feed, so an iPhone (or Google
// Calendar, Outlook…) can subscribe to it and keep itself up to date.
//
// Times are written in UTC: each pop-up's date and times are wall-clock times
// at the shop (SHOP_TIME_ZONE), converted here, so every phone shows them in
// its own time zone correctly.
//
// Relative imports only, so `node --test` can load this file.
import { zonedTimeToUtc } from '../online/shopTime.js';

export const CALENDAR_NAME = 'The Moon Tea Pop-ups';

/** Text values escape \ ; , and newlines (RFC 5545 §3.3.11). */
const escapeText = (value) =>
    String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes continue on the next line after a space (§3.1). */
function fold(line) {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    const parts = [];
    let current = '';
    let size = 0;
    for (const char of line) {
        const charSize = new TextEncoder().encode(char).length;
        if (size + charSize > (parts.length ? 74 : 75)) {
            parts.push(current);
            current = '';
            size = 0;
        }
        current += char;
        size += charSize;
    }
    parts.push(current);
    return parts.join('\r\n ');
}

/** A Date -> 20261011T160000Z. */
const utcStamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** A pop-up's local date + 'HH:MM' -> its UTC instant. */
function popupInstant(date, time, timeZone) {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    return zonedTimeToUtc({ year, month, day, hour, minute }, timeZone);
}

/**
 * Pop-ups -> the text of an .ics file.
 *
 * @param {Array<{ id: string, date: string, start: string, end: string, name: string,
 *                 place: string, address?: string|null, note?: string|null }>} popups
 * @param {{ timeZone: string, siteUrl?: string, now?: Date }} options
 */
export function buildPopupCalendar(popups, { timeZone, siteUrl = '', now = new Date() }) {
    const menuUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/menu` : '';
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//The Moon Tea//Pop-up calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${CALENDAR_NAME}`,
        `X-WR-TIMEZONE:${timeZone}`,
        // Ask calendar apps to check for changes every hour.
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
        'X-PUBLISHED-TTL:PT1H',
    ];
    for (const popup of popups) {
        const where = [popup.place, popup.address].filter(Boolean).join(', ');
        const about = [popup.note, menuUrl && `Menu: ${menuUrl}`].filter(Boolean).join('\n');
        lines.push(
            'BEGIN:VEVENT',
            `UID:popup-${popup.id}@themoontea`,
            `DTSTAMP:${utcStamp(now)}`,
            `DTSTART:${utcStamp(popupInstant(popup.date, popup.start, timeZone))}`,
            `DTEND:${utcStamp(popupInstant(popup.date, popup.end, timeZone))}`,
            `SUMMARY:${escapeText(`The Moon Tea: ${popup.name}`)}`,
            `LOCATION:${escapeText(where)}`,
            ...(about ? [`DESCRIPTION:${escapeText(about)}`] : []),
            ...(menuUrl ? [`URL:${menuUrl}`] : []),
            'END:VEVENT'
        );
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
}
