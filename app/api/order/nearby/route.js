import { NextResponse } from 'next/server';
import { checkNearby, parseCoordinates } from '@/lib/online/geo';
import { currentOrderingWindow } from '@/lib/online/onlineData';

/**
 * "Am I close enough to order?" — so the page can say so before the customer
 * types a card. Checkout repeats this check; this one is only a courtesy.
 */
export async function POST(request) {
    const coords = parseCoordinates(await request.json().catch(() => null));
    if (!coords) return NextResponse.json({ error: 'We could not read your location.' }, { status: 400 });
    try {
        const window = await currentOrderingWindow();
        if (!window.open) return NextResponse.json({ nearby: false, reason: window.reason });
        const { nearby, distance } = checkNearby(coords, window.open);
        return NextResponse.json({ nearby, distance });
    } catch (error) {
        console.error('[order/nearby]', error);
        return NextResponse.json({ error: 'Please try again.' }, { status: 503 });
    }
}
