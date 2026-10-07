// Small helpers shared by the Daily Check tab and the Today board.

import { addDays } from '@/lib/schedule/schedule';
import { shortDate } from '@/components/admin/schedule/scheduleUi';

export { amount } from '@/lib/daily/dailyStock';

/** An ISO instant -> '9:42 PM' on the shop's clock, whatever device shows it. */
export const timeOf = (iso, timeZone) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });

/** When a check was done, relative to today: 'tonight', 'last night', or 'Mon, Oct 5'. */
export function checkWhen(date, today) {
    if (date === today) return 'tonight';
    if (date === addDays(today, -1)) return 'last night';
    return shortDate(date);
}

// Status chips. Dark text on light fills, all well above 4.5:1.
export const CHIP = {
    ok: 'bg-green-100 text-green-900',
    make: 'bg-amber-100 text-amber-950',
    low: 'bg-amber-100 text-amber-950',
    out: 'bg-red-100 text-red-900',
};

/** How one counted item stands: { tone, label }, or null when there's nothing to say. */
export function countStatus(item, count) {
    if (count === null || !(item.target > 0)) return null;
    if (count >= item.target) return { tone: 'ok', label: 'OK' };
    if (item.kind === 'make') return { tone: 'make', label: `Make ${item.target - count}` };
    return count === 0 ? { tone: 'out', label: 'Out' } : { tone: 'low', label: 'Low' };
}

export function ErrorText({ error }) {
    return error ? (
        <p role='alert' className='rounded-xl bg-red-50 p-3 text-sm text-red-800'>
            {error}
        </p>
    ) : null;
}

/** localStorage that never throws (private windows, blocked storage). */
export const store = {
    get(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || 'null');
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Nice to have only.
        }
    },
};
