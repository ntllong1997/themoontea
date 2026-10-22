import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '@/lib/auth/requireStaff';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * A database session for the staff login, handed to a signed-in till so it
 * reads and writes orders as staff rather than with the public key (see
 * supabase/migrations/20261022120000_staff_access.sql). The browser keeps it
 * and refreshes it itself; it only comes back here when it has none.
 *
 * The login's email and password stay on the server: STAFF_SUPABASE_EMAIL and
 * STAFF_SUPABASE_PASSWORD, made with scripts/create-staff-user.mjs.
 */
export async function GET(request) {
    const denied = await requireStaff(request);
    if (denied) return denied;

    const email = (process.env.STAFF_SUPABASE_EMAIL ?? '').trim();
    const password = process.env.STAFF_SUPABASE_PASSWORD ?? '';
    if (!email || !password) {
        return NextResponse.json(
            { error: 'No staff database login on this deployment. Set STAFF_SUPABASE_EMAIL and STAFF_SUPABASE_PASSWORD, then redeploy.' },
            { status: 503, headers: noStore }
        );
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
        console.error('[supabase-session] staff sign-in failed:', error?.message ?? 'no session');
        return NextResponse.json(
            { error: `The staff database login was refused (${error?.message ?? 'no session'}). Check STAFF_SUPABASE_EMAIL and STAFF_SUPABASE_PASSWORD.` },
            { status: 502, headers: noStore }
        );
    }

    const { access_token, refresh_token } = data.session;
    return NextResponse.json({ access_token, refresh_token }, { headers: noStore });
}
