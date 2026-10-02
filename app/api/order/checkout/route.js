import { NextResponse } from 'next/server';
import { checkNearby, parseCoordinates } from '@/lib/online/geo';
import { normalizePhone, punchCard } from '@/lib/online/loyalty';
import { priceOnlineOrder } from '@/lib/online/onlineMenu';
import { currentOrderingWindow, loyaltyCard, siteMenuRows } from '@/lib/online/onlineData';
import { shopDayBounds, shopTimeZone } from '@/lib/online/shopTime';
import { chargeCard, refundPayment, squareConfig } from '@/lib/online/square';
import { ONLINE_CARD_METHOD } from '@/lib/orders/paymentMethods';
import { toOrderRows } from '@/lib/orders/orderModel';
import { createAdminClient } from '@/lib/supabase/admin';

// Place a paid online order. In order:
//   1. Check the request: name, phone, note, card token.
//   2. Is a pop-up taking orders right now, and is the customer within a mile?
//   3. Price the cart from the till's catalog (never from the browser).
//   4. Charge the card through Square.
//   5. Save it like a till order (one `orders` row per unit, next order
//      number), plus the payment record the iPad prints from.
// If step 5 fails after the card was charged, the payment is refunded.

const LOCATION_ID = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reply = (status, body) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const text = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const miles = (meters) => (meters / 1609.34).toFixed(1);

