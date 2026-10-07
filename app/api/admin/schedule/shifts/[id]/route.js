import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { addDays, isDateKey } from '@/lib/schedule/schedule';
import { SHIFT_COLUMNS, failure, skipDay } from '@/lib/schedule/scheduleData';
import { createAdminClient } from '@/lib/supabase/admin';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Change a shift:
 *   { action: 'skip', date }         remove just that day (weekly)
 *   { action: 'stop', date }         stop repeating from that day on (weekly)
 *   { start, end, note }             change the times, every time it happens
 */
export async function PATCH(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    const body = (await request.json().catch(() => null)) ?? {};
    try {
        const supabase = createAdminClient();
        if (body.action === 'skip') {
            if (!isDateKey(body.date)) return failure('Pick a date', 400);
            const skipped = await skipDay(supabase, id, body.date);
            return skipped.error ? failure(skipped.error, skipped.status) : NextResponse.json({ ok: true });
        }
        if (body.action === 'stop') {
            if (!isDateKey(body.date)) return failure('Pick a date', 400);
            const { data: shift, error } = await supabase.from('staff_shifts').select('repeat, start_date').eq('id', id).maybeSingle();
            if (error) throw error;
            if (!shift) return failure('That shift no longer exists', 404);
            if (shift.repeat !== 'weekly') return failure('Only a weekly shift repeats', 400);
            // Stopping on or before its first day means it never happens: delete it.
            const lastDay = addDays(body.date, -1);
            const result =
                lastDay < shift.start_date
                    ? await supabase.from('staff_shifts').delete().eq('id', id)
                    : await supabase.from('staff_shifts').update({ end_date: lastDay }).eq('id', id);
            if (result.error) throw result.error;
            return NextResponse.json({ ok: true });
        }
        const start = typeof body.start === 'string' ? body.start : '';
        const end = typeof body.end === 'string' ? body.end : '';
        if (!TIME.test(start) || !TIME.test(end)) return failure('Set a start and end time', 400);
        if (end <= start) return failure('The end time must be after the start time', 400);
        const note = typeof body.note === 'string' ? body.note.trim().replace(/\s+/g, ' ').slice(0, 120) || null : null;
        const { data, error } = await supabase
            .from('staff_shifts')
            .update({ start_time: start, end_time: end, note })
            .eq('id', id)
            .select(SHIFT_COLUMNS);
        if (error) throw error;
        if (!data.length) return failure('That shift no longer exists', 404);
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}

/** Delete a shift completely (every week, for a weekly one). */
export async function DELETE(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    try {
        const { error } = await createAdminClient().from('staff_shifts').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}
