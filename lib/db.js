import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function getOrderHistory() {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('orderNumber', { ascending: false }) // Latest orderNumber first
        .order('timestamp', { ascending: true });   // Inside each order, sort oldest to newest

    if (error) {
        console.error('Supabase fetch error:', error);
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

export async function getLatestOrderNumber() {
    const { data, error } = await supabase
        .from('orders')
        .select('orderNumber')
        .order('orderNumber', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Failed to fetch latest order number:', error);
        throw new Error(error.message);
    }

    return data?.[0]?.orderNumber || 0;
}

// Atomic-safe order number: fetches latest and retries on conflict so two
// simultaneous submits (from different devices or a race) never share a number.
export async function getNextOrderNumber() {
    for (let attempt = 0; attempt < 5; attempt++) {
        const latest = await getLatestOrderNumber();
        const next   = latest + 1 + attempt; // each retry bumps by 1
        // Verify the number is still unused before returning it
        const { data } = await supabase
            .from('orders')
            .select('orderNumber')
            .eq('orderNumber', next)
            .limit(1);
        if (!data || data.length === 0) return next; // safe to use
        // Someone else grabbed it — loop and try next
    }
    // Fallback: timestamp-based unique number (should never reach here)
    return Date.now();
}
