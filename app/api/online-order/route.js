import { NextResponse } from 'next/server';
import { placeOrderWith } from '@/lib/db';
import { parseOnlineOrder } from '@/lib/orders/onlineOrder';
import { shopDayBounds, shopTimeZone } from '@/lib/online/shopTime';
import { createAdminClient } from '@/lib/supabase/admin';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * A customer's online order (/order/online). Public, like that page — but the
 * browser no longer writes to `orders` itself: the order is checked against
 * the menu here (lib/orders/onlineOrder.js), so every name and price comes
 * from the menu, and saved with the server's own key.
 *
 * Numbered against the shop's day, not the server's: the server runs on UTC,
 * and the tills count orders per local day.
 */
export async function POST(request) {
    const parsed = parseOnlineOrder(await request.json().catch(() => null));
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400, headers: noStore });

    try {
        const { start, end } = shopDayBounds(new Date(), shopTimeZone());
        const order = await placeOrderWith(
            { client: createAdminClient(), start, end },
            { ...parsed.values, paymentMethod: 'online' }
        );
        // Only what the confirmation shows: the number and the total.
        return NextResponse.json({ orderNumber: order.orderNumber, total: order.total }, { status: 201, headers: noStore });
    } catch (error) {
        console.error('[online-order]', error?.message ?? error);
        return NextResponse.json({ error: "We couldn't place your order. Please try again." }, { status: 500, headers: noStore });
    }
}