export async function POST(request) {
    const body = await request.json().catch(() => null);
    if (!body) return reply(400, { error: 'Something went wrong. Please refresh and try again.' });

    // 1 ── the request
    const name = text(body.name, 40);
    const digits = normalizePhone(body.phone);
    const note = text(body.note, 200) || null;
    if (!name) return reply(400, { error: 'Please enter your name for the order.' });
    if (!digits) return reply(400, { error: 'Please enter a 10-digit phone number.' });
    if (typeof body.sourceId !== 'string' || body.sourceId.length > 500 || !body.sourceId) {
        return reply(400, { error: 'Please enter your card details.' });
    }
    if (typeof body.idempotencyKey !== 'string' || !UUID.test(body.idempotencyKey)) {
        return reply(400, { error: 'Something went wrong. Please refresh and try again.' });
    }

    const square = squareConfig();
    if (!square.ready) return reply(503, { error: 'Online payments are not set up yet.' });

    let supabase;
    try {
        supabase = createAdminClient();
    } catch (error) {
        console.error('[checkout] admin client', error);
        return reply(503, { error: 'Online ordering is unavailable right now.' });
    }

    // Square remembers the idempotency key: a retry of a request that already
    // charged returns the same payment. If that order was saved, hand it back
    // instead of saving it twice.
    const now = new Date();
    try {
        // 2 ── open, and nearby
        const window = await currentOrderingWindow(supabase, now);
        if (!window.open) {
            return reply(409, {
                error:
                    window.reason === 'no_location'
                        ? 'Online ordering is not open for this pop-up yet. Please order at the stand.'
                        : 'Online ordering is only open during a pop-up. Please check the pop-up calendar.',
            });
        }
        const coords = parseCoordinates(body.coords);
        if (!coords) return reply(403, { error: 'Please allow location access so we can check you are at the pop-up.' });
        const { nearby, distance } = checkNearby(coords, window.open);
        if (!nearby) {
            return reply(403, {
                error: `You look about ${miles(distance)} miles from ${window.open.place}. Online orders are for customers at the pop-up (within 1 mile).`,
            });
        }

        // 3 ── price it
        const card = body.useReward ? await loyaltyCard(digits, supabase) : null;
        const priced = priceOnlineOrder(body.lines, await siteMenuRows(supabase), {
            useReward: body.useReward === true,
            rewardsAvailable: card?.rewardsAvailable ?? 0,
        });
        if (priced.error) return reply(400, { error: priced.error });

        // A free drink alone can be a $0.00 order; Square can't charge that.
        if (priced.amountCents < 100) return reply(400, { error: 'Online orders need to be at least $1.00.' });

        // 4 ── charge the card
        const charge = await chargeCard(square, {
            sourceId: body.sourceId,
            amountCents: priced.amountCents,
            idempotencyKey: body.idempotencyKey,
            note: `Online order: ${name}`.slice(0, 500),
            referenceId: digits,
        });
        if (!charge.ok) {
            console.warn('[checkout] payment declined', charge.code);
            return reply(402, { error: charge.message });
        }
        const payment = charge.payment;

        const { data: existing } = await supabase
            .from('online_orders')
            .select('order_number, total, square_receipt_url, reward_used')
            .eq('square_payment_id', payment.id)
            .maybeSingle();
        if (existing) {
            return reply(200, {
                orderNumber: existing.order_number,
                total: Number(existing.total),
                receiptUrl: existing.square_receipt_url,
                rewardApplied: existing.reward_used,
                card: await loyaltyCard(digits, supabase),
            });
        }

        // 5 ── save it; refund (and take back any till rows) if that fails
        let savedRowIds = [];
        try {
            const bounds = shopDayBounds(now, shopTimeZone());
            const { data: orderNumber, error: numberError } = await supabase.rpc('next_order_number', {
                range_start: bounds.start,
                range_end: bounds.end,
                p_location: LOCATION_ID,
            });
            if (numberError) throw numberError;

            const timestamp = now.toISOString();
            const rows = toOrderRows({
                cartItems: priced.lines,
                orderNumber,
                timestamp,
                phone: digits,
                paymentMethod: ONLINE_CARD_METHOD,
                locationId: LOCATION_ID,
            }).map((row) => ({ ...row, source: 'online', note, customer_name: name }));
            const { data: savedRows, error: rowsError } = await supabase.from('orders').insert(rows).select('id');
            if (rowsError) throw rowsError;
            savedRowIds = savedRows.map((row) => row.id);

            const { data: saved, error: onlineError } = await supabase
                .from('online_orders')
                .insert({
                    order_number: orderNumber,
                    location: LOCATION_ID,
                    order_timestamp: timestamp,
                    popup_id: window.open.id ?? null,
                    customer_name: name,
                    phone: digits,
                    note,
                    items: priced.receipt,
                    subtotal: priced.subtotal,
                    tax: priced.tax,
                    total: priced.total,
                    square_payment_id: payment.id,
                    square_receipt_url: payment.receipt_url ?? null,
                    reward_used: priced.rewardApplied,
                    distance_m: distance,
                })
                .select('id')
                .single();
            if (onlineError) throw onlineError;

            if (priced.rewardApplied) {
                const { error: rewardError } = await supabase
                    .from('loyalty_redemptions')
                    .insert({ phone_digits: digits, source: 'online', online_order_id: saved.id });
                // The order and payment are fine; a missed redemption only
                // means the customer keeps a free drink. Log, don't refund.
                if (rewardError) console.error('[checkout] redemption not recorded', rewardError);
            }

            const after = await loyaltyCard(digits, supabase).catch(() => punchCard(0, 0));
            return reply(200, {
                orderNumber,
                total: priced.total,
                receiptUrl: payment.receipt_url ?? null,
                rewardApplied: priced.rewardApplied,
                card: after,
            });
        } catch (saveError) {
            console.error('[checkout] could not save a paid order, refunding', payment.id, saveError);
            // Without this the stations would show an order nobody paid for.
            if (savedRowIds.length) {
                const { error: undoError } = await supabase.from('orders').delete().in('id', savedRowIds);
                if (undoError) console.error('[checkout] could not remove the unsaved order rows', savedRowIds, undoError);
            }
            const refund = await refundPayment(square, {
                paymentId: payment.id,
                amountCents: priced.amountCents,
                idempotencyKey: crypto.randomUUID(),
            });
            if (!refund.ok) console.error('[checkout] REFUND FAILED, refund by hand in Square', payment.id, refund.errors);
            return reply(500, {
                error: refund.ok
                    ? 'We could not place your order, so your card was refunded. Please order at the stand.'
                    : 'We could not place your order. Please show this to staff at the stand so they can refund you.',
            });
        }
    } catch (error) {
        console.error('[checkout]', error);
        return reply(503, { error: 'Online ordering is unavailable right now. Please order at the stand.' });
    }
}
