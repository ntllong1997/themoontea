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

    const [bobaReadyItems, setBobaReadyItems] = useState({});
    const [corndogStates, setCorndogStates] = useState({});
    // Set of orderNumbers that have already been notified
    const [notifiedOrders, setNotifiedOrders] = useState(new Set());

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

    useEffect(() => { fetchHistory(); }, [fetchHistory]);

    useEffect(() => {
        if (!isHistoryTab) return;
        fetchHistory();
        const id = setInterval(fetchHistory, 3000);
        return () => clearInterval(id);
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
        setOrders((prev) => {
            const idx = prev.findIndex((i) => i.name === selectedCorndog);
            if (idx >= 0) {
                const next = [...prev];
                next[idx].quantity += 1;
                return next;
            }
            return [...prev, { name: selectedCorndog, price: PRICES.Corndog, type: 'Corndog', quantity: 1 }];
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
            if (prev[key]) { const next = { ...prev }; delete next[key]; return next; }
            return { ...prev, [key]: true };
        });
    }, []);

    // Corndog: 3-state cycle, no popup — direct advance
    const handleCorndogItemClick = useCallback((orderNumber, itemIndex) => {
        const key = `${orderNumber}-${itemIndex}`;
        const current = corndogStates[key] || CORNDOG_STATES.received;

        if (current === CORNDOG_STATES.received) {
            setCorndogStates((prev) => ({ ...prev, [key]: CORNDOG_STATES.making }));
        } else if (current === CORNDOG_STATES.making) {
            setCorndogStates((prev) => ({ ...prev, [key]: CORNDOG_STATES.ready }));
        } else {
            setCorndogStates((prev) => ({ ...prev, [key]: CORNDOG_STATES.received }));
        }
    }, [corndogStates]);

    // Open pre-filled Messages app to notify the customer
    const handleNotifyCustomer = useCallback((orderNumber, orderPhone) => {
        if (!orderPhone) return;
        const message = 'Your corndog order is ready for pickup!';
        window.location.href = `sms:${orderPhone}&body=${encodeURIComponent(message)}`;
        setNotifiedOrders((prev) => new Set([...prev, orderNumber]));
    }, []);

    // Returns a "Notify Customer" button for corndog order headers when all items are ready
    const getCorndogOrderActions = useCallback(
        ({ orderNumber, items }) => {
            const allReady =
                items.length > 0 &&
                items.every(({ itemIndex }) => {
                    const key = `${orderNumber}-${itemIndex}`;
                    return (corndogStates[key] || CORNDOG_STATES.received) === CORNDOG_STATES.ready;
                });

            if (!allReady) return null;

            const orderPhone = history
                .flat()
                .find((item) => item.orderNumber === orderNumber)?.phone;

            if (notifiedOrders.has(orderNumber)) {
                return (
                    <span className='text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded'>
                        Notified ✓
                    </span>
                );
            }

            if (!orderPhone) {
                return (
                    <span className='text-xs font-semibold text-green-700'>
                        All Ready ✓
                    </span>
                );
            }

            return (
                <Button
                    size='sm'
                    onClick={(e) => {
                        e.stopPropagation();
                        handleNotifyCustomer(orderNumber, orderPhone);
                    }}
                >
                    Notify Customer
                </Button>
            );
        },
        [corndogStates, history, notifiedOrders, handleNotifyCustomer]
    );

    // Item style/badge/tooltip helpers
    const getBobaItemClassName = useCallback(
        (item, key) => bobaReadyItems[key] ? 'bg-green-200' : (item.type !== 'Boba' ? 'bg-blue-100' : 'bg-yellow-50'),
        [bobaReadyItems]
    );
    const getBobaItemBadge = useCallback((key) => bobaReadyItems[key] ? 'Ready ✓' : null, [bobaReadyItems]);
    const getBobaItemTooltip = useCallback(
        (key) => bobaReadyItems[key] ? 'Click to mark as not ready' : 'Click to mark as ready',
        [bobaReadyItems]
    );

    const getCorndogItemClassName = useCallback(
        (_item, key) => CORNDOG_STATE_CLASS[corndogStates[key] || CORNDOG_STATES.received],
        [corndogStates]
    );
    const getCorndogItemBadge = useCallback(
        (key) => CORNDOG_STATE_BADGE[corndogStates[key] || CORNDOG_STATES.received],
        [corndogStates]
    );
    const getCorndogItemTooltip = useCallback(
        (key) => CORNDOG_STATE_TOOLTIP[corndogStates[key] || CORNDOG_STATES.received],
        [corndogStates]
    );

    const subtotal = orders.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const tax = subtotal * TAX_RATE;
    const total = (subtotal + tax).toFixed(2);
    const totalRevenue = calculateTotalRevenue(history);
    const historySummary = calculateHistorySummary(history);
    const selection = { drink: selectedDrink, boba: selectedBoba, corndog: selectedCorndog };
    const { bobaOrders, corndogOrders } = splitHistoryByType(history);

    return (
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
                                                    <p className='text-sm font-medium leading-snug'>{item.name}</p>
                                                    <p className='text-xs text-gray-500'>
                                                        ${item.price.toFixed(2)} × {item.quantity} = $
                                                        {(item.price * item.quantity).toFixed(2)}
                                                    </p>
                                                </div>
                                                <div className='flex items-center gap-1 shrink-0'>
                                                    <Button size='sm' variant='outline' onClick={() => handleQuantityChange(index, -1)}>−</Button>
                                                    <Button size='sm' variant='outline' onClick={() => handleQuantityChange(index, 1)}>+</Button>
                                                    <Button variant='destructive' size='sm' onClick={() => handleQuantityChange(index, -item.quantity)}>✕</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className='mt-4 border-t pt-3 space-y-1 text-sm'>
                                    <div className='flex justify-between'><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                                    <div className='flex justify-between text-gray-500'><span>Tax (8.25%)</span><span>${tax.toFixed(2)}</span></div>
                                    <div className='flex justify-between font-bold text-base pt-1'><span>Total</span><span>${total}</span></div>
                                </div>

                                <Button onClick={handleSendOrder} className='mt-4 w-full' disabled={orders.length === 0}>
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
                    getOrderActions={getCorndogOrderActions}
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
                                <div className='flex justify-between'><span>Subtotal</span><span>${historySummary.subtotal.toFixed(2)}</span></div>
                                <div className='flex justify-between text-gray-500'><span>Tax (8.25%)</span><span>${historySummary.tax.toFixed(2)}</span></div>
                                <div className='flex justify-between font-bold text-base pt-1'><span>Total</span><span>${historySummary.total.toFixed(2)}</span></div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
