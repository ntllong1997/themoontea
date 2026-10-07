import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { isDateKey, parseShiftInput, shiftFromRow } from '@/lib/schedule/schedule';
import { SHIFT_COLUMNS, failure, skipDay } from '@/lib/schedule/scheduleData';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Add a shift. With `replaces: { shiftId, date }` it's "change just this
 * day": that weekly shift skips the date and this one-off shift takes its place.
 */
export async function POST(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const body = await request.json().catch(() => null);
    const { values, error: invalid } = parseShiftInput(body);
    if (invalid) return failure(invalid, 400);
    try {
        const supabase = createAdminClient();
        const replaces = body.replaces;
        if (replaces) {
            if (!isDateKey(replaces.date) || typeof replaces.shiftId !== 'string') return failure('Something went wrong. Please try again.', 400);
            const skipped = await skipDay(supabase, replaces.shiftId, replaces.date);
            if (skipped.error) return failure(skipped.error, skipped.status);
        }
        const { data, error } = await supabase.from('staff_shifts').insert(values).select(SHIFT_COLUMNS).single();
        if (error) throw error;
        return NextResponse.json({ shift: shiftFromRow(data) }, { status: 201 });
    } catch (error) {
        return failure(error);
    }
}
