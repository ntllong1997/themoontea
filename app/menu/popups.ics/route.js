import { buildPopupCalendar } from '@/lib/site/ical';
import { getCalendarPopups } from '@/lib/site/menuData';
import { shopTimeZone } from '@/lib/online/shopTime';

// The pop-up calendar as a feed calendar apps subscribe to (webcal://…/menu/popups.ics).
// Public like /menu itself: it holds only what the menu page already shows.
export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const popups = await getCalendarPopups();
        const body = buildPopupCalendar(popups, { timeZone: shopTimeZone(), siteUrl: new URL(request.url).origin });
        return new Response(body, {
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': 'inline; filename="the-moon-tea-popups.ics"',
                'Cache-Control': 'public, max-age=300',
            },
        });
    } catch (error) {
        console.error('[popups.ics]', error?.message ?? error);
        return new Response('The pop-up calendar is unavailable right now.', { status: 503, headers: { 'Retry-After': '600' } });
    }
}
