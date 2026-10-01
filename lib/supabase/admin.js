import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { checkServiceKey } from '@/lib/supabase/serviceKey';

/**
 * A Supabase client with the service-role key, for the staff-only admin API.
 * It bypasses RLS, so it must never reach the browser: `server-only` makes
 * importing this from a client component a build error.
 *
 * Throws a message staff can act on when the key is missing or wrong.
 */
export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set for this deployment.');
    const check = checkServiceKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!check.ok) throw new Error(check.message);
    return createClient(url, check.key, { auth: { persistSession: false } });
}

export const MENU_PHOTO_BUCKET = 'menu-photos';
