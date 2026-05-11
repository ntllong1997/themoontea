'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrderHistory, updateOrderPhone } from '@/lib/db';
import { TAX_RATE } from '@/components/OrderPanel';
import HistorySection from '@/components/HistorySection';

const CORNDOG_STATES = { received: 'received', making: 'making', ready: 'ready', pickedup: 'pickedup' };
const CORNDOG_NEXT = { received: 'making', making: 'ready', ready: 'pickedup', pickedup: 'received' };

const CORNDOG_STATE_CLASS = {
    received: 'bg-red-50 text-red-900',
    making: 'bg-red-100 text-red-900',
    ready: 'bg-red-300 text-red-900',
    pickedup: 'bg-red-500 text-white',
};

const CORNDOG_STATE_BADGE = {
    received: 'New',
    making: 'Making…',
    ready: 'Ready ✓',
    pickedup: 'Picked Up ✓',
};

const CORNDOG_STATE_TOOLTIP = {
    received: 'Click to mark as Making',
    making: 'Click to mark as Ready',
    ready: 'Click to mark as Picked Up',
    pickedup: 'Click to reset',
};

const calculateTotalRevenue = (history) =>
    history
        .reduce((total, orderList) => {
            const subtotal = orderList.reduce((sum, item) => sum + item.price, 0);
            return total + subtotal + subtotal * TAX_RATE;
        }, 0)
        .toFixed(2);

export default function CorndogStation() {
    const [history, setHistory] = useState([]);
    const [corndogStates, setCorndogStates] = useState({});
    const [notifiedOrders, setNotifiedOrders] = useState(new Set());
    const [phoneOverrides, setPhoneOverrides] = useState({});

    const fetchHistory = useCallback(async () => {
        try {
            const grouped = await getOrderHistory();
            setHistory(grouped);
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
        setCorndogStates((prev) => ({ ...prev, [key]: CORNDOG_NEXT[prev[key] || CORNDOG_STATES.received] }));
    }, []);

    const getOrderPhone = useCallback((orderNumber) => {
        if (phoneOverrides[orderNumber] !== undefined) return phoneOverrides[orderNumber];
        return history.flat().find((item) => item.orderNumber === orderNumber)?.phone ?? '';
    }, [phoneOverrides, history]);

    const handleSavePhone = useCallback(async (orderNumber, newPhone) => {
        setPhoneOverrides((prev) => ({ ...prev, [orderNumber]: newPhone }));
        await updateOrderPhone(orderNumber, newPhone);
    }, []);

    const markNotified = useCallback((orderNumber) => {
        setNotifiedOrders((prev) => new Set([...prev, orderNumber]));
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

        const orderItems = history.flat().filter((item) => item.orderNumber === orderNumber);
        const itemList = orderItems.map((item) => `• ${item.name}`).join('\n');
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

    const getItemClassName = useCallback(
        (_item, key) => CORNDOG_STATE_CLASS[corndogStates[key] || CORNDOG_STATES.received],
        [corndogStates]
    );
    const getItemBadge = useCallback(
        (key) => CORNDOG_STATE_BADGE[corndogStates[key] || CORNDOG_STATES.received],
        [corndogStates]
    );
    const getItemTooltip = useCallback(
        (key) => CORNDOG_STATE_TOOLTIP[corndogStates[key] || CORNDOG_STATES.received],
        [corndogStates]
    );

    const corndogOrders = history
        .map((orderList, idx) => ({
            orderNumber: orderList[0]?.orderNumber ?? idx + 1,
            items: orderList
                .map((item, i) => ({ item, itemIndex: i }))
                .filter(({ item }) => item.type !== 'Boba'),
        }))
        .filter((o) => o.items.length > 0);

    const totalRevenue = calculateTotalRevenue(history);

    return (
        <div className='min-h-screen bg-gray-50'>
            <div className='sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center gap-3'>
                <Link href='/order' className='text-gray-400 hover:text-gray-600 text-sm'>← Back</Link>
                <h1 className='text-lg font-bold'>🌭 Corndog Station</h1>
                <span className='text-sm text-gray-400 ml-auto'>{corndogOrders.length} order{corndogOrders.length !== 1 ? 's' : ''}</span>
            </div>
            <div className='p-4'>
                <HistorySection
                    title=''
                    sectionKey='corndog-station'
                    orders={corndogOrders}
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
