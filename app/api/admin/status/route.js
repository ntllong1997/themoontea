import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Can this deployment save menu items and pop-ups? The admin page calls this
 * on load and shows the answer as a banner, so a setup problem is spelled out
 * before anyone tries to save. Reveals nothing about the key itself.
 */
export async function GET(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;
    const reply = (body) => NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
    try {
        const supabase = createAdminClient();
        // A real round trip, so a key Supabase rejects is caught too.
        const checks = await Promise.all(
            ['site_menu_items', 'site_popups'].map((table) =>
                supabase.from(table).select('id', { head: true, count: 'exact' }).limit(1)
            )
        );
        const failed = checks.find((result) => result.error);
        if (failed) {
            const message = failed.error.message || `Supabase answered ${failed.status}`;
            return reply({
                ok: false,
                message: /invalid|jwt|api key|unauthor/i.test(message)
                    ? `Supabase rejected SUPABASE_SERVICE_ROLE_KEY (${message}). Copy the service_role key again from Supabase → Project Settings → API Keys, update it in Vercel, then Redeploy.`
                    : `Supabase error: ${message}`,
            });
        }
        return reply({ ok: true });
    } catch (error) {
        return reply({ ok: false, message: error?.message ?? String(error) });
    }
}
