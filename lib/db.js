import { createClient } from '@supabase/supabase-js';

// Create a single supabase client for the browser
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Fetch the menu from Supabase
 * Expected table: menu(id, category, name, price, created_at)
 */
export async function getMenu() {
    const { data, error } = await supabase
        .from('menu')
        .select('id, category, name, price')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        console.error('Error fetching menu:', error);
        return [];
    }
    return data || [];
}

/**
 * Fetch order history and return grouped (array of arrays),
 * sorted from latest orderNumber → oldest.
 * Inside each order group, items are sorted by timestamp ascending.
 *
 * Expected table: orders(id, orderNumber, name, price, type, timestamp)
 */
export async function getOrderHistory() {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('orderNumber', { ascending: false })
        .order('timestamp', { ascending: true });

    if (error) {
        console.error('Supabase fetch error:', error);
        return [];
    }

    // Group rows by orderNumber
    const groupedMap = data.reduce((acc, row) => {
        if (!acc[row.orderNumber]) acc[row.orderNumber] = [];
        acc[row.orderNumber].push(row);
        return acc;
    }, {});

    // Convert to array sorted by orderNumber desc (latest first)
    const groups = Object.keys(groupedMap)
        .sort((a, b) => Number(b) - Number(a))
        .map((key) => groupedMap[key]);

    return groups;
}

/**
 * Get the latest orderNumber to keep sequential order numbering
 */
export async function getLatestOrderNumber() {
    const { data, error } = await supabase
        .from('orders')
        .select('orderNumber')
        .order('orderNumber', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Failed to fetch latest order number:', error);
        return 0;
    }
    return data?.[0]?.orderNumber || 0;
}

/**
 * Save one row per unit (expands quantities in the caller)
 * orders: Array<{ orderNumber, name, price, type, timestamp }>
 */
export async function saveOrderHistory(orders) {
    const { error } = await supabase.from('orders').insert(orders);

    if (error) {
        console.error('Supabase insert error:', error);
        throw new Error(error.message || 'Failed to save order history');
    }
}

/**
 * (Optional) Delete a single order item by id — handy for history edits
 */
export async function deleteOrderItem(id) {
    const { error } = await supabase.from('orders').delete().eq('id', id);

    if (error) {
        console.error('Supabase delete error:', error);
        throw new Error(error.message || 'Failed to delete order item');
    }
}
