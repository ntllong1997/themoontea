import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createAdminClient } from '@/lib/supabase/admin';
import { shopTimeZone } from '@/lib/online/shopTime';
import { COLUMNS, CSV_LIMIT, entryFromRow, parseLogQuery, searchFilter, toCsv } from '@/lib/logs/activityLog';

// Supabase returns at most this many rows per request, so a CSV download
// is fetched in pages of it.
const PAGE = 1000;

const failure = (error, status = 500) =>
    NextResponse.json({ error: error?.message ?? String(error) }, { status, headers: { 'Cache-Control': 'no-store' } });

/** Spell out the one setup problem everyone hits first. */
function explain(error) {
    if (error?.code === 'PGRST205' || error?.code === '42P01') {
        return new Error(
            'The activity_log table does not exist yet. In Supabase, open SQL Editor and run supabase/migrations/20261014120000_activity_log.sql.'
        );
    }
    return error;
}

/**
 * The iPad activity log for one shop-local day, newest first. See
 * parseLogQuery in lib/logs/activityLog.js for the query string; with
 * `since` it returns only rows that arrived after it, for live updates.
 */
export async function GET(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;

    const timeZone = shopTimeZone();
    const { query, error: invalid } = parseLogQuery(request.nextUrl.searchParams, { timeZone });
    if (invalid) return failure(invalid, 400);

    try {
        const supabase = createAdminClient();
        const select = (from, to) => {
            let q = supabase
                .from('activity_log')
                .select(COLUMNS)
                .gte('created_at', query.from)
                .lt('created_at', query.to);
            if (query.since) q = q.gt('received_at', query.since);
            if (query.levels) q = q.in('level', query.levels);
            if (query.category) q = q.eq('category', query.category);
            if (query.device) q = q.eq('device_id', query.device);
            if (query.search) q = q.or(searchFilter(query.search));
            return q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to);
        };

        if (query.format === 'csv') {
            const rows = [];
            while (rows.length < CSV_LIMIT) {
                const { data, error } = await select(rows.length, Math.min(rows.length + PAGE, CSV_LIMIT) - 1);
                if (error) throw explain(error);
                rows.push(...data);
                if (data.length < PAGE) break;
            }
            return new Response(toCsv(rows.map(entryFromRow), timeZone), {
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="moontea-activity-${query.day}.csv"`,
                    'Cache-Control': 'no-store',
                },
            });
        }

        const { data, error } = await select(0, query.limit - 1);
        if (error) throw explain(error);
        return NextResponse.json(
            {
                entries: data.map(entryFromRow),
                day: query.day,
                timeZone,
                truncated: data.length === query.limit,
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        return failure(error);
    }
}
