'use client';

import { useState, useEffect } from 'react';
import {
    getMenu,
    getOrderHistory,
    saveOrderHistory,
    getLatestOrderNumber,
} from '@/lib/db';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import MenuPanel from '@/components/MenuPanel';
import OrderSummary from '@/components/OrderSummary';
import HistoryPanel from '@/components/HistoryPanel';
import { Card, CardContent } from '@/components/ui/Card';

export default function OrderSystem() {
    const [menu, setMenu] = useState([]);
    const [orders, setOrders] = useState([]);
    const [history, setHistory] = useState([]);
    const [category, setCategory] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            const menuData = await getMenu();
            setMenu(menuData);
            if (menuData.length > 0) setCategory(menuData[0].category);

            const historyData = await getOrderHistory();
            setHistory(historyData);
        };
        fetchData();

        const interval = setInterval(async () => {
            const historyData = await getOrderHistory();
            setHistory(historyData);
            console.log(`📡 Fetched history at ${new Date().toISOString()}`);
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    const handleAddItem = (item) => {
        const existingIndex = orders.findIndex((o) => o.name === item.name);
        if (existingIndex >= 0) {
            const updatedOrders = [...orders];
            updatedOrders[existingIndex].quantity += 1;
            setOrders(updatedOrders);
        } else {
            setOrders([...orders, { ...item, quantity: 1 }]);
        }
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
        const latestOrderNumber = await getLatestOrderNumber();
        const nextOrderNumber = latestOrderNumber + 1;
        const timestamp = new Date().toISOString();

        const enrichedOrders = orders.flatMap((item) =>
            Array.from({ length: item.quantity }).map(() => ({
                orderNumber: nextOrderNumber,
                name: item.name,
                price: item.price,
                type: item.category,
                timestamp,
            }))
        );

        await saveOrderHistory(enrichedOrders);
        setOrders([]);
    };

    const subtotal = orders.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
    );
    const taxRate = 0.0825;
    const tax = subtotal * taxRate;
    const total = (subtotal + tax).toFixed(2);

    const calculateOrderTotal = (orderList) => {
        const subtotal = orderList.reduce((sum, item) => sum + item.price, 0);
        const tax = subtotal * taxRate;
        return (subtotal + tax).toFixed(2);
    };

    const calculateTotalRevenue = (history) => {
        return history
            .reduce((total, orderList) => {
                const subtotal = orderList.reduce(
                    (sum, item) => sum + item.price,
                    0
                );
                const tax = subtotal * taxRate;
                return total + subtotal + tax;
            }, 0)
            .toFixed(2);
    };

    return (
        <Tabs defaultValue='history' className='p-4'>
            <TabsList className='fixed top-0 left-0 right-0 z-50 bg-white p-2 shadow'>
                <TabsTrigger value='order'>Order</TabsTrigger>
                <TabsTrigger value='history'>History</TabsTrigger>
            </TabsList>

            <TabsContent value='order' className='mt-20'>
                <div className='grid grid-cols-2 gap-4 mt-4'>
                    <MenuPanel
                        menu={menu}
                        category={category}
                        setCategory={setCategory}
                        handleAddItem={handleAddItem}
                    />
                    <Card className='col-span-2'>
                        <CardContent>
                            <OrderSummary
                                orders={orders}
                                handleQuantityChange={handleQuantityChange}
                                subtotal={subtotal}
                                tax={tax}
                                total={total}
                                handleSendOrder={handleSendOrder}
                            />
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value='history' className='mt-20'>
                <HistoryPanel
                    history={history}
                    calculateOrderTotal={calculateOrderTotal}
                    calculateTotalRevenue={calculateTotalRevenue}
                />
            </TabsContent>
        </Tabs>
    );
}
