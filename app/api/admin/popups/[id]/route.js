import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createAdminClient } from '@/lib/supabase/admin';
import { parsePopupInput, popupFromRow } from '@/lib/site/popups';

const COLUMNS = 'id, date, start_time, end_time, name, place, address, note, latitude, longitude';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const failure = (error, status = 500) =>
    NextResponse.json({ error: error?.message ?? String(error) }, { status });

/** Replace a pop-up's details (the edit form always sends all of them). */
export async function PATCH(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    if (!UUID.test(id)) return failure('Unknown pop-up', 404);
    const { values, error: invalid } = parsePopupInput(await request.json().catch(() => null));
    if (invalid) return failure(invalid, 400);
    try {
        const { data, error } = await createAdminClient()
            .from('site_popups')
            .update(values)
            .eq('id', id)
            .select(COLUMNS)
            .single();
        if (error) throw error;
        revalidatePath('/menu');
        return NextResponse.json({ popup: popupFromRow(data) });
    } catch (error) {
        return failure(error);
    }
}

export async function DELETE(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    if (!UUID.test(id)) return failure('Unknown pop-up', 404);
    try {
        const { error } = await createAdminClient().from('site_popups').delete().eq('id', id);
        if (error) throw error;
        revalidatePath('/menu');
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}
