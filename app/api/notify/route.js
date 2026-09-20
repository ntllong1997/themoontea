import { NextResponse } from 'next/server';
import { sendOrderPlacedMessage } from '@/lib/notify/twilio';

// TWILIO_AUTH_TOKEN is a secret, so the text/WhatsApp send has to happen on
// the server. Called by the customer online page right after an order is
// created (any payment method) — this is best-effort from the caller's side,
// so a failure here should never undo an order that was already placed.
export async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { phone, orderNumber, etaMinutes } = body;

    if (!phone || !orderNumber || typeof etaMinutes !== 'number') {
        return NextResponse.json({ error: 'Missing phone, orderNumber, or etaMinutes.' }, { status: 400 });
    }

    try {
        const result = await sendOrderPlacedMessage({ to: phone, orderNumber, etaMinutes });
        return NextResponse.json(result);
    } catch (error) {
        const message = error?.message || 'Failed to send the order notification.';
        console.error('[api/notify] send failed:', message);
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
