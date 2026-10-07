import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { TASK_COLUMNS, failure } from '@/lib/daily/dailyData';
import { taskFromRow } from '@/lib/daily/dailyStock';
import { createAdminClient } from '@/lib/supabase/admin';

/** Tick a task off ({ done: true, by }) or put it back ({ done: false }). */
export async function PATCH(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    const body = (await request.json().catch(() => null)) ?? {};
    const by = typeof body.by === 'string' ? body.by.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
    if (body.done === true && !by) return failure('Pick your name first', 400);
    const values = body.done === true ? { done_at: new Date().toISOString(), done_by: by } : { done_at: null, done_by: null };
    try {
        const { data, error } = await createAdminClient().from('daily_tasks').update(values).eq('id', id).select(TASK_COLUMNS);
        if (error) throw error;
        if (!data.length) return failure('That task no longer exists', 404);
        return NextResponse.json({ task: taskFromRow(data[0]) });
    } catch (error) {
        return failure(error);
    }
}

/** Remove a task from the board. */
export async function DELETE(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    try {
        const { error } = await createAdminClient().from('daily_tasks').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}
