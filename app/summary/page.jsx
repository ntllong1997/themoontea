'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getOrdersInRange } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/Card';
import { CATEGORIES, TAX_RATE, categoryFor } from '@/lib/menu/catalog';
import { PAYMENT_BUCKETS, summarizeByCategoryAndPayment } from '@/lib/orders/paymentMethods';
import {
    DATE_FILTERS,
    formatRangeLabel,
    isWithinWindow,
    toDateInput,
    windowFor,
} from '@/lib/orders/dateRange';
import Link from 'next/link';

// Derived from the catalog, so a new category gets a filter tab for free.
const TYPE_FILTERS = [
    { key: 'all', label: 'All' },
    ...CATEGORIES.map(({ key, label }) => ({ key, label })),
];

export default function SummaryPage() {
    const [history, setHistory] = useState([]);
    const [dateFilter, setDateFilter] = useState('today');
    // Seeded to today, so picking "Custom Range" starts somewhere meaningful
    // rather than silently showing every order ever taken.
    const [customRange, setCustomRange] = useState(() => {
        const today = toDateInput(new Date());
        return { start: today, end: today };
    });
    const [typeFilter, setTypeFilter] = useState('all');
    const [fetchError, setFetchError] = useState(false);

    // Every pill, preset or hand-picked, becomes one [from, to) window. It
    // scopes the query as well as the filtering below, so a range reaching
    // back weeks reads exactly the rows it needs and no more.
    const dateWindow = useMemo(
        () => windowFor(dateFilter, customRange),
        [dateFilter, customRange]
    );

    // Adjusting a date fires a request per change, and they can come back out
    // of order. Only the newest one may write to the screen — otherwise a slow
    // reply for an old range quietly overwrites the figures being read.
    const latestRequest = useRef(0);

    const fetchHistory = useCallback(async () => {
        const requestId = ++latestRequest.current;
        try {
            const grouped = await getOrdersInRange(dateWindow.from, dateWindow.to);
            if (requestId !== latestRequest.current) return;
            setHistory(grouped);
            setFetchError(false);
        } catch (e) {
            if (requestId !== latestRequest.current) return;
            console.error('Failed to fetch history:', e);
            setFetchError(true);
        }
    }, [dateWindow]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // One entry per physical unit, carrying its order's timestamp — the date
    // now lives on the order row rather than on each line item.
    const flatOrders = useMemo(
        () =>
            history.flatMap((order) =>
                order.items.map((item) => ({
                    ...item,
                    createdAt: order.createdAt,
                    // Payment is recorded per order, not per line, so it is
                    // carried down onto each unit for the breakdown below.
                    paymentMethod: order.paymentMethod,
                }))
            ),
        [history]
    );

    const filtered = useMemo(() => {
        return flatOrders.filter((item) => {
            // Belt and braces: the query is already scoped to the window, but
            // filtering here too keeps the totals honest if a row ever slips
            // through on a boundary.
            const matchDate = isWithinWindow(item.createdAt, dateWindow);
            const matchType =
                typeFilter === 'all' ? true : item.type === typeFilter;
            return matchDate && matchType;
        });
    }, [flatOrders, dateWindow, typeFilter]);

    const itemSummary = useMemo(() => {
        const counts = {};
        filtered.forEach((item) => {
            // Group by the modifier-inclusive name so "Ube (Tapioca)" and
            // "Ube (Jelly)" are counted as the distinct products they are.
            const label = item.displayName ?? item.name;
            // Keyed by category as well as name: the catalog keeps product
            // names distinct today, but two categories sharing a name must
            // never silently merge their counts and revenue.
            const key = `${item.type}|${label}`;
            if (!counts[key]) counts[key] = { key, name: label, type: item.type, count: 0, revenue: 0 };
            counts[key].count += 1;
            counts[key].revenue += item.price * (1 + TAX_RATE);
        });
        return Object.values(counts).sort((a, b) => b.count - a.count);
    }, [filtered]);

    // Revenue per category split by how it was paid. Follows the same date and
    // type filters as the item table above it, so the two always agree.
    const paymentSummary = useMemo(() => {
        const rows = summarizeByCategoryAndPayment(filtered, (price) => price * (1 + TAX_RATE));

        // Catalog order first, so the table reads like the menu; anything with
        // a type the catalog no longer knows still gets a row at the end.
        const ordered = [
            ...CATEGORIES.map((c) => c.key).filter((key) => rows.has(key)),
            ...[...rows.keys()].filter((key) => !categoryFor(key)),
        ];

        return ordered.map((key) => ({
            key,
            label: categoryFor(key)?.label ?? key,
            ...rows.get(key),
        }));
    }, [filtered]);

    const paymentTotals = useMemo(() => {
        const totals = Object.fromEntries(PAYMENT_BUCKETS.map((b) => [b.key, 0]));
        let grand = 0;
        for (const row of paymentSummary) {
            for (const bucket of PAYMENT_BUCKETS) totals[bucket.key] += row.byMethod[bucket.key];
            grand += row.total;
        }
        return { totals, grand };
    }, [paymentSummary]);

    // A column with nothing in it is noise — most days there is no "Other".
    const visibleBuckets = PAYMENT_BUCKETS.filter(
        (bucket) => paymentTotals.totals[bucket.key] !== 0
    );

    const totalItems = filtered.length;
    const totalRevenue = filtered.reduce((sum, item) => sum + item.price * (1 + TAX_RATE), 0);

    const setRangeBound = (bound) => (event) =>
        setCustomRange((current) => ({ ...current, [bound]: event.target.value }));

    const pillClass = (active) =>
        `px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer select-none ${
            active ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`;

    const dateInputClass =
        'border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 bg-white';

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
                        {dateFilter === 'custom' && (
                            <div className='flex flex-wrap items-center gap-2 mb-3'>
                                <label htmlFor='range-start' className='text-xs text-gray-500'>
                                    From
                                </label>
                                <input
                                    id='range-start'
                                    type='date'
                                    value={customRange.start}
                                    onChange={setRangeBound('start')}
                                    className={dateInputClass}
                                />
                                <label htmlFor='range-end' className='text-xs text-gray-500'>
                                    To
                                </label>
                                <input
                                    id='range-end'
                                    type='date'
                                    value={customRange.end}
                                    onChange={setRangeBound('end')}
                                    className={dateInputClass}
                                />
                            </div>
                        )}
                        <div className='flex flex-wrap gap-2'>
                            {TYPE_FILTERS.map(({ key, label }) => (
                                <button key={key} onClick={() => setTypeFilter(key)} className={pillClass(typeFilter === key)}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        {/* Says which days the figures below actually cover, so a
                            screenshot of this page is not ambiguous. */}
                        <p className='text-xs text-gray-400 mt-3'>
                            Showing {formatRangeLabel(dateWindow)}
                        </p>
                    </CardContent>
                </Card>

                {!fetchError && paymentSummary.length > 0 && (
                    <Card className='mb-4'>
                        <CardContent>
                            <h2 className='text-sm font-semibold mb-3'>By category &amp; payment</h2>
                            <div className='overflow-x-auto'>
                                <table className='w-full text-sm min-w-[380px]'>
                                    <thead>
                                        <tr className='text-xs uppercase tracking-wide text-gray-400 border-b'>
                                            <th className='text-left py-2 font-medium'>Category</th>
                                            {visibleBuckets.map((bucket) => (
                                                <th key={bucket.key} className='text-right py-2 font-medium'>
                                                    {bucket.label}
                                                </th>
                                            ))}
                                            <th className='text-right py-2 font-medium'>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paymentSummary.map((row) => (
                                            <tr key={row.key} className='border-b last:border-0'>
                                                <td className='py-2 pr-2'>{row.label}</td>
                                                {visibleBuckets.map((bucket) => (
                                                    <td
                                                        key={bucket.key}
                                                        className={`py-2 text-right ${
                                                            row.byMethod[bucket.key] === 0
                                                                ? 'text-gray-300'
                                                                : 'text-gray-600'
                                                        }`}
                                                    >
                                                        ${row.byMethod[bucket.key].toFixed(2)}
                                                    </td>
                                                ))}
                                                <td className='py-2 text-right font-semibold'>
                                                    ${row.total.toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className='font-bold'>
                                            <td className='pt-2'>All</td>
                                            {visibleBuckets.map((bucket) => (
                                                <td key={bucket.key} className='pt-2 text-right'>
                                                    ${paymentTotals.totals[bucket.key].toFixed(2)}
                                                </td>
                                            ))}
                                            <td className='pt-2 text-right'>
                                                ${paymentTotals.grand.toFixed(2)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            {paymentTotals.totals.Other !== 0 && (
                                <p className='text-xs text-gray-400 mt-2'>
                                    “Other” is revenue with no payment method recorded on the
                                    order — older rows and website orders, which take no payment.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardContent>
                        {fetchError ? (
                            <p className='text-red-500 text-sm py-8 text-center'>Could not load data — check your connection.</p>
                        ) : itemSummary.length === 0 ? (
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
                                    {itemSummary.map(({ key, name, count, revenue }) => (
                                        <tr key={key} className='border-b last:border-0'>
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
