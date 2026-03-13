'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    getLatestOrderNumber,
    getOrderHistory,
    saveOrderHistory,
} from '@/lib/db';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import OrderPanel, { PRICES, TAX_RATE } from '@/components/OrderPanel';
import HistorySection from '@/components/HistorySection';

// Update this URL to your SMS/notification webhook (e.g. n8n, Twilio, etc.)
const SMS_WEBHOOK_URL =
    process.env.NEXT_PUBLIC_SMS_WEBHOOK_URL || '';

const CORNDOG_STATES = { received: 'received', making: 'making', ready: 'ready' };

const CORNDOG_STATE_CLASS = {
    received: 'bg-red-200',
    making: 'bg-yellow-200',
    ready: 'bg-green-200',
};

const CORNDOG_STATE_BADGE = {
    received: 'Received',
    making: 'Making…',
    ready: 'Ready ✓',
};

const CORNDOG_STATE_TOOLTIP = {
    received: 'Click to mark as Making',
    making: 'Click to mark as Ready',
    ready: 'Click to reset to Received',
};

const splitHistoryByType = (historyList) => {
    const bobaOrders = [];
    const corndogOrders = [];

    historyList.forEach((orderList, orderIdx) => {
        const orderNumber = orderList[0]?.orderNumber ?? orderIdx + 1;
        const withIndex = orderList.map((item, idx) => ({ item, itemIndex: idx }));

        const bobaItems = withIndex.filter(({ item }) => item.type === 'Boba');
        const corndogItems = withIndex.filter(({ item }) => item.type !== 'Boba');

        if (bobaItems.length) bobaOrders.push({ orderNumber, items: bobaItems });
        if (corndogItems.length) corndogOrders.push({ orderNumber, items: corndogItems });
    });

    return { bobaOrders, corndogOrders };
};

const calculateTotalRevenue = (history) =>
    history
        .reduce((total, orderList) => {
            const subtotal = orderList.reduce((sum, item) => sum + item.price, 0);
            return total + subtotal + subtotal * TAX_RATE;
        }, 0)
        .toFixed(2);

const calculateHistorySummary = (history) => {
    const totals = history.flat().reduce(
        (acc, item) => {
            if (item.type === 'Boba') acc.bobaCount += 1;
            else acc.corndogCount += 1;
            acc.subtotal += item.price;
            return acc;
        },
        { bobaCount: 0, corndogCount: 0, subtotal: 0 }
    );
    totals.tax = totals.subtotal * TAX_RATE;
    totals.total = totals.subtotal + totals.tax;
    return totals;
};

