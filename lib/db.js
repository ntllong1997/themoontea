import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function getOrderHistory() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('timestamp', start.toISOString())
        .lte('timestamp', end.toISOString())
        .order('orderNumber', { ascending: false }) // Latest orderNumber first
        .order('timestamp', { ascending: true });   // Inside each order, sort oldest to newest

    if (error) {
        console.error('Supabase fetch error:', error?.message || JSON.stringify(error));
        return [];
    }

    // Group orders by orderNumber
    const grouped = data.reduce((acc, item) => {
        if (!acc[item.orderNumber]) acc[item.orderNumber] = [];
        acc[item.orderNumber].push(item);
        return acc;
    }, {});

    // Return array of groups (latest to oldest)
    const sortedGroups = Object.keys(grouped)
        .sort((a, b) => b - a) // Sort orderNumbers descending
        .map((orderNumber) => grouped[orderNumber]);

    return sortedGroups;
}

export async function saveOrderHistory(orders) {
    const { error } = await supabase.from('orders').insert(orders);
    if (error) {
        console.error('Supabase insert error:', error);
        throw new Error(error.message);
    }
}

export async function updateOrderPhone(orderNumber, phone) {
    // orderNumber resets to 1 each day (see getNextOrderNumber), so it's only
    // unique *within a day* — without these bounds this silently overwrites
    // the phone number on every past day's order sharing the same number too.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { error } = await supabase
        .from('orders')
        .update({ phone: phone || null })
        .eq('orderNumber', orderNumber)
        .gte('timestamp', start.toISOString())
        .lte('timestamp', end.toISOString());
    if (error) console.error('Failed to update phone:', error);
}

// Atomically computes the next order number via the next_order_number
// Postgres function, which serializes concurrent callers (any device, web
// or app) behind an advisory lock scoped to the day. Collisions are
// structurally impossible rather than avoided by retrying, and both the
// web app and the iOS app now call the same function, so they can't race
// each other either (each client's own read-check-retry loop couldn't see
// the other client's in-flight write).
export async function getNextOrderNumber() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase.rpc('next_order_number', {
        range_start: start.toISOString(),
        range_end: end.toISOString(),
    });
    if (error) {
        console.error('Failed to get next order number:', error);
        throw new Error(error.message);
    }
    return data;
}
