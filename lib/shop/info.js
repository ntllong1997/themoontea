// The main shop's details for /shop: address, phone and opening hours.
//
// The details themselves are in info.json next to this file. Hours are
// 24-hour 'HH:MM' on the shop's own clock (`timeZone`), and every day the
// shop opens appears in exactly one row.
//
// Relative imports so `node --test` can load this without the "@/" alias.
import { zonedParts } from '../online/shopTime.js';
import { directionsUrl, formatTime } from '../site/popups.js';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SCHEMA_DAYS = WEEKDAY_NAMES.map((day) => `https://schema.org/${day}`);

/** 'Sunday – Thursday', or 'Friday' for a one-day row. */
const dayRange = (days) =>
    days.length === 1
        ? WEEKDAY_NAMES[WEEKDAYS.indexOf(days[0])]
        : `${WEEKDAY_NAMES[WEEKDAYS.indexOf(days[0])]} – ${WEEKDAY_NAMES[WEEKDAYS.indexOf(days.at(-1))]}`;

/** The hours table: [{ days: 'Sunday – Thursday', time: '11:30 AM – 9 PM' }]. */
export const hoursRows = (info) =>
    info.hours.map((row) => ({ days: dayRange(row.days), time: `${formatTime(row.open)} – ${formatTime(row.close)}` }));

/** True when every day of the week has hours. */
export const openEveryDay = (info) => WEEKDAYS.every((day) => info.hours.some((row) => row.days.includes(day)));

/** '4423 N Conway Ave #210, Palmhurst, TX 78573' */
export const fullAddress = ({ address }) => `${address.street}, ${address.city}, ${address.state} ${address.zip}`;

/** A Google Maps search for the shop, which opens the Maps app on phones. */
export const mapsUrl = (info) => directionsUrl({ place: info.name, address: fullAddress(info) });

/** '(956) 598-5088' -> 'tel:+19565985088' (US numbers). */
export const telHref = (phone) => `tel:+1${phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')}`;

const minutesOf = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

const hoursOn = (info, weekday) => info.hours.find((row) => row.days.includes(WEEKDAYS[weekday])) ?? null;

/**
 * Whether the shop is open at `now`, read on the shop's clock (so a visitor
 * in another time zone sees the same thing), with a short line to show:
 * 'Open now · until 9 PM', 'Opens today at 11:30 AM', 'Opens tomorrow at 11:30 AM'.
 */
export function openStatus(info, now = new Date()) {
    const { year, month, day, hour, minute } = zonedParts(now, info.timeZone);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const time = hour * 60 + minute;
    const today = hoursOn(info, weekday);
    if (today && time >= minutesOf(today.open) && time < minutesOf(today.close)) {
        return { open: true, label: `Open now · until ${formatTime(today.close)}` };
    }
    if (today && time < minutesOf(today.open)) {
        return { open: false, label: `Opens today at ${formatTime(today.open)}` };
    }
    for (let ahead = 1; ahead <= 7; ahead++) {
        const next = hoursOn(info, (weekday + ahead) % 7);
        if (next) {
            const when = ahead === 1 ? 'tomorrow' : WEEKDAY_NAMES[(weekday + ahead) % 7];
            return { open: false, label: `Opens ${when} at ${formatTime(next.open)}` };
        }
    }
    return { open: false, label: 'Closed' };
}

/**
 * schema.org data for search engines, so a search for the shop can show its
 * address, phone and hours.
 */
export function structuredData(info) {
    return {
        '@context': 'https://schema.org',
        '@type': 'CafeOrCoffeeShop',
        name: info.name,
        telephone: info.phone,
        servesCuisine: ['Bubble tea', 'Korean corndogs'],
        address: {
            '@type': 'PostalAddress',
            streetAddress: info.address.street,
            addressLocality: info.address.city,
            addressRegion: info.address.state,
            postalCode: info.address.zip,
            addressCountry: 'US',
        },
        openingHoursSpecification: info.hours.map((row) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: row.days.map((d) => SCHEMA_DAYS[WEEKDAYS.indexOf(d)]),
            opens: row.open,
            closes: row.close,
        })),
    };
}
