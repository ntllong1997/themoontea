import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { failure, newCalendarToken } from '@/lib/schedule/scheduleData';
import { createAdminClient } from '@/lib/supabase/admin';

/** A new calendar link for an employee. The old link stops working. */
export async function POST(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    try {
        const token = newCalendarToken();
        const { error } = await createAdminClient()
            .from('staff_calendar_links')
            .upsert({ employee_id: id, token, created_at: new Date().toISOString() }, { onConflict: 'employee_id' });
        if (error) throw error;
        return NextResponse.json({ calendarToken: token });
    } catch (error) {
        return failure(error);
    }
}
