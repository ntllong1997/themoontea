import { NextResponse } from 'next/server';
import { normalizePhone } from '@/lib/online/loyalty';
import { sendCode, twilioConfig } from '@/lib/online/twilio';

/** Text a 6-digit code to the customer's phone. Twilio limits repeats per number. */
export async function POST(request) {
    const config = twilioConfig();
    if (!config.ready) return NextResponse.json({ error: 'Rewards are not available yet.' }, { status: 503 });
    const body = await request.json().catch(() => ({}));
    const digits = normalizePhone(body.phone);
    if (!digits) return NextResponse.json({ error: 'Please enter a 10-digit US phone number.' }, { status: 400 });
    try {
        const sent = await sendCode(config, digits);
        if (!sent.ok) {
            console.warn('[loyalty/code] not sent', sent.code);
            return NextResponse.json({ error: sent.message }, { status: 400 });
        }
        return NextResponse.json({ sent: true });
    } catch (error) {
        console.error('[loyalty/code]', error);
        return NextResponse.json({ error: 'We couldn’t send a code. Please try again.' }, { status: 503 });
    }
}
