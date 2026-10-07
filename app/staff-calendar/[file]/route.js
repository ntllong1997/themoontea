import { addDays, expandShifts, shiftEvents, shiftFromRow, timeOffFromRow } from '@/lib/schedule/schedule';
import { SHIFT_COLUMNS, TIME_OFF_COLUMNS } from '@/lib/schedule/scheduleData';
import { buildCalendar, localInstant } from '@/lib/site/ical';
import { shopDateKey, shopTimeZone } from '@/lib/online/shopTime';
import { createAdminClient } from '@/lib/supabase/admin';

// One employee's store shifts as a calendar feed: /staff-calendar/<token>.ics.
// Each shift's location is STORE_ADDRESS (optional), so the phone can give directions.
// The token is the only key, so the link itself is the secret: anyone who has
// it sees that person's shifts (nothing else). Resetting it on the schedule
// page stops an old link working.
export const dynamic = 'force-dynamic';

const PAST_DAYS = 30;
const AHEAD_DAYS = 120;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

const notFound = () => new Response('This calendar link is no longer valid. Ask for a new one.', { status: 404 });

export async function GET(request, { params }) {
    const { file } = await params;
    const token = file.replace(/\.ics$/, '');
    if (!TOKEN.test(token)) return notFound();
    try {
        const supabase = createAdminClient();
        const { data: link, error: linkError } = await supabase
            .from('staff_calendar_links')
            .select('employee_id, employees(name)')
            .eq('token', token)
            .maybeSingle();
        if (linkError) throw linkError;
        if (!link) return notFound();

        const timeZone = shopTimeZone();
        const today = shopDateKey(new Date(), timeZone);
        const from = addDays(today, -PAST_DAYS);
        const to = addDays(today, AHEAD_DAYS);
        const [shifts, timeOff] = await Promise.all([
            supabase.from('staff_shifts').select(SHIFT_COLUMNS).eq('employee_id', link.employee_id),
            supabase.from('staff_time_off').select(TIME_OFF_COLUMNS).eq('employee_id', link.employee_id),
        ]);
        for (const result of [shifts, timeOff]) if (result.error) throw result.error;

        const occurrences = expandShifts({
            shifts: shifts.data.map(shiftFromRow),
            timeOff: timeOff.data.map(timeOffFromRow),
            from,
            to,
        });
        const name = link.employees?.name ?? 'My';
        const body = buildCalendar({
            name: `${name} – The Moon Tea shifts`,
            timeZone,
            events: shiftEvents(occurrences, { location: (process.env.STORE_ADDRESS ?? '').trim() }, (date, time) => localInstant(date, time, timeZone)),
        });
        return new Response(body, {
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': 'inline; filename="moon-tea-shifts.ics"',
                'Cache-Control': 'private, max-age=300',
                'X-Robots-Tag': 'noindex',
            },
        });
    } catch (error) {
        // An error (not an empty calendar) keeps the phone's last copy.
        console.error('[staff-calendar]', error?.message ?? error);
        return new Response('The schedule is unavailable right now.', { status: 503, headers: { 'Retry-After': '600' } });
    }
}
