import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { failure, loadDaily } from '@/lib/daily/dailyData';

/** The items to count, the latest check, the Today board and who's on the team. */
export async function GET(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    try {
        return NextResponse.json(await loadDaily(), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return failure(error);
    }
}
