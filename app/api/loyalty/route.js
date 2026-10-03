import { NextResponse } from 'next/server';
import { formatPhone } from '@/lib/online/loyalty';
import { loyaltyCard } from '@/lib/online/onlineData';
import { forgetPhone, verifiedPhone } from '@/lib/online/rewardsSession';
import { rewardsEnabled } from '@/lib/online/twilio';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * This browser's rewards: off, signed out, or the punch card of the phone it
 * verified by text. A card is only ever shown to whoever proved the number.
 */
export async function GET(request) {
    if (!rewardsEnabled()) return json({ enabled: false });
    const digits = await verifiedPhone(request);
    if (!digits) return json({ enabled: true, phone: null });
    try {
        return json({ enabled: true, phone: digits, display: formatPhone(digits), card: await loyaltyCard(digits) });
    } catch (error) {
        console.error('[loyalty]', error);
        return json({ error: 'Rewards are unavailable right now. Please try again.' }, 503);
    }
}

/** Sign out: forget the verified phone on this browser. */
export async function DELETE() {
    return forgetPhone(json({ enabled: rewardsEnabled(), phone: null }));
}
