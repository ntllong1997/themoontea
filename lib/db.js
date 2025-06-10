import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function getOrderHistory() {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('timestamp', { ascending: false });

    console.log('Fetched order history:', data);

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

export async function saveOrderHistory(orders) {
    const { data, error } = await supabase.from('orders').insert(orders);
    if (error) {
        console.error('Supabase insert error:', error);
    }
}
