'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOrderHistory } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/Card';
import { TAX_RATE } from '@/components/OrderPanel';
import Link from 'next/link';

const DATE_FILTERS = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'all', label: 'All Time' },
];

const TYPE_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'Boba', label: 'Boba' },
    { key: 'Corndog', label: 'Corndog' },
];

const isToday = (isoString) => {
    const d = new Date(isoString);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
};

const isThisWeek = (isoString) => {
    const d = new Date(isoString);
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);
    return d >= weekAgo;
};

export default function SummaryPage() {
    const [history, setHistory] = useState([]);
    const [dateFilter, setDateFilter] = useState('today');
    const [typeFilter, setTypeFilter] = useState('all');

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
    }, [fetchHistory]);

    const flatOrders = useMemo(() => history.flat(), [history]);

    const filtered = useMemo(() => {
        return flatOrders.filter((item) => {
            const matchDate =
                dateFilter === 'all' ? true :
                dateFilter === 'today' ? isToday(item.timestamp) :
                isThisWeek(item.timestamp);
            const matchType =
                typeFilter === 'all' ? true : item.type === typeFilter;
            return matchDate && matchType;
        });
    }, [flatOrders, dateFilter, typeFilter]);

    const itemSummary = useMemo(() => {
        const counts = {};
        filtered.forEach((item) => {
            if (!counts[item.name]) counts[item.name] = { name: item.name, type: item.type, count: 0, revenue: 0 };
            counts[item.name].count += 1;
            counts[item.name].revenue += item.price * (1 + TAX_RATE);
        });
        return Object.values(counts).sort((a, b) => b.count - a.count);
    }, [filtered]);

    const totalItems = filtered.length;
    const totalRevenue = filtered.reduce((sum, item) => sum + item.price * (1 + TAX_RATE), 0);

    const pillClass = (active) =>
        `px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer select-none ${
            active ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`;

    return (
        <div className='min-h-screen bg-gray-50 p-4'>
            <div className='max-w-2xl mx-auto'>
                <div className='flex items-center gap-3 mb-6'>
                    <Link href='/vendor' className='text-gray-400 hover:text-gray-600 text-sm'>
                        ← Back
                    </Link>
                    <h1 className='text-2xl font-bold'>Sales Summary</h1>
                </div>

                <Card className='mb-4'>
                    <CardContent>
                        <div className='flex flex-wrap gap-2 mb-3'>
                            {DATE_FILTERS.map(({ key, label }) => (
                                <button key={key} onClick={() => setDateFilter(key)} className={pillClass(dateFilter === key)}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className='flex flex-wrap gap-2'>
                            {TYPE_FILTERS.map(({ key, label }) => (
                                <button key={key} onClick={() => setTypeFilter(key)} className={pillClass(typeFilter === key)}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent>
                        {itemSummary.length === 0 ? (
                            <p className='text-gray-400 text-sm py-8 text-center'>No orders for this period.</p>
                        ) : (
                            <table className='w-full text-sm'>
                                <thead>
                                    <tr className='text-xs uppercase tracking-wide text-gray-400 border-b'>
                                        <th className='text-left py-2 font-medium'>Item</th>
                                        <th className='text-right py-2 font-medium'>Qty</th>
                                        <th className='text-right py-2 font-medium'>Revenue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {itemSummary.map(({ name, count, revenue }) => (
                                        <tr key={name} className='border-b last:border-0'>
                                            <td className='py-2 pr-2'>{name}</td>
                                            <td className='py-2 text-right font-semibold'>{count}</td>
                                            <td className='py-2 text-right text-gray-600'>${revenue.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        <div className='mt-4 pt-3 border-t flex justify-between font-bold text-base'>
                            <span>Total: {totalItems} item{totalItems !== 1 ? 's' : ''}</span>
                            <span>${totalRevenue.toFixed(2)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
