import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createAdminClient } from '@/lib/supabase/admin';
import { parsePopupInput, popupFromRow } from '@/lib/site/popups';

const COLUMNS = 'id, date, start_time, end_time, name, place, address, note, latitude, longitude';

const failure = (error, status = 500) =>
    NextResponse.json({ error: error?.message ?? String(error) }, { status });

/** Every pop-up, past ones included, for the admin page. */
export async function GET(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    try {
        const { data, error } = await createAdminClient()
            .from('site_popups')
            .select(COLUMNS)
            .order('date')
            .order('start_time');
        if (error) throw error;
        return NextResponse.json({ popups: data.map(popupFromRow) });
    } catch (error) {
        return failure(error);
    }
}

export async function POST(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { values, error: invalid } = parsePopupInput(await request.json().catch(() => null));
    if (invalid) return failure(invalid, 400);
    try {
        const { data, error } = await createAdminClient().from('site_popups').insert(values).select(COLUMNS).single();
        if (error) throw error;
        revalidatePath('/menu');
        return NextResponse.json({ popup: popupFromRow(data) }, { status: 201 });
    } catch (error) {
        return failure(error);
    }
}
