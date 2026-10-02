import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { popupFromRow } from '@/lib/site/popups';
import { STAMP_TYPES, punchCard } from '@/lib/online/loyalty';
import { onlineOrderingWindow } from '@/lib/online/popupWindow';
import { shopDateKey, shopTimeZone } from '@/lib/online/shopTime';

// Server-side reads shared by the online-ordering and loyalty API routes.
// They use the service-role client: online_orders and loyalty_redemptions
// aren't readable with the browser's key at all.

/** The pop-up taking online orders now (if any), plus the next one. */
export async function currentOrderingWindow(supabase = createAdminClient(), now = new Date()) {
    const timeZone = shopTimeZone();
    const today = shopDateKey(now, timeZone);
    const { data, error } = await supabase
        .from('site_popups')
        .select('id, date, start_time, end_time, name, place, address, note, latitude, longitude')
        .gte('date', today)
        .order('date')
        .order('start_time')
        .limit(20);
    if (error) throw error;
    return { ...onlineOrderingWindow(data.map(popupFromRow), now, timeZone), timeZone };
}

/** Name, status, photo and description of every Menu Items row. */
export async function siteMenuRows(supabase = createAdminClient()) {
    const { data, error } = await supabase.from('site_menu_items').select('name, status, image_url, description');
    if (error) throw error;
    return data;
}

/** One phone's punch card. */
export async function loyaltyCard(digits, supabase = createAdminClient()) {
    const { data, error } = await supabase.rpc('loyalty_summary', { p_digits: digits, p_types: STAMP_TYPES });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return punchCard(row?.paid_drinks ?? 0, row?.redeemed ?? 0);
}

/** A pop-up as the customer page shows it (no internal ids beyond what it needs). */
export const publicPopup = (popup) =>
    popup && {
        name: popup.name,
        place: popup.place,
        address: popup.address,
        date: popup.date,
        start: popup.start,
        end: popup.end,
        latitude: popup.latitude,
        longitude: popup.longitude,
    };
