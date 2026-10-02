import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { FALLBACK_ITEMS } from '@/lib/site/menu';
import { popupFromRow } from '@/lib/site/popups';

function anonClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

/**
 * The visible menu items for the public page, read with the anon key (which
 * RLS limits to non-hidden rows). Falls back to the built-in menu if Supabase
 * is not configured or can't be reached, so the page never comes up empty.
 */
export async function getPublicMenuItems() {
    const supabase = anonClient();
    if (!supabase) return FALLBACK_ITEMS;
    try {
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

/**
 * Pop-ups from yesterday on, soonest first. The calendar drops anything
 * before the viewer's own today; starting a day early covers every time zone.
 * An empty list (and the "new dates coming soon" card) if Supabase is down.
 */
export async function getPublicPopups() {
    const supabase = anonClient();
    if (!supabase) return [];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
        const { data, error } = await supabase
            .from('site_popups')
            .select('id, date, start_time, end_time, name, place, address, note, latitude, longitude')
            .gte('date', yesterday)
            .order('date')
            .order('start_time');
        if (error) throw error;
        return data.map(popupFromRow);
    } catch (error) {
        console.error('[menu] could not load pop-ups:', error.message ?? error);
        return [];
    }
}
