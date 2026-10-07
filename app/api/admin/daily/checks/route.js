import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { CHECK_COLUMNS, ITEM_COLUMNS, failure, today } from '@/lib/daily/dailyData';
import { checkFromRow, checkSnapshot, itemFromRow, makeTaskRows, parseCheckInput, planFromCounts } from '@/lib/daily/dailyStock';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Finish tonight's check. Saves the counts (replacing tonight's earlier check,
 * if any), then swaps the make list that isn't done yet for a new one from
 * these counts, for tomorrow.
 */
export async function POST(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const body = await request.json().catch(() => null);
    try {
        const supabase = createAdminClient();
        const { data: rows, error: itemsError } = await supabase.from('daily_stock_items').select(ITEM_COLUMNS).order('name');
        if (itemsError) throw itemsError;
        const items = rows.map(itemFromRow);
        const { values, error: invalid } = parseCheckInput(body, items);
        if (invalid) return failure(invalid, 400);

        // Someone removed while still signed in on a device: keep their name, drop the link.
        if (values.employeeId) {
            const { data: employee, error: employeeError } = await supabase.from('employees').select('id').eq('id', values.employeeId).maybeSingle();
            if (employeeError) throw employeeError;
            if (!employee) values.employeeId = null;
        }

        const checkDate = today();
        const { data: saved, error } = await supabase
            .from('daily_stock_checks')
            .upsert(
                {
                    check_date: checkDate,
                    employee_id: values.employeeId,
                    employee_name: values.employeeName,
                    counts: checkSnapshot(items, values.counts),
                    note: values.note,
                    submitted_at: new Date().toISOString(),
                },
                { onConflict: 'check_date' }
            )
            .select(CHECK_COLUMNS)
            .single();
        if (error) throw error;

        // The new count is the truth: anything still to make from an earlier check goes.
        const cleared = await supabase.from('daily_tasks').delete().eq('kind', 'make').is('done_at', null);
        if (cleared.error) throw cleared.error;
        const plan = planFromCounts(items, values.counts);
        if (plan.make.length) {
            const rows = makeTaskRows(plan.make, { checkId: saved.id, checkDate, by: values.employeeName });
            const inserted = await supabase.from('daily_tasks').insert(rows);
            if (inserted.error) throw inserted.error;
        }
        return NextResponse.json({ check: checkFromRow(saved), ...plan }, { status: 201 });
    } catch (error) {
        return failure(error);
    }
}
