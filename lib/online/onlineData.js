import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { popupFromRow } from '@/lib/site/popups';
import { onlineOrderingWindow } from '@/lib/online/popupWindow';
import { shopDateKey, shopTimeZone } from '@/lib/online/shopTime';

// Server-side reads for the online-ordering API routes. They use the
// service-role client: online_orders isn't readable with the browser's key.

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
