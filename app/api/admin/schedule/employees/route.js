import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseEmployeeName } from '@/lib/schedule/schedule';
import { ensureCalendarLink, failure } from '@/lib/schedule/scheduleData';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Add an employee. They go in the same `employees` list Inventory uses. They
 * get no inventory PIN here: `pin_hash` is random, so no PIN matches until an
 * admin sets one in Inventory → Employees.
 */
export async function POST(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { name, error: invalid } = parseEmployeeName((await request.json().catch(() => ({}))).name);
    if (invalid) return failure(invalid, 400);
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('employees')
            .insert({ name, role: 'employee', pin_hash: randomBytes(32).toString('hex') })
            .select('id, name, role')
            .single();
        if (error) throw error;
        await ensureCalendarLink(supabase, data.id);
        return NextResponse.json({ employee: data }, { status: 201 });
    } catch (error) {
        return failure(error);
    }
}
