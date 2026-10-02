import { NextResponse } from 'next/server';
import { normalizePhone } from '@/lib/online/loyalty';
import { loyaltyCard } from '@/lib/online/onlineData';

/** A customer's punch card by phone number. Shows counts only, nothing else. */
export async function POST(request) {
    const body = await request.json().catch(() => ({}));
    const digits = normalizePhone(body.phone);
    if (!digits) return NextResponse.json({ error: 'Please enter a 10-digit phone number.' }, { status: 400 });
    try {
        return NextResponse.json({ card: await loyaltyCard(digits) }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[loyalty]', error);
        return NextResponse.json({ error: 'Loyalty is unavailable right now. Please try again.' }, { status: 503 });
    }
}
