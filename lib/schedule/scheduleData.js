import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { shiftFromRow, timeOffFromRow } from '@/lib/schedule/schedule';

// Server-side reads and writes for the staff schedule. Everything goes
// through the service-role client: the schedule tables have no policies, so
// the browser's key can't read them (and so can't learn anyone's calendar link).

export const SHIFT_COLUMNS = 'id, employee_id, repeat, weekday, start_date, end_date, date, start_time, end_time, note, skip_dates';
export const TIME_OFF_COLUMNS = 'id, employee_id, start_date, end_date, note';

export const failure = (error, status = 500) => NextResponse.json({ error: error?.message ?? String(error) }, { status });

/** A new secret for a calendar link: 24 URL-safe characters, unguessable. */
export const newCalendarToken = () => randomBytes(18).toString('base64url');

/** Give an employee a calendar link if they don't have one yet. */
export async function ensureCalendarLink(supabase, employeeId) {
    const { error } = await supabase
        .from('staff_calendar_links')
        .upsert({ employee_id: employeeId, token: newCalendarToken() }, { onConflict: 'employee_id', ignoreDuplicates: true });
    if (error) throw error;
}

/** Everything the schedule page shows. */
export async function loadSchedule(supabase = createAdminClient()) {
    const [employees, links, shifts, timeOff] = await Promise.all([
        supabase.from('employees').select('id, name, role').order('name'),
        supabase.from('staff_calendar_links').select('employee_id, token'),
        supabase.from('staff_shifts').select(SHIFT_COLUMNS),
        supabase.from('staff_time_off').select(TIME_OFF_COLUMNS).order('start_date'),
    ]);
    for (const result of [employees, links, shifts, timeOff]) if (result.error) throw result.error;

    // Employees added before the schedule existed (e.g. in Inventory) get a link now.
    const linked = new Map(links.data.map((link) => [link.employee_id, link.token]));
    const missing = employees.data.filter((e) => !linked.has(e.id));
    if (missing.length) {
        await Promise.all(missing.map((e) => ensureCalendarLink(supabase, e.id)));
        const { data, error } = await supabase.from('staff_calendar_links').select('employee_id, token');
        if (error) throw error;
        for (const link of data) linked.set(link.employee_id, link.token);
    }

    return {
        employees: employees.data.map((e) => ({ id: e.id, name: e.name, role: e.role, calendarToken: linked.get(e.id) })),
        shifts: shifts.data.map(shiftFromRow),
        timeOff: timeOff.data.map(timeOffFromRow),
    };
}

/** Take one date out of a weekly shift. */
export async function skipDay(supabase, shiftId, date) {
    const { data: shift, error } = await supabase.from('staff_shifts').select('repeat, skip_dates').eq('id', shiftId).maybeSingle();
    if (error) throw error;
    if (!shift) return { error: 'That shift no longer exists', status: 404 };
    if (shift.repeat !== 'weekly') return { error: 'Only a weekly shift can skip a day', status: 400 };
    const skipDates = [...new Set([...(shift.skip_dates ?? []), date])].sort();
    const { error: saveError } = await supabase.from('staff_shifts').update({ skip_dates: skipDates }).eq('id', shiftId);
    if (saveError) throw saveError;
    return { ok: true };
}
