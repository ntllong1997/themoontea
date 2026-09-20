import { NextResponse } from 'next/server';
import { chargeSquareCard } from '@/lib/payments/square';

// The only step of the customer self-order flow that has to leave the
// browser: SQUARE_ACCESS_TOKEN is a secret, so the card can't be charged with
// the anon-key-in-the-browser approach the rest of this app uses. The order
// itself is still written straight to Supabase from the client, same as
// every other order — this route does nothing but the charge.
export async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { sourceId, amountCents, idempotencyKey } = body;

    try {
        const { paymentId, status } = await chargeSquareCard({
            sourceId,
            amountCents,
            idempotencyKey,
            note: 'The Moon Tea — online order',
        });
        return NextResponse.json({ paymentId, status });
    } catch (error) {
        const message = error?.message || 'Card payment failed.';
        console.error('[api/payments/square] charge failed:', message);
        return NextResponse.json({ error: message }, { status: 402 });
    }
}
