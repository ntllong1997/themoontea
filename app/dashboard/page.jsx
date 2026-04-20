'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const receipts = [
    {
        id: 'RCPT-2024-09-001',
        merchant: 'Blue Bottle Coffee',
        location: 'San Francisco, CA',
        category: 'Meals',
        amount: 8.75,
        receiptDate: '2024-09-02',
        uploadDate: '2024-09-02',
        duplicate: false,
        confidence: 0.94,
        storageUrl: '#',
    },
    {
        id: 'RCPT-2024-09-002',
        merchant: 'Delta Shuttle',
        location: 'Atlanta, GA',
        category: 'Travel',
        amount: 248.1,
        receiptDate: '2024-09-04',
        uploadDate: '2024-09-04',
        duplicate: false,
        confidence: 0.88,
        storageUrl: '#',
    },
    {
        id: 'RCPT-2024-09-003',
        merchant: 'Target',
        location: 'Austin, TX',
        category: 'Supplies',
        amount: 63.42,
        receiptDate: '2024-09-07',
        uploadDate: '2024-09-07',
        duplicate: true,
        confidence: 0.9,
        storageUrl: '#',
    },
    {
        id: 'RCPT-2024-08-018',
        merchant: 'Marriott',
        location: 'Chicago, IL',
        category: 'Lodging',
        amount: 612.35,
        receiptDate: '2024-08-28',
        uploadDate: '2024-08-29',
        duplicate: false,
        confidence: 0.91,
        storageUrl: '#',
    },
    {
        id: 'RCPT-2024-08-021',
        merchant: 'Lyft',
        location: 'Chicago, IL',
        category: 'Travel',
        amount: 34.97,
        receiptDate: '2024-08-30',
        uploadDate: '2024-08-30',
        duplicate: true,
        confidence: 0.86,
        storageUrl: '#',
    },
    {
        id: 'RCPT-2024-07-011',
        merchant: 'WeWork',
        location: 'New York, NY',
        category: 'Office',
        amount: 420.0,
        receiptDate: '2024-07-15',
        uploadDate: '2024-07-15',
        duplicate: false,
        confidence: 0.93,
        storageUrl: '#',
    },
    {
        id: 'RCPT-2024-07-013',
        merchant: 'Uber',
        location: 'New York, NY',
        category: 'Travel',
        amount: 19.8,
        receiptDate: '2024-07-16',
        uploadDate: '2024-07-16',
        duplicate: false,
        confidence: 0.82,
        storageUrl: '#',
    },
    {
        id: 'RCPT-2024-10-001',
        merchant: 'Slack',
        location: 'Online',
        category: 'Software',
        amount: 84.0,
        receiptDate: '2024-10-01',
        uploadDate: '2024-10-01',
        duplicate: false,
        confidence: 0.96,
        storageUrl: '#',
    },
    {
        id: 'RCPT-2024-10-002',
        merchant: 'Parking Garage',
        location: 'Boston, MA',
        category: 'Travel',
        amount: 28.0,
        receiptDate: '2024-10-02',
        uploadDate: '2024-10-02',
        duplicate: false,
        confidence: 0.89,
        storageUrl: '#',
    },
    {
        id: 'RCPT-2024-10-004',
        merchant: 'Whole Foods',
        location: 'Cambridge, MA',
        category: 'Meals',
        amount: 54.16,
        receiptDate: '2024-10-03',
        uploadDate: '2024-10-03',
        duplicate: false,
        confidence: 0.87,
        storageUrl: '#',
    },
];

const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

const formatCurrency = (value) => currencyFormatter.format(value);

const categories = Array.from(new Set(receipts.map((item) => item.category)));

const monthKey = (dateString) => dateString.slice(0, 7);

const monthlyRollup = receipts.reduce((acc, receipt) => {
    const key = monthKey(receipt.receiptDate);
    const entry = acc.get(key) ?? { total: 0, count: 0 };
    entry.total += receipt.amount;
    entry.count += 1;
    acc.set(key, entry);
    return acc;
}, new Map());

