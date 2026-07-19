import { createClient } from '@supabase/supabase-js';
import {
    ORDER_SOURCE,
    calculateTotals,
    defaultPrintStatus,
    mapOrderRow,
    orderCodePrefix,
    toOrderItems,
} from '@/lib/orders/orderModel';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ORDERS_TABLE = 'orders';

function startOfToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
}

function endOfToday() {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return end;
}

/**
 * Today's orders, newest first. One row per order now, so the old
 * group-by-orderNumber pass is gone — each row already is a whole order.
 *
 * @returns {Promise<Array<ReturnType<typeof mapOrderRow>>>}
 */
export async function getOrderHistory() {
    const { data, error } = await supabase
        .from(ORDERS_TABLE)
        .select('*')
        .gte('created_at', startOfToday().toISOString())
        .lte('created_at', endOfToday().toISOString())
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Supabase fetch error:', error?.message || JSON.stringify(error));
        return [];
    }

    return data.map(mapOrderRow);
}

/**
 * Reserves the next human-facing order code (e.g. "W-1042") from the
 * `next_order_code` Postgres function. It is backed by a single global
 * sequence, so nextval() hands every caller — website or iPad — a distinct
 * value atomically. Collisions are structurally impossible rather than
 * avoided by retrying.
 *
 * @param {'online'|'pos'} source
 * @returns {Promise<string>}
 */
export async function getNextOrderCode(source = ORDER_SOURCE.pos) {
    const { data, error } = await supabase.rpc('next_order_code', {
        prefix: orderCodePrefix(source),
    });
    if (error) {
        console.error('Failed to get next order code:', error);
        throw new Error(error.message);
    }
    return data;
}

/**
 * Inserts one order row and returns it in UI shape.
 *
 * `source` decides the print contract: 'pos' orders are already printed at the
 * till so they are stored as 'printed', while 'online' orders default to
 * 'pending' for the iPad's auto-print queue to claim.
 *
 * @param {{
 *   cartItems: Array<{name: string, modifiers?: string[], price: number, type: string, quantity: number}>,
 *   source?: 'online'|'pos',
 *   phone?: string,
 *   customerName?: string,
 *   notes?: string,
 *   paymentMethod?: string,
 * }} params
 */
export async function createOrder({
    cartItems,
    source = ORDER_SOURCE.pos,
    phone = '',
    customerName = '',
    notes = '',
    paymentMethod = 'cash',
}) {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
        throw new Error('Cannot create an order with no items.');
    }

    const items = toOrderItems(cartItems);
    const { subtotal, tax, total } = calculateTotals(items);
    const orderNumber = await getNextOrderCode(source);

    const { data, error } = await supabase
        .from(ORDERS_TABLE)
        .insert({
            source,
            order_number: orderNumber,
            customer_name: customerName.trim() || null,
            customer_phone: phone.trim() || null,
            items,
            subtotal,
            tax,
            total,
            payment_method: paymentMethod,
            notes: notes.trim() || null,
            print_status: defaultPrintStatus(source),
        })
        .select()
        .single();

    if (error) {
        console.error('Supabase insert error:', error);
        throw new Error(error.message);
    }

    return mapOrderRow(data);
}

/**
 * `order_number` comes from a global sequence and never repeats, so this no
 * longer needs the day-range bounds the old daily-reset numbering required to
 * avoid overwriting past orders that shared a number.
 */
export async function updateOrderPhone(orderNumber, phone) {
    const { error } = await supabase
        .from(ORDERS_TABLE)
        .update({ customer_phone: phone || null })
        .eq('order_number', orderNumber);

    if (error) console.error('Failed to update phone:', error);
}
