import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { parseEmployeeName } from '@/lib/schedule/schedule';
import { failure } from '@/lib/schedule/scheduleData';
import { createAdminClient } from '@/lib/supabase/admin';

/** Rename an employee. */
export async function PATCH(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    const { name, error: invalid } = parseEmployeeName((await request.json().catch(() => ({}))).name);
    if (invalid) return failure(invalid, 400);
    try {
        const { data, error } = await createAdminClient().from('employees').update({ name }).eq('id', id).select('id, name, role');
        if (error) throw error;
        if (!data.length) return failure('That employee no longer exists', 404);
        return NextResponse.json({ employee: data[0] });
    } catch (error) {
        return failure(error);
    }
}

/**
 * Remove an employee: their shifts, days off and calendar link go too
 * (foreign keys cascade), and so does their Inventory sign-in.
 */
export async function DELETE(request, { params }) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const { id } = await params;
    try {
        const { error } = await createAdminClient().from('employees').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}
