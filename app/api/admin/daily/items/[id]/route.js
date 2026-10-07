import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { ITEM_COLUMNS, failure } from '@/lib/daily/dailyData';
import { itemFromRow, parseItemInput } from '@/lib/daily/dailyStock';
import { createAdminClient } from '@/lib/supabase/admin';

/** Change an item's name, kind, unit or target. Past checks keep what they saw. */
export async function PATCH(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    const { values, error: invalid } = parseItemInput(await request.json().catch(() => null));
    if (invalid) return failure(invalid, 400);
    try {
        const { data, error } = await createAdminClient().from('daily_stock_items').update(values).eq('id', id).select(ITEM_COLUMNS);
        if (error) throw error;
        if (!data.length) return failure('That item no longer exists', 404);
        return NextResponse.json({ item: itemFromRow(data[0]) });
    } catch (error) {
        return failure(error);
    }
}

/** Stop counting an item. Its open make tasks stay on the board. */
export async function DELETE(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    try {
        const { error } = await createAdminClient().from('daily_stock_items').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}
