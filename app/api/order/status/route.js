import { NextResponse } from 'next/server';
import { TAX_RATE } from '@/lib/menu/catalog';
import { buildOnlineMenu } from '@/lib/online/onlineMenu';
import { currentOrderingWindow, publicPopup, siteMenuRows } from '@/lib/online/onlineData';
import { squareConfig } from '@/lib/online/square';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Everything the order page needs to start: is ordering open (and where),
 * what can be ordered, and the Square ids the card form needs. The ids are
 * public by design (Square's SDK runs in the browser); the access token is not
 * included.
 */
export async function GET() {
    const square = squareConfig();
    try {
        const supabase = createAdminClient();
        const [window, rows] = await Promise.all([currentOrderingWindow(supabase), siteMenuRows(supabase)]);
        return NextResponse.json(
            {
                ordering: {
                    open: window.reason === 'open',
                    reason: square.ready ? window.reason : 'payments_not_set_up',
                    popup: publicPopup(window.open ?? window.popup ?? null),
                    next: publicPopup(window.next),
                },
                square: square.ready
                    ? { applicationId: square.applicationId, locationId: square.locationId, sdkUrl: square.sdkUrl, environment: square.environment }
                    : null,
                menu: buildOnlineMenu(rows),
                taxRate: TAX_RATE,
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('[order/status]', error);
        return NextResponse.json({ error: 'Online ordering is unavailable right now.' }, { status: 503 });
    }
}