export default function OrderSystem() {
    const [orders, setOrders] = useState([]);
    const [history, setHistory] = useState([]);
    const [selectedBoba, setSelectedBoba] = useState('');
    const [selectedDrink, setSelectedDrink] = useState('');
    const [selectedCorndog, setSelectedCorndog] = useState('');
    const [phone, setPhone] = useState('');

    // Boba history: simple boolean toggle
    const [bobaReadyItems, setBobaReadyItems] = useState({});
    // Corndog history: 3-state per item
    const [corndogStates, setCorndogStates] = useState({});
    // Pending confirmation: { orderNumber, itemIndex, key, phone }
    const [pendingReady, setPendingReady] = useState(null);

    const [activeTab, setActiveTab] = useState('order');

    const fetchHistory = useCallback(async () => {
        try {
            const groupedOrders = await getOrderHistory();
            setHistory(groupedOrders);
        } catch (error) {
            console.error('Failed to fetch order history:', error);
        }
    }, []);

    const isHistoryTab =
        activeTab === 'bobaHistory' || activeTab === 'corndogHistory';

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    useEffect(() => {
        if (!isHistoryTab) return;
        fetchHistory();
        const intervalId = setInterval(fetchHistory, 3000);
        return () => clearInterval(intervalId);
    }, [isHistoryTab, fetchHistory]);

    const handleAddBoba = useCallback(() => {
        if (!selectedDrink || !selectedBoba) return;
        const name = `${selectedDrink} with ${selectedBoba}`;
        setOrders((prev) => {
            const idx = prev.findIndex((i) => i.name === name);
            if (idx >= 0) {
                const next = [...prev];
                next[idx].quantity += 1;
                return next;
            }
            return [...prev, { name, price: PRICES.Boba, type: 'Boba', quantity: 1 }];
        });
        setSelectedDrink('');
        setSelectedBoba('');
    }, [selectedDrink, selectedBoba]);

    const handleAddCorndog = useCallback(() => {
        if (!selectedCorndog) return;
        const name = selectedCorndog;
        setOrders((prev) => {
            const idx = prev.findIndex((i) => i.name === name);
            if (idx >= 0) {
                const next = [...prev];
                next[idx].quantity += 1;
                return next;
            }
            return [...prev, { name, price: PRICES.Corndog, type: 'Corndog', quantity: 1 }];
        });
        setSelectedCorndog('');
    }, [selectedCorndog]);

    const handleQuantityChange = useCallback((index, delta) => {
        setOrders((prev) => {
            const next = [...prev];
            next[index].quantity += delta;
            if (next[index].quantity <= 0) next.splice(index, 1);
            return next;
        });
    }, []);

    const handleSendOrder = useCallback(async () => {
        if (orders.length === 0) return;
        try {
            const latestOrderNumber = await getLatestOrderNumber();
            const nextOrderNumber = latestOrderNumber + 1;
            const timestamp = new Date().toISOString();

            const enrichedOrders = orders.flatMap((item) =>
                Array.from({ length: item.quantity }).map(() => ({
                    orderNumber: nextOrderNumber,
                    name: item.name,
                    price: item.price,
                    type: item.type,
                    timestamp,
                    phone: phone.trim() || null,
                }))
            );

            await saveOrderHistory(enrichedOrders);
            setHistory((prev) => [...prev, enrichedOrders]);
            setOrders([]);
            setPhone('');
        } catch (err) {
            console.error('Send order failed:', err);
        }
    }, [orders, phone]);

    // Boba: simple 2-state toggle
    const toggleBobaItemReady = useCallback((orderNumber, itemIndex) => {
        const key = `${orderNumber}-${itemIndex}`;
        setBobaReadyItems((prev) => {
            if (prev[key]) {
                const next = { ...prev };
                delete next[key];
                return next;
            }
            return { ...prev, [key]: true };
        });
    }, []);

    // Corndog: 3-state cycle with popup on making → ready
    const handleCorndogItemClick = useCallback((orderNumber, itemIndex) => {
        const key = `${orderNumber}-${itemIndex}`;
        const current = corndogStates[key] || CORNDOG_STATES.received;

        if (current === CORNDOG_STATES.received) {
            setCorndogStates((prev) => ({ ...prev, [key]: CORNDOG_STATES.making }));
        } else if (current === CORNDOG_STATES.making) {
            // Look up the phone number saved with this order
            const orderPhone =
                history
                    .flat()
                    .find((item) => item.orderNumber === orderNumber)?.phone || '';
            setPendingReady({ orderNumber, itemIndex, key, phone: orderPhone });
        } else {
            // ready → back to received
            setCorndogStates((prev) => ({ ...prev, [key]: CORNDOG_STATES.received }));
        }
    }, [corndogStates, history]);

    const confirmReady = useCallback(async (sendText) => {
        if (!pendingReady) return;
        const { key, orderNumber, phone: orderPhone } = pendingReady;

        setCorndogStates((prev) => ({ ...prev, [key]: CORNDOG_STATES.ready }));

        if (sendText && orderPhone && SMS_WEBHOOK_URL) {
            try {
                await fetch(SMS_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: orderPhone,
                        orderNumber,
                        message: 'Your corndog order is ready for pickup!',
                    }),
                });
            } catch (err) {
                console.error('Failed to send SMS notification:', err);
            }
        }

        setPendingReady(null);
    }, [pendingReady]);

    // Item style/badge/tooltip getters for HistorySection
    const getBobaItemClassName = useCallback((item, key) => {
        if (bobaReadyItems[key]) return 'bg-green-200';
        return item.type !== 'Boba' ? 'bg-blue-100' : 'bg-yellow-50';
    }, [bobaReadyItems]);

    const getBobaItemBadge = useCallback((key) => {
        return bobaReadyItems[key] ? 'Ready ✓' : null;
    }, [bobaReadyItems]);

    const getBobaItemTooltip = useCallback((key) => {
        return bobaReadyItems[key] ? 'Click to mark as not ready' : 'Click to mark as ready';
    }, [bobaReadyItems]);

    const getCorndogItemClassName = useCallback((_item, key) => {
        const state = corndogStates[key] || CORNDOG_STATES.received;
        return CORNDOG_STATE_CLASS[state];
    }, [corndogStates]);

    const getCorndogItemBadge = useCallback((key) => {
        const state = corndogStates[key] || CORNDOG_STATES.received;
        return CORNDOG_STATE_BADGE[state];
    }, [corndogStates]);

    const getCorndogItemTooltip = useCallback((key) => {
        const state = corndogStates[key] || CORNDOG_STATES.received;
        return CORNDOG_STATE_TOOLTIP[state];
    }, [corndogStates]);

    const subtotal = orders.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const tax = subtotal * TAX_RATE;
    const total = (subtotal + tax).toFixed(2);
    const totalRevenue = calculateTotalRevenue(history);
    const historySummary = calculateHistorySummary(history);
    const selection = { drink: selectedDrink, boba: selectedBoba, corndog: selectedCorndog };
    const { bobaOrders, corndogOrders } = splitHistoryByType(history);

    return (
        <>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className='sticky top-0 z-50 bg-white px-4 shadow-sm'>
                    <TabsTrigger value='order'>Order</TabsTrigger>
                    <TabsTrigger value='bobaHistory'>Boba History</TabsTrigger>
                    <TabsTrigger value='corndogHistory'>Corndog History</TabsTrigger>
                    <TabsTrigger value='summary'>Summary</TabsTrigger>
                </TabsList>

                <TabsContent value='order'>
                    <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                        <div className='lg:col-span-2'>
                            <OrderPanel
                                selection={selection}
                                onSelectDrink={setSelectedDrink}
                                onSelectBoba={setSelectedBoba}
                                onSelectCorndog={setSelectedCorndog}
                                onAddBoba={handleAddBoba}
                                onAddCorndog={handleAddCorndog}
                            />
                        </div>

                        <div>
                            <Card className='lg:sticky lg:top-14'>
                                <CardContent>
                                    <h2 className='text-xl font-bold mb-4'>Cart</h2>

                                    {/* Phone number */}
                                    <div className='mb-4'>
                                        <label className='block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1'>
                                            Customer Phone
                                        </label>
                                        <input
                                            type='tel'
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder='(555) 000-0000'
                                            className='w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500'
                                        />
                                    </div>

                                    {/* Cart items */}
                                    {orders.length === 0 ? (
                                        <p className='text-gray-400 text-sm py-6 text-center'>
                                            No items added yet.
                                        </p>
                                    ) : (
                                        <div className='space-y-3'>
                                            {orders.map((item, index) => (
                                                <div
                                                    key={`${item.type}-${item.name}`}
                                                    className='flex justify-between items-start gap-2 pb-2 border-b last:border-0'
                                                >
                                                    <div className='flex-1 min-w-0'>
                                                        <p className='text-sm font-medium leading-snug'>
                                                            {item.name}
                                                        </p>
                                                        <p className='text-xs text-gray-500'>
                                                            ${item.price.toFixed(2)} × {item.quantity} = $
                                                            {(item.price * item.quantity).toFixed(2)}
                                                        </p>
                                                    </div>
                                                    <div className='flex items-center gap-1 shrink-0'>
                                                        <Button
                                                            size='sm'
                                                            variant='outline'
                                                            onClick={() => handleQuantityChange(index, -1)}
                                                        >
                                                            −
                                                        </Button>
                                                        <Button
                                                            size='sm'
                                                            variant='outline'
                                                            onClick={() => handleQuantityChange(index, 1)}
                                                        >
                                                            +
                                                        </Button>
                                                        <Button
                                                            variant='destructive'
                                                            size='sm'
                                                            onClick={() =>
                                                                handleQuantityChange(index, -item.quantity)
                                                            }
                                                        >
                                                            ✕
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className='mt-4 border-t pt-3 space-y-1 text-sm'>
                                        <div className='flex justify-between'>
                                            <span>Subtotal</span>
                                            <span>${subtotal.toFixed(2)}</span>
                                        </div>
                                        <div className='flex justify-between text-gray-500'>
                                            <span>Tax (8.25%)</span>
                                            <span>${tax.toFixed(2)}</span>
                                        </div>
                                        <div className='flex justify-between font-bold text-base pt-1'>
                                            <span>Total</span>
                                            <span>${total}</span>
                                        </div>
                                    </div>

                                    <Button
                                        onClick={handleSendOrder}
                                        className='mt-4 w-full'
                                        disabled={orders.length === 0}
                                    >
                                        Send Order
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value='bobaHistory'>
                    <HistorySection
                        title='Boba History'
                        sectionKey='boba'
                        orders={bobaOrders}
                        taxRate={TAX_RATE}
                        totalRevenue={totalRevenue}
                        onItemClick={toggleBobaItemReady}
                        getItemClassName={getBobaItemClassName}
                        getItemBadge={getBobaItemBadge}
                        getItemTooltip={getBobaItemTooltip}
                    />
                </TabsContent>

                <TabsContent value='corndogHistory'>
                    <HistorySection
                        title='Corndog History'
                        sectionKey='corndog'
                        orders={corndogOrders}
                        taxRate={TAX_RATE}
                        totalRevenue={totalRevenue}
                        onItemClick={handleCorndogItemClick}
                        getItemClassName={getCorndogItemClassName}
                        getItemBadge={getCorndogItemBadge}
                        getItemTooltip={getCorndogItemTooltip}
                    />
                </TabsContent>

                <TabsContent value='summary'>
                    <Card className='mt-4'>
                        <CardContent>
                            <h2 className='text-xl font-bold mb-4'>Summary Snapshot</h2>
                            <div className='space-y-2 text-sm'>
                                <p>Drinks (Boba): {historySummary.bobaCount}</p>
                                <p>Corndog: {historySummary.corndogCount}</p>
                                <div className='pt-2 border-t space-y-1'>
                                    <div className='flex justify-between'>
                                        <span>Subtotal</span>
                                        <span>${historySummary.subtotal.toFixed(2)}</span>
                                    </div>
                                    <div className='flex justify-between text-gray-500'>
                                        <span>Tax (8.25%)</span>
                                        <span>${historySummary.tax.toFixed(2)}</span>
                                    </div>
                                    <div className='flex justify-between font-bold text-base pt-1'>
                                        <span>Total</span>
                                        <span>${historySummary.total.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* SMS confirmation modal */}
            {pendingReady && (
                <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4'>
                    <div className='bg-white rounded-xl shadow-xl p-6 max-w-sm w-full'>
                        <h3 className='text-lg font-bold mb-1'>Mark as Ready?</h3>
                        <p className='text-sm text-gray-600 mb-5'>
                            {pendingReady.phone ? (
                                <>
                                    Send a text notification to{' '}
                                    <span className='font-semibold text-gray-900'>
                                        {pendingReady.phone}
                                    </span>{' '}
                                    to let them know their corndog is ready?
                                </>
                            ) : (
                                'No phone number on file for this order. Mark as ready?'
                            )}
                        </p>
                        <div className='flex gap-3 justify-end'>
                            <Button
                                variant='outline'
                                onClick={() => confirmReady(false)}
                            >
                                {pendingReady.phone ? 'Skip' : 'Mark Ready'}
                            </Button>
                            {pendingReady.phone && (
                                <Button onClick={() => confirmReady(true)}>
                                    Send Text & Mark Ready
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