export default function ReceiptDashboardPage() {
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [category, setCategory] = useState('');
    const [merchant, setMerchant] = useState('');
    const [duplicatesOnly, setDuplicatesOnly] = useState(false);

    const filteredReceipts = useMemo(() => {
        return receipts.filter((receipt) => {
            const receiptDate = new Date(receipt.receiptDate);
            if (dateFrom && receiptDate < new Date(dateFrom)) return false;
            if (dateTo && receiptDate > new Date(dateTo)) return false;

            if (minAmount && receipt.amount < Number(minAmount)) return false;
            if (maxAmount && receipt.amount > Number(maxAmount)) return false;

            if (category && receipt.category !== category) return false;

            if (
                merchant &&
                !receipt.merchant.toLowerCase().includes(merchant.toLowerCase())
            ) {
                return false;
            }

            if (duplicatesOnly && !receipt.duplicate) return false;

            return true;
        });
    }, [dateFrom, dateTo, minAmount, maxAmount, category, merchant, duplicatesOnly]);

    const totals = useMemo(() => {
        const totalAmount = filteredReceipts.reduce(
            (sum, r) => sum + r.amount,
            0
        );
        const duplicateCount = filteredReceipts.filter((r) => r.duplicate).length;
        const avgConfidence =
            filteredReceipts.reduce((sum, r) => sum + r.confidence, 0) /
            (filteredReceipts.length || 1);

        return {
            totalAmount,
            duplicateCount,
            avgConfidence,
        };
    }, [filteredReceipts]);

    const resetFilters = () => {
        setDateFrom('');
        setDateTo('');
        setMinAmount('');
        setMaxAmount('');
        setCategory('');
        setMerchant('');
        setDuplicatesOnly(false);
    };

    return (
        <div className='max-w-6xl mx-auto px-4 py-10 space-y-6'>
            <div className='flex flex-col gap-2'>
                <p className='text-sm uppercase tracking-[0.2em] text-gray-500'>
                    Receipt Capture
                </p>
                <h1 className='text-3xl font-bold'>Dashboard preview</h1>
                <p className='text-gray-600'>
                    Monitor extracted receipts, spot duplicates (red rows), and see
                    where each upload will land in the yearly Google Sheet.
                </p>
            </div>

            <section className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                <Card>
                    <CardContent className='space-y-1'>
                        <p className='text-sm text-gray-500'>Receipts loaded</p>
                        <p className='text-2xl font-semibold'>
                            {filteredReceipts.length}
                            <span className='text-sm text-gray-500 ml-1'>/ {receipts.length}</span>
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className='space-y-1'>
                        <p className='text-sm text-gray-500'>Total amount (USD)</p>
                        <p className='text-2xl font-semibold'>
                            {formatCurrency(totals.totalAmount)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className='space-y-1'>
                        <p className='text-sm text-gray-500'>Duplicates flagged</p>
                        <p className='text-2xl font-semibold text-red-600'>
                            {totals.duplicateCount}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className='space-y-1'>
                        <p className='text-sm text-gray-500'>Avg AI confidence</p>
                        <p className='text-2xl font-semibold'>
                            {(totals.avgConfidence * 100).toFixed(0)}%
                        </p>
                    </CardContent>
                </Card>
            </section>

            <section className='grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-4 items-start'>
                <Card>
                    <CardContent className='space-y-4'>
                        <div className='flex items-center justify-between gap-2'>
                            <h2 className='text-xl font-semibold'>Filters</h2>
                            <Button variant='outline' size='sm' onClick={resetFilters}>
                                Reset
                            </Button>
                        </div>
                        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                            <label className='flex flex-col gap-1 text-sm'>
                                <span className='text-gray-600'>Receipt date from</span>
                                <input
                                    type='date'
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className='border rounded-md px-3 py-2 text-sm'
                                />
                            </label>
                            <label className='flex flex-col gap-1 text-sm'>
                                <span className='text-gray-600'>Receipt date to</span>
                                <input
                                    type='date'
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className='border rounded-md px-3 py-2 text-sm'
                                />
                            </label>
                            <label className='flex flex-col gap-1 text-sm'>
                                <span className='text-gray-600'>Category</span>
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className='border rounded-md px-3 py-2 text-sm'
                                >
                                    <option value=''>Any</option>
                                    {categories.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className='flex flex-col gap-1 text-sm'>
                                <span className='text-gray-600'>Min amount</span>
                                <input
                                    type='number'
                                    min='0'
                                    step='0.01'
                                    value={minAmount}
                                    onChange={(e) => setMinAmount(e.target.value)}
                                    className='border rounded-md px-3 py-2 text-sm'
                                />
                            </label>
                            <label className='flex flex-col gap-1 text-sm'>
                                <span className='text-gray-600'>Max amount</span>
                                <input
                                    type='number'
                                    min='0'
                                    step='0.01'
                                    value={maxAmount}
                                    onChange={(e) => setMaxAmount(e.target.value)}
                                    className='border rounded-md px-3 py-2 text-sm'
                                />
                            </label>
                            <label className='flex flex-col gap-1 text-sm'>
                                <span className='text-gray-600'>Merchant</span>
                                <input
                                    type='text'
                                    placeholder='Search merchant'
                                    value={merchant}
                                    onChange={(e) => setMerchant(e.target.value)}
                                    className='border rounded-md px-3 py-2 text-sm'
                                />
                            </label>
                        </div>
                        <label className='inline-flex items-center gap-2 text-sm text-gray-700'>
                            <input
                                type='checkbox'
                                checked={duplicatesOnly}
                                onChange={(e) => setDuplicatesOnly(e.target.checked)}
                                className='h-4 w-4'
                            />
                            Show duplicates only
                        </label>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className='space-y-3'>
                        <div className='flex items-center justify-between'>
                            <h2 className='text-lg font-semibold'>Sheet targets</h2>
                            <span className='text-xs text-gray-500'>Receipts-2024</span>
                        </div>
                        <div className='space-y-2'>
                            {Array.from(monthlyRollup.entries())
                                .sort(([a], [b]) => (a > b ? -1 : 1))
                                .map(([month, data]) => (
                                    <div
                                        key={month}
                                        className='flex items-center justify-between text-sm'
                                    >
                                        <div>
                                            <p className='font-medium'>{month}</p>
                                            <p className='text-gray-500'>
                                                {data.count} receipt{data.count === 1 ? '' : 's'} → tab {month}
                                            </p>
                                        </div>
                                        <span className='font-semibold'>
                                            {formatCurrency(data.total)}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </CardContent>
                </Card>
            </section>

            <Card>
                <CardContent className='space-y-3'>
                    <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-2'>
                        <h2 className='text-xl font-semibold'>Receipt stream</h2>
                        <p className='text-sm text-gray-500'>
                            Sorted by receipt date. Duplicate rows highlighted in red to
                            match the Google Sheet formatting rule.
                        </p>
                    </div>
                    <div className='overflow-x-auto'>
                        <table className='min-w-full text-sm'>
                            <thead>
                                <tr className='text-left text-gray-600 border-b'>
                                    <th className='py-2 pr-4'>Merchant</th>
                                    <th className='py-2 pr-4'>Category</th>
                                    <th className='py-2 pr-4'>Amount</th>
                                    <th className='py-2 pr-4'>Receipt date</th>
                                    <th className='py-2 pr-4'>Upload date</th>
                                    <th className='py-2 pr-4'>Location</th>
                                    <th className='py-2 pr-4'>Duplicate</th>
                                    <th className='py-2 pr-4'>AI confidence</th>
                                    <th className='py-2 pr-4'>Storage</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredReceipts.map((receipt) => (
                                    <tr
                                        key={receipt.id}
                                        className={`border-b last:border-0 ${
                                            receipt.duplicate ? 'bg-red-50' : ''
                                        }`}
                                    >
                                        <td className='py-3 pr-4 font-medium'>
                                            {receipt.merchant}
                                        </td>
                                        <td className='py-3 pr-4'>{receipt.category}</td>
                                        <td className='py-3 pr-4'>
                                            {formatCurrency(receipt.amount)}
                                        </td>
                                        <td className='py-3 pr-4'>{receipt.receiptDate}</td>
                                        <td className='py-3 pr-4'>{receipt.uploadDate}</td>
                                        <td className='py-3 pr-4'>{receipt.location}</td>
                                        <td className='py-3 pr-4'>
                                            {receipt.duplicate ? (
                                                <span className='inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-semibold'>
                                                    Duplicate
                                                </span>
                                            ) : (
                                                <span className='inline-flex items-center rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-semibold'>
                                                    Unique
                                                </span>
                                            )}
                                        </td>
                                        <td className='py-3 pr-4'>
                                            {(receipt.confidence * 100).toFixed(0)}%
                                        </td>
                                        <td className='py-3 pr-4'>
                                            <a
                                                href={receipt.storageUrl}
                                                className='text-blue-600 hover:underline'
                                            >
                                                view
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
