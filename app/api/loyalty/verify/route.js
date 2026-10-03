import { NextResponse } from 'next/server';
import { formatPhone, normalizePhone } from '@/lib/online/loyalty';
import { loyaltyCard } from '@/lib/online/onlineData';
import { rememberPhone } from '@/lib/online/rewardsSession';
import { checkCode, twilioConfig } from '@/lib/online/twilio';

/** Check the texted code; if right, remember the phone on this browser and return its card. */
export async function POST(request) {
    const config = twilioConfig();
    if (!config.ready) return NextResponse.json({ error: 'Rewards are not available yet.' }, { status: 503 });
    const body = await request.json().catch(() => ({}));
    const digits = normalizePhone(body.phone);
    const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
    if (!digits) return NextResponse.json({ error: 'Please enter a 10-digit US phone number.' }, { status: 400 });
    if (!/^\d{4,10}$/.test(code)) return NextResponse.json({ error: 'Please enter the code from the text message.' }, { status: 400 });
    try {
        const checked = await checkCode(config, digits, code);
        if (!checked.ok) return NextResponse.json({ error: checked.message }, { status: 400 });
        const card = await loyaltyCard(digits);
        return rememberPhone(NextResponse.json({ enabled: true, phone: digits, display: formatPhone(digits), card }), digits);
    } catch (error) {
        console.error('[loyalty/verify]', error);
        return NextResponse.json({ error: 'We couldn’t check the code. Please try again.' }, { status: 503 });
    }
}
