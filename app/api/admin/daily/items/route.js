import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { ITEM_COLUMNS, failure } from '@/lib/daily/dailyData';
import { itemFromRow, parseItemInput } from '@/lib/daily/dailyStock';
import { createAdminClient } from '@/lib/supabase/admin';

/** Add an item to the end-of-day check. */
export async function POST(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { values, error: invalid } = parseItemInput(await request.json().catch(() => null));
    if (invalid) return failure(invalid, 400);
    try {
        const { data, error } = await createAdminClient().from('daily_stock_items').insert(values).select(ITEM_COLUMNS).single();
        if (error) throw error;
        return NextResponse.json({ item: itemFromRow(data) }, { status: 201 });
    } catch (error) {
        return failure(error);
    }
}
