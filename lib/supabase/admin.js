import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * A Supabase client with the service-role key, for the staff-only admin API.
 * It bypasses RLS, so it must never reach the browser: `server-only` makes
 * importing this from a client component a build error.
 */
export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        throw new Error(
            'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to the site settings (Supabase → Project Settings → API).'
        );
    }
    return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export const MENU_PHOTO_BUCKET = 'menu-photos';
