'use client';

import { useEffect, useState } from 'react';
import {
    getLatestOrderNumber,
    getOrderHistory,
    saveOrderHistory,
} from '@/lib/db';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import OrderPanel from '@/components/OrderPanel';
import HistorySection from '@/components/HistorySection';

const TAX_RATE = 0.0825;
const PRICES = {
    Boba: 8.0,
    Corndog: 9.0,
    
};

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

export default function OrderSystem() {
    const [orders, setOrders] = useState([]);
    const [history, setHistory] = useState([]);
    const [category, setCategory] = useState('Boba');
    const [selectedBoba, setSelectedBoba] = useState('');
    const [selectedDrink, setSelectedDrink] = useState('');
    const [selectedCorndog, setSelectedCorndog] = useState('');
    const [readyItems, setReadyItems] = useState({});

    useEffect(() => {
        const fetchHistory = async () => {
            console.log(
                `Fetching order history at: ${new Date().toISOString()}`
            );
            try {
                const groupedOrders = await getOrderHistory();
                setHistory(groupedOrders);
            } catch (error) {
                console.error('Failed to fetch order history:', error);
            }
        };

        fetchHistory();
        const intervalId = setInterval(fetchHistory, 3000);
        return () => clearInterval(intervalId);
    }, []);

    const handleAddItem = () => {
        let name = '';
        let price = 0;

        if (category === 'Boba' && selectedDrink && selectedBoba) {
            name = `${selectedDrink} with ${selectedBoba}`;
            price = PRICES.Boba;
        } else if (category === 'Corndog' && selectedCorndog) {
            name = selectedCorndog;
            price = PRICES.Corndog;
        } else {
            return;
        }

        const existingIndex = orders.findIndex((item) => item.name === name);
        if (existingIndex >= 0) {
            const updatedOrders = [...orders];
            updatedOrders[existingIndex].quantity += 1;
            setOrders(updatedOrders);
        } else {
            const newItem = {
                name,
                price,
                type: category,
                quantity: 1,
            };
            setOrders([...orders, newItem]);
        }

        setSelectedDrink('');
        setSelectedBoba('');
        setSelectedCorndog('');
    };

    const handleQuantityChange = (index, delta) => {
        const updatedOrders = [...orders];
        updatedOrders[index].quantity += delta;

        if (updatedOrders[index].quantity <= 0) {
            updatedOrders.splice(index, 1);
        }

        setOrders(updatedOrders);
    };

    const handleSendOrder = async () => {
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
            setHistory([...history, enrichedOrders]);
            setOrders([]);
        } catch (err) {
            console.error('Send order failed:', err);
        }
    };

    const toggleHistoryItemReady = (orderNumber, itemIndex) => {
        const key = `${orderNumber}-${itemIndex}`;
        setReadyItems((prev) => {
            const isReady = !prev[key];
            if (isReady) return { ...prev, [key]: true };

            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const subtotal = orders.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
    );
    const tax = subtotal * TAX_RATE;
    const total = (subtotal + tax).toFixed(2);
    const totalRevenue = calculateTotalRevenue(history);
    const selection = {
        drink: selectedDrink,
        boba: selectedBoba,
        corndog: selectedCorndog,
    };
    const { bobaOrders, corndogOrders } = splitHistoryByType(history);

    return (
        <Tabs defaultValue='order' className='p-4'>
            <TabsList className='fixed top-0 left-0 right-0 z-50 bg-white p-2 shadow'>
                <TabsTrigger value='order'>Order</TabsTrigger>
                <TabsTrigger value='bobaHistory'>Boba History</TabsTrigger>
                <TabsTrigger value='corndogHistory'>
                    Corndog History
                </TabsTrigger>
            </TabsList>

            <TabsContent value='order' className='mt-20'>
                <div className='grid grid-cols-2 gap-4 mt-4'>
                    <OrderPanel
                        category={category}
                        onCategoryChange={setCategory}
                        selection={selection}
                        onSelectDrink={setSelectedDrink}
                        onSelectBoba={setSelectedBoba}
                        onSelectCorndog={setSelectedCorndog}
                        onAddItem={handleAddItem}
                        orders={orders}
                        subtotal={subtotal}
                        tax={tax}
                        total={total}
                        onQuantityChange={handleQuantityChange}
                        onSendOrder={handleSendOrder}
                    />
                </div>
            </TabsContent>

            <TabsContent value='bobaHistory' className='mt-20'>
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

            <TabsContent value='corndogHistory' className='mt-20'>
                <HistorySection
                    title='Corndog / Soda History'
                    sectionKey='corndog'
                    orders={corndogOrders}
                    readyItems={readyItems}
                    onToggleReady={toggleHistoryItemReady}
                    getHistoryBaseClass={getHistoryBaseClass}
                    taxRate={TAX_RATE}
                    totalRevenue={totalRevenue}
                />
            </TabsContent>
        </Tabs>
    );
}
