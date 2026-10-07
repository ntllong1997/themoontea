import 'server-only';
import { NextResponse } from 'next/server';
import { shopTimeZone } from '@/lib/online/shopTime';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildBoard, checkFromRow, itemFromRow, planFromCheck, shopDay, taskFromRow } from '@/lib/daily/dailyStock';

// Server-side reads for the daily stock check and the Today board. Everything
// goes through the service-role client: these tables have no policies.

export const ITEM_COLUMNS = 'id, name, kind, unit, target';
export const CHECK_COLUMNS = 'id, check_date, employee_name, counts, note, submitted_at';
export const TASK_COLUMNS = 'id, kind, title, quantity, unit, item_id, for_date, note, added_by, done_at, done_by, created_at';

/** An error response; a duplicate item name gets words staff understand. */
export function failure(error, status = 500) {
    if (error?.code === '23505') return NextResponse.json({ error: 'There is already an item with that name' }, { status: 409 });
    return NextResponse.json({ error: error?.message ?? String(error) }, { status });
}

/** Today on the shop's calendar (rolling over at 4am), from the server's clock. */
export const today = (now = new Date()) => shopDay(now, shopTimeZone());

/** Everything the Daily Check tab and the Today board show. */
export async function loadDaily(supabase = createAdminClient(), now = new Date()) {
    const timeZone = shopTimeZone();
    const day = shopDay(now, timeZone);
    // Long enough to cover the whole shop day, whatever time it is now.
    const doneSince = new Date(now.getTime() - 36 * 3600000).toISOString();
    const [items, checks, open, done, employees] = await Promise.all([
        supabase.from('daily_stock_items').select(ITEM_COLUMNS).order('name'),
        supabase.from('daily_stock_checks').select(CHECK_COLUMNS).order('check_date', { ascending: false }).limit(1),
        supabase.from('daily_tasks').select(TASK_COLUMNS).is('done_at', null),
        supabase.from('daily_tasks').select(TASK_COLUMNS).gte('done_at', doneSince),
        supabase.from('employees').select('id, name').order('name'),
    ]);
    for (const result of [items, checks, open, done, employees]) if (result.error) throw result.error;

    const latest = checks.data[0] ? checkFromRow(checks.data[0]) : null;
    return {
        today: day,
        timeZone,
        items: items.data.map(itemFromRow),
        latestCheck: latest && { ...latest, ...planFromCheck(latest) },
        board: buildBoard([...open.data, ...done.data].map(taskFromRow), { today: day, timeZone }),
        employees: employees.data,
    };
}
