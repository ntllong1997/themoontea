import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { FALLBACK_ITEMS } from '@/lib/site/menu';

/**
 * The visible menu items for the public page, read with the anon key (which
 * RLS limits to non-hidden rows). Falls back to the built-in menu if Supabase
 * is not configured or can't be reached, so the page never comes up empty.
 */
export async function getPublicMenuItems() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return FALLBACK_ITEMS;
    try {
        const supabase = createClient(url, key, { auth: { persistSession: false } });
        const { data, error } = await supabase
            .from('site_menu_items')
            .select('id, category, name, description, price, price_note, image_url, status, tags, sort_order')
            .order('sort_order');
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[menu] could not load items, showing the built-in menu:', error.message ?? error);
        return FALLBACK_ITEMS;
    }
}
