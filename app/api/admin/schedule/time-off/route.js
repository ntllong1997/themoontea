import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseTimeOffInput, timeOffFromRow } from '@/lib/schedule/schedule';
import { TIME_OFF_COLUMNS, failure } from '@/lib/schedule/scheduleData';
import { createAdminClient } from '@/lib/supabase/admin';

/** Record days off. That person's shifts on those days disappear from the schedule and their calendar. */
export async function POST(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { values, error: invalid } = parseTimeOffInput(await request.json().catch(() => null));
    if (invalid) return failure(invalid, 400);
    try {
        const { data, error } = await createAdminClient().from('staff_time_off').insert(values).select(TIME_OFF_COLUMNS).single();
        if (error) throw error;
        return NextResponse.json({ timeOff: timeOffFromRow(data) }, { status: 201 });
    } catch (error) {
        return failure(error);
    }
}
