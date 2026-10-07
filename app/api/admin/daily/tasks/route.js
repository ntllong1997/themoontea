import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { TASK_COLUMNS, failure, today } from '@/lib/daily/dailyData';
import { parseTaskInput, taskFromRow } from '@/lib/daily/dailyStock';
import { createAdminClient } from '@/lib/supabase/admin';

/** Add a task to the Today board, for today or a later day. */
export async function POST(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { values, error: invalid } = parseTaskInput(await request.json().catch(() => null), today());
    if (invalid) return failure(invalid, 400);
    try {
        const { data, error } = await createAdminClient().from('daily_tasks').insert(values).select(TASK_COLUMNS).single();
        if (error) throw error;
        return NextResponse.json({ task: taskFromRow(data) }, { status: 201 });
    } catch (error) {
        return failure(error);
    }
}
