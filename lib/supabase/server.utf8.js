import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables.');
}

export const createSupabaseServerClient = (accessToken) =>
    createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: accessToken
                ? { Authorization: `Bearer ${accessToken}` }
                : undefined,
        },
    });
