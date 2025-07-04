import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

export async function getOrderHistory() {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('timestamp', { ascending: false });

    if (error) {
        console.error('Supabase fetch error:', error);
        return [];
    }

    const grouped = data.reduce((acc, item) => {
        if (!acc[item.orderNumber]) acc[item.orderNumber] = [];
        acc[item.orderNumber].push(item);
        return acc;
    }, {});
    return Object.values(grouped);
}

// ✅ Subscribe to new inserts in orders
export function listenToOrderInserts(onNewOrder) {
    const channel = supabase
        .channel('orders-watch')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'orders',
            },
            (payload) => {
                console.log('🔔 New order detected:', payload);
                onNewOrder(payload.new);
            }
        )
        .subscribe();

    return channel;
}

export function unsubscribe(channel) {
    if (channel) {
        supabase.removeChannel(channel);
    }
}

export async function saveOrderHistory(orders) {
    const { error } = await supabase.from('orders').insert(orders);
    if (error) {
        console.error('Supabase insert error:', error);
    }
}
