'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrderHistory, updateOrderPhone } from '@/lib/db';
import { TAX_RATE } from '@/lib/constants';
import { calculateTotalRevenue } from '@/lib/orders/orderModel';
import HistorySection from '@/components/HistorySection';

// One prep screen, driven entirely by a catalog category. Which items it shows,
// what the per-unit statuses are called and how they are coloured all come from
// `category.flow`, so a new station is a catalog entry plus nothing else.
export default function StationPage({ category }) {
    const { flow, key: categoryKey, station } = category;
    const initialState = flow.initial;

    const [history, setHistory] = useState([]);
    const [itemStates, setItemStates] = useState({});
    const [notifiedOrders, setNotifiedOrders] = useState(new Set());
    const [phoneOverrides, setPhoneOverrides] = useState({});

    const fetchHistory = useCallback(async () => {
        try {
            setHistory(await getOrderHistory());
        } catch (e) {
            console.error('Failed to fetch history:', e);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
        const id = setInterval(fetchHistory, 3000);
        return () => clearInterval(id);
    }, [fetchHistory]);

    const handleItemClick = useCallback((orderNumber, itemIndex) => {
        const key = `${orderNumber}-${itemIndex}`;
        setItemStates((prev) => ({
            ...prev,
            [key]: flow.states[prev[key] || initialState].next,
        }));
    }, [flow, initialState]);

    const getOrderPhone = useCallback((orderNumber) => {
        if (phoneOverrides[orderNumber] !== undefined) return phoneOverrides[orderNumber];
        return history.find((order) => order.orderNumber === orderNumber)?.phone ?? '';
    }, [phoneOverrides, history]);

    const handleSavePhone = useCallback(async (orderNumber, newPhone) => {
        setPhoneOverrides((prev) => ({ ...prev, [orderNumber]: newPhone }));
        await updateOrderPhone(orderNumber, newPhone);
    }, []);

    const markNotified = useCallback((orderNumber) => {
        setNotifiedOrders((prev) => {
            const next = new Set(prev);
            next.add(orderNumber);
            return next;
        });
    }, []);

    const getOrderActions = useCallback(({ orderNumber }) => {
        const orderPhone = getOrderPhone(orderNumber);

        if (notifiedOrders.has(orderNumber)) {
            return (
                <span className='text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded'>
                    Notified ✓
                </span>
            );
        }

        if (!orderPhone) return null;

        const order = history.find((o) => o.orderNumber === orderNumber);
        const itemList = (order?.items ?? []).map((item) => `• ${item.displayName}`).join('\n');
        const smsBody = `🌙 The Moon Tea\nOrder #${orderNumber} is ready for pickup! 🎉\n\n${itemList}\n\nSee you soon! 🧡`;
        const smsHref = `sms:${orderPhone}?body=${encodeURIComponent(smsBody)}`;
        return (
            <a
                href={smsHref}
                onClick={(e) => { e.stopPropagation(); setTimeout(() => markNotified(orderNumber), 500); }}
                className='rounded px-2 py-1 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors'
            >
                Notify
            </a>
        );
    }, [getOrderPhone, history, notifiedOrders, markNotified]);

    const stateFor = useCallback(
        (key) => flow.states[itemStates[key] || initialState],
        [flow, itemStates, initialState]
    );

    const getItemClassName = useCallback((_item, key) => stateFor(key).className, [stateFor]);
    const getItemBadge = useCallback((key) => stateFor(key).badge, [stateFor]);
    const getItemTooltip = useCallback((key) => stateFor(key).tooltip, [stateFor]);

    // Each order's units are indexed before filtering, so a unit keeps the same
    // itemIndex (and therefore the same status) whichever station shows it.
    const filteredOrders = history
        .map((order) => ({
            orderNumber: order.orderNumber,
            items: order.items
                .map((item, i) => ({ item, itemIndex: i }))
                .filter(({ item }) => item.type === categoryKey),
        }))
        .filter((o) => o.items.length > 0);

    const totalRevenue = calculateTotalRevenue(history);

    return (
        <div className='min-h-screen bg-gray-50'>
            <div className='sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center gap-3'>
                <Link href='/order' className='text-gray-400 hover:text-gray-600 text-sm'>← Back</Link>
                <h1 className='text-lg font-bold'>{station.title}</h1>
                <span className='text-sm text-gray-400 ml-auto'>
                    {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
                </span>
            </div>
            <div className='p-4'>
                <HistorySection
                    title=''
                    sectionKey={`${station.slug}-station`}
                    orders={filteredOrders}
                    taxRate={TAX_RATE}
                    totalRevenue={totalRevenue}
                    onItemClick={handleItemClick}
                    getItemClassName={getItemClassName}
                    getItemBadge={getItemBadge}
                    getItemTooltip={getItemTooltip}
                    getOrderActions={getOrderActions}
                    getOrderPhone={getOrderPhone}
                    onSavePhone={handleSavePhone}
                />
            </div>
        </div>
    );
}
