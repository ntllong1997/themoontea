import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { normalizePhone } from '@/lib/online/loyalty';
import { loyaltyCard } from '@/lib/online/onlineData';
import { createAdminClient } from '@/lib/supabase/admin';

const bad = (message, status = 400) => NextResponse.json({ error: message }, { status });

/** Staff lookup: a customer's card and their recent free drinks. */
export async function GET(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const digits = normalizePhone(request.nextUrl.searchParams.get('phone'));
    if (!digits) return bad('Enter a 10-digit phone number.');
    try {
        const supabase = createAdminClient();
        const [card, { data: redemptions, error }] = await Promise.all([
            loyaltyCard(digits, supabase),
            supabase
                .from('loyalty_redemptions')
                .select('source, created_at')
                .eq('phone_digits', digits)
                .order('created_at', { ascending: false })
                .limit(5),
        ]);
        if (error) throw error;
        return NextResponse.json({ card, redemptions });
    } catch (error) {
        return bad(error?.message ?? String(error), 500);
    }
}

/** Staff gives a free drink at the stand: records it against the card. */
export async function POST(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const digits = normalizePhone(body.phone);
    if (!digits) return bad('Enter a 10-digit phone number.');
    try {
        const supabase = createAdminClient();
        const card = await loyaltyCard(digits, supabase);
        if (card.rewardsAvailable < 1) return bad('This customer has no free drink ready yet.', 409);
        const { error } = await supabase.from('loyalty_redemptions').insert({ phone_digits: digits, source: 'staff' });
        if (error) throw error;
        return NextResponse.json({ card: await loyaltyCard(digits, supabase) });
    } catch (error) {
        return bad(error?.message ?? String(error), 500);
    }
}
