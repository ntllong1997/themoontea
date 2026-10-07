import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { failure } from '@/lib/schedule/scheduleData';
import { createAdminClient } from '@/lib/supabase/admin';

/** Cancel days off: the shifts come back. */
export async function DELETE(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    try {
        const { error } = await createAdminClient().from('staff_time_off').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}
