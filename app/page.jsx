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

const getHistoryBaseClass = (item) =>
    item.type !== 'Boba' ? 'bg-blue-100' : 'bg-yellow-50';

const splitHistoryByType = (historyList) => {
    const bobaOrders = [];
    const corndogOrders = [];

    historyList.forEach((orderList, orderIdx) => {
        const orderNumber = orderList[0]?.orderNumber ?? orderIdx + 1;
        const withIndex = orderList.map((item, idx) => ({
            item,
            itemIndex: idx,
        }));

        const bobaItems = withIndex.filter(({ item }) => item.type === 'Boba');
        const corndogItems = withIndex.filter(
            ({ item }) => item.type !== 'Boba'
        );

        if (bobaItems.length) {
            bobaOrders.push({ orderNumber, items: bobaItems });
        }
        if (corndogItems.length) {
            corndogOrders.push({ orderNumber, items: corndogItems });
        }
    });

    return { bobaOrders, corndogOrders };
};

const calculateTotalRevenue = (history) =>
    history
        .reduce((total, orderList) => {
            const subtotal = orderList.reduce(
                (sum, item) => sum + item.price,
                0
            );
            const tax = subtotal * TAX_RATE;
            return total + subtotal + tax;
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
    const [readyItems, setReadyItems] = useState({});
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
        const price = PRICES.Boba;

        setOrders((prevOrders) => {
            const existingIndex = prevOrders.findIndex(
                (item) => item.name === name
            );

            if (existingIndex >= 0) {
                const updatedOrders = [...prevOrders];
                updatedOrders[existingIndex].quantity += 1;
                return updatedOrders;
            }

            return [...prevOrders, { name, price, type: 'Boba', quantity: 1 }];
        });

        setSelectedDrink('');
        setSelectedBoba('');
    }, [selectedDrink, selectedBoba]);

    const handleAddCorndog = useCallback(() => {
        if (!selectedCorndog) return;

        const name = selectedCorndog;
        const price = PRICES.Corndog;

        setOrders((prevOrders) => {
            const existingIndex = prevOrders.findIndex(
                (item) => item.name === name
            );

            if (existingIndex >= 0) {
                const updatedOrders = [...prevOrders];
                updatedOrders[existingIndex].quantity += 1;
                return updatedOrders;
            }

            return [
                ...prevOrders,
                { name, price, type: 'Corndog', quantity: 1 },
            ];
        });

        setSelectedCorndog('');
    }, [selectedCorndog]);

    const handleQuantityChange = useCallback((index, delta) => {
        setOrders((prevOrders) => {
            const updatedOrders = [...prevOrders];
            updatedOrders[index].quantity += delta;

            if (updatedOrders[index].quantity <= 0) {
                updatedOrders.splice(index, 1);
            }

            return updatedOrders;
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
                }))
            );

            await saveOrderHistory(enrichedOrders);
            setHistory((prev) => [...prev, enrichedOrders]);
            setOrders([]);
        } catch (err) {
            console.error('Send order failed:', err);
        }
    }, [orders]);

    const toggleHistoryItemReady = useCallback((orderNumber, itemIndex) => {
        const key = `${orderNumber}-${itemIndex}`;
        setReadyItems((prev) => {
            const isReady = !prev[key];
            if (isReady) return { ...prev, [key]: true };

            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    const subtotal = orders.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
    );
    const tax = subtotal * TAX_RATE;
    const total = (subtotal + tax).toFixed(2);
    const totalRevenue = calculateTotalRevenue(history);
    const historySummary = calculateHistorySummary(history);
    const selection = {
        drink: selectedDrink,
        boba: selectedBoba,
        corndog: selectedCorndog,
    };
    const { bobaOrders, corndogOrders } = splitHistoryByType(history);

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className='sticky top-0 z-50 bg-white px-4 shadow-sm'>
                <TabsTrigger value='order'>Order</TabsTrigger>
                <TabsTrigger value='bobaHistory'>Boba History</TabsTrigger>
                <TabsTrigger value='corndogHistory'>
                    Corndog History
                </TabsTrigger>
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
                                <h2 className='text-xl font-bold mb-4'>
                                    Cart
                                </h2>
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
                                                        ${item.price.toFixed(2)}{' '}
                                                        × {item.quantity} = $
                                                        {(
                                                            item.price *
                                                            item.quantity
                                                        ).toFixed(2)}
                                                    </p>
                                                </div>
                                                <div className='flex items-center gap-1 shrink-0'>
                                                    <Button
                                                        size='sm'
                                                        variant='outline'
                                                        onClick={() =>
                                                            handleQuantityChange(
                                                                index,
                                                                -1
                                                            )
                                                        }
                                                    >
                                                        −
                                                    </Button>
                                                    <Button
                                                        size='sm'
                                                        variant='outline'
                                                        onClick={() =>
                                                            handleQuantityChange(
                                                                index,
                                                                1
                                                            )
                                                        }
                                                    >
                                                        +
                                                    </Button>
                                                    <Button
                                                        variant='destructive'
                                                        size='sm'
                                                        onClick={() =>
                                                            handleQuantityChange(
                                                                index,
                                                                -item.quantity
                                                            )
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
                    readyItems={readyItems}
                    onToggleReady={toggleHistoryItemReady}
                    getHistoryBaseClass={getHistoryBaseClass}
                    taxRate={TAX_RATE}
                    totalRevenue={totalRevenue}
                />
            </TabsContent>

            <TabsContent value='corndogHistory'>
                <HistorySection
                    title='Corndog History'
                    sectionKey='corndog'
                    orders={corndogOrders}
                    readyItems={readyItems}
                    onToggleReady={toggleHistoryItemReady}
                    getHistoryBaseClass={getHistoryBaseClass}
                    taxRate={TAX_RATE}
                    totalRevenue={totalRevenue}
                />
            </TabsContent>

            <TabsContent value='summary'>
                <Card className='mt-4'>
                    <CardContent>
                        <h2 className='text-xl font-bold mb-4'>
                            Summary Snapshot
                        </h2>
                        <div className='space-y-2 text-sm'>
                            <p>Drinks (Boba): {historySummary.bobaCount}</p>
                            <p>Corndog: {historySummary.corndogCount}</p>
                            <div className='pt-2 border-t space-y-1'>
                                <div className='flex justify-between'>
                                    <span>Subtotal</span>
                                    <span>
                                        $
                                        {historySummary.subtotal.toFixed(2)}
                                    </span>
                                </div>
                                <div className='flex justify-between text-gray-500'>
                                    <span>Tax (8.25%)</span>
                                    <span>
                                        ${historySummary.tax.toFixed(2)}
                                    </span>
                                </div>
                                <div className='flex justify-between font-bold text-base pt-1'>
                                    <span>Total</span>
                                    <span>
                                        ${historySummary.total.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
