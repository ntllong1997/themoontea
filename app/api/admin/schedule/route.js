import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { failure, loadSchedule } from '@/lib/schedule/scheduleData';

/** Employees (with their calendar links), shifts, days off and pop-ups. */
export async function GET(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    try {
        return NextResponse.json(await loadSchedule(), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return failure(error);
    }
}
