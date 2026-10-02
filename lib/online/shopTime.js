// The shop's own clock. Pop-up dates and times are local wall-clock values
// ("Oct 18, 11:00–16:00"), and the tills count orders per LOCAL day, so the
// server has to reason in the shop's time zone, not UTC or the server's.
//
// SHOP_TIME_ZONE (IANA name) overrides the default. No imports: `node --test`.

export const DEFAULT_SHOP_TIME_ZONE = 'America/Chicago';

/** The configured zone, falling back to the default if unset or invalid. */
export function shopTimeZone(env = process.env) {
    const zone = (env.SHOP_TIME_ZONE ?? '').trim();
    if (!zone) return DEFAULT_SHOP_TIME_ZONE;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return zone;
    } catch {
        return DEFAULT_SHOP_TIME_ZONE;
    }
}

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(date, timeZone) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
            .formatToParts(date)
            .map((p) => [p.type, p.value])
    );
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second),
    };
}

/** 'YYYY-MM-DD' of an instant on the shop's calendar. */
export function shopDateKey(date, timeZone) {
    const { year, month, day } = zonedParts(date, timeZone);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 'HH:MM' of an instant on the shop's clock. */
export function shopTimeOfDay(date, timeZone) {
    const { hour, minute } = zonedParts(date, timeZone);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * The UTC instant of a local wall-clock time in a zone. Two passes handle
 * DST: guess with the offset now, then correct with the offset at the guess.
 */
export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone) {
    const asUtc = Date.UTC(year, month - 1, day, hour, minute);
    let guess = asUtc;
    for (let i = 0; i < 2; i++) {
        const p = zonedParts(new Date(guess), timeZone);
        const shownAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        guess = asUtc - (shownAsUtc - guess);
    }
    return new Date(guess);
}

/**
 * Today's [start, end) on the shop's calendar, as the ISO strings the
 * `orders.timestamp` column and `next_order_number` expect — the same bounds
 * the iPad and web tills compute from their own (shop-local) clocks.
 */
export function shopDayBounds(now, timeZone) {
    const { year, month, day } = zonedParts(now, timeZone);
    const start = zonedTimeToUtc({ year, month, day }, timeZone);
    // Next local midnight: noon today + 1 day, then back to midnight (DST-safe).
    const tomorrow = zonedParts(new Date(zonedTimeToUtc({ year, month, day, hour: 12 }, timeZone).getTime() + 86400000), timeZone);
    const end = zonedTimeToUtc({ year: tomorrow.year, month: tomorrow.month, day: tomorrow.day }, timeZone);
    return { start: start.toISOString(), end: end.toISOString() };
}
