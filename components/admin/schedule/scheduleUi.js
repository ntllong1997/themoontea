// Small helpers shared by the schedule page's parts.

import { formatTime } from '@/lib/site/popups';
import { WEEKDAYS } from '@/lib/schedule/schedule';

export const inputClass =
    'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 focus:border-black focus:outline-none focus:ring-2 focus:ring-blue-600';

const parse = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
};

/** '2026-10-05' -> 'Mon, Oct 5'. */
export const shortDate = (key) => parse(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
/** '2026-10-05' -> 'Monday, October 5'. */
export const longDate = (key) => parse(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
/** '10:00', '16:30' -> '10 AM – 4:30 PM'. */
export const timeRange = (start, end) => `${formatTime(start)} – ${formatTime(end)}`;
/** 6 -> 'Saturdays'. */
export const everyWeekday = (weekday) => `${WEEKDAYS[weekday]}s`;

// One colour per person, so a busy day is easy to scan. Dark text on light
// backgrounds, all well above 4.5:1.
const COLORS = [
    'bg-sky-100 text-sky-950 ring-sky-300',
    'bg-amber-100 text-amber-950 ring-amber-300',
    'bg-emerald-100 text-emerald-950 ring-emerald-300',
    'bg-fuchsia-100 text-fuchsia-950 ring-fuchsia-300',
    'bg-orange-100 text-orange-950 ring-orange-300',
    'bg-indigo-100 text-indigo-950 ring-indigo-300',
    'bg-lime-100 text-lime-950 ring-lime-300',
    'bg-rose-100 text-rose-950 ring-rose-300',
];
export const colorFor = (employees, id) => COLORS[Math.max(0, employees.findIndex((e) => e.id === id)) % COLORS.length];

/** The address of an employee's calendar feed on this site. */
export const feedUrls = (token) => {
    const host = typeof window === 'undefined' ? '' : window.location.host;
    const path = `/staff-calendar/${token}.ics`;
    return { webcal: `webcal://${host}${path}`, https: `https://${host}${path}` };
};
