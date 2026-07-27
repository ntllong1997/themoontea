/**
 * Date windows for the sales summary.
 *
 * Every filter — the preset pills and a hand-picked range alike — reduces to
 * one half-open window `[from, to)`, so the summary has a single rule for
 * "is this order in the period?" rather than one branch per pill.
 *
 * All arithmetic is local-time on purpose: a stall's trading day is the day
 * the till was open, not a UTC day.
 */

export const DATE_FILTERS = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'all', label: 'All Time' },
    { key: 'custom', label: 'Custom Range' },
];

/** How far back "This Week" reaches, counting today. */
const WEEK_LENGTH_DAYS = 7;

/** What `<input type="date">` produces, and all we accept. */
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date, days) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/**
 * A `YYYY-MM-DD` value as local midnight, or `null` if it is not a real date.
 *
 * `new Date('2026-07-04')` would parse as UTC midnight — the 3rd in every
 * American time zone — so the parts are read out and rebuilt locally instead.
 *
 * @param {string | null | undefined} value
 * @returns {Date | null}
 */
export function parseDateInput(value) {
    const match = DATE_INPUT_PATTERN.exec(String(value ?? '').trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    // Reject dates that only exist by rolling over, such as 2026-02-31.
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
}

/** The inverse of {@link parseDateInput}, for seeding the pickers. */
export function toDateInput(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The half-open window `[from, to)` a filter selects. A `null` bound is open.
 *
 * @param {string} filterKey one of {@link DATE_FILTERS}
 * @param {{ start?: string, end?: string }} customRange picker values, `YYYY-MM-DD`
 * @param {Date} now injected so the relative windows are testable
 */
export function windowFor(filterKey, customRange = {}, now = new Date()) {
    if (filterKey === 'today') {
        return { from: startOfDay(now), to: addDays(now, 1) };
    }

    if (filterKey === 'week') {
        // Open at the top, matching the pill's long-standing behaviour: a row
        // dated slightly in the future is still this week's trade.
        return { from: addDays(now, -(WEEK_LENGTH_DAYS - 1)), to: null };
    }

    if (filterKey === 'custom') {
        const first = parseDateInput(customRange.start);
        const last = parseDateInput(customRange.end);

        // Picked back to front — read it as the range they meant rather than
        // showing an empty table.
        const [earlier, later] = first && last && first > last ? [last, first] : [first, last];

        // The end day is inclusive: a range ending on the 12th must keep the
        // 12th's evening rush, so the exclusive bound is the 13th's midnight.
        return { from: earlier, to: later && addDays(later, 1) };
    }

    return { from: null, to: null };
}

/** A timestamp with no zone designator, e.g. `2026-07-27T01:57:50.441`. */
const ZONELESS_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * An order's `timestamp` as an instant.
 *
 * Both tills write UTC into a `timestamp without time zone` column, so what
 * comes back has no zone marker. Plain `new Date()` would read that as local
 * time and shift every order by the UTC offset — five hours in US Central —
 * moving an evening's takings onto the following day. The marker is put back
 * before parsing, which is what the iPad's TimestampParser already does.
 *
 * @param {Date | string | null | undefined} value
 * @returns {Date} an invalid Date when the value cannot be read
 */
export function parseOrderTimestamp(value) {
    if (value instanceof Date) return value;
    if (typeof value !== 'string') return new Date(NaN);

    const trimmed = value.trim();
    if (!trimmed) return new Date(NaN);

    return new Date(
        ZONELESS_TIMESTAMP.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed
    );
}

/**
 * Whether an order's timestamp falls in the window.
 *
 * An unreadable timestamp is kept only by the fully open window, so bad data
 * stays visible under "All Time" instead of vanishing everywhere.
 *
 * @param {Date | string | null | undefined} timestamp
 * @param {{ from: Date | null, to: Date | null }} window
 */
export function isWithinWindow(timestamp, window) {
    const { from, to } = window;
    if (!from && !to) return true;

    const date = parseOrderTimestamp(timestamp);
    if (Number.isNaN(date.getTime())) return false;

    if (from && date < from) return false;
    if (to && date >= to) return false;
    return true;
}

const DAY_ONLY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const DAY_AND_YEAR = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
});

/**
 * A human label for the period the figures cover, so a printed or screenshotted
 * summary still says which days it is about.
 */
export function formatRangeLabel({ from, to }) {
    // `to` is exclusive, so the last day the window actually includes is the
    // day before it.
    const lastDay = to && addDays(to, -1);

    if (!from && !lastDay) return 'All time';
    if (!lastDay) return `From ${DAY_AND_YEAR.format(from)}`;
    if (!from) return `Up to ${DAY_AND_YEAR.format(lastDay)}`;

    if (startOfDay(from).getTime() === startOfDay(lastDay).getTime()) {
        return DAY_AND_YEAR.format(from);
    }

    const opening =
        from.getFullYear() === lastDay.getFullYear()
            ? DAY_ONLY.format(from)
            : DAY_AND_YEAR.format(from);
    return `${opening} – ${DAY_AND_YEAR.format(lastDay)}`;
}
