'use client';

import { useState, useEffect } from 'react';
import {
    getOrderHistory,
    saveOrderHistory,
    getLatestOrderNumber,
} from '@/lib/db';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import Menu from './menu/page';

export default function OrderSystem() {
    const [orders, setOrders] = useState([]);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        const fetchHistory = async () => {
            console.log(
                `📡 Fetching order history at: ${new Date().toISOString()}`
            );
            try {
                const groupedOrders = await getOrderHistory();
                setHistory(groupedOrders);
            } catch (error) {
                console.error('Failed to fetch order history:', error);
            }
        };

        fetchHistory();
        const intervalId = setInterval(fetchHistory, 3000); // Poll every 3s
        return () => clearInterval(intervalId);
    }, []);

    const handleAddItem = (newItem) => {
        const existingIndex = orders.findIndex(
            (item) => item.name === newItem.name
        );
        if (existingIndex >= 0) {
            const updatedOrders = [...orders];
            updatedOrders[existingIndex].quantity += 1;
            setOrders(updatedOrders);
        } else {
            setOrders([...orders, newItem]);
        }
    };

    const handleQuantityChange = (index, delta) => {
        const updatedOrders = [...orders];
        updatedOrders[index].quantity += delta;
        if (updatedOrders[index].quantity <= 0) {
            updatedOrders.splice(index, 1); // Remove if quantity drops to 0
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
                    <Card className='col-span-2'>
                        <CardContent>
                            <h2 className='text-xl font-bold mb-4'>
                                Order Panel
                            </h2>
                            <Menu onAddItem={handleAddItem} />

                            <h2 className='text-xl font-bold mb-4'>Summary</h2>
                            {orders.map((item, index) => (
                                <div
                                    key={index}
                                    className='flex justify-between items-center mb-2'
                                >
                                    <span>
                                        {item.name} - ${item.price.toFixed(2)} x{' '}
                                        {item.quantity}
                                    </span>
                                    <div className='flex items-center gap-2'>
                                        <Button
                                            size='sm'
                                            onClick={() =>
                                                handleQuantityChange(index, -1)
                                            }
                                        >
                                            -
                                        </Button>
                                        <Button
                                            size='sm'
                                            onClick={() =>
                                                handleQuantityChange(index, 1)
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
                                            Remove
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            <div className='mt-4'>
                                <p>Subtotal: ${subtotal.toFixed(2)}</p>
                                <p>Tax (8.25%): ${tax.toFixed(2)}</p>
                                <p className='font-bold'>Total: ${total}</p>
                            </div>
                            <Button
                                onClick={handleSendOrder}
                                className='mt-4 w-full'
                            >
                                Send Order
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value='history' className='mt-20'>
                <Card className='mt-4'>
                    <CardContent>
                        <h2 className='text-xl font-bold mb-4'>
                            Order History
                        </h2>
                        {history.map((orderList, index) => {
                            const orderNumber =
                                orderList[0]?.orderNumber ?? index + 1;
                            return (
                                <div key={index} className='mb-4 border-b pb-2'>
                                    <p className='font-semibold'>
                                        Order #{orderNumber} - Total: $
                                        {calculateOrderTotal(orderList)}
                                    </p>
                                    {orderList.map((item, itemIndex) => (
                                        <div
                                            key={itemIndex}
                                            className={`text-sm p-1 rounded ${
                                                item.type !== 'Boba'
                                                    ? 'bg-blue-100'
                                                    : 'bg-yellow-50'
                                            }`}
                                        >
                                            {item.name} - $
                                            {item.price.toFixed(2)}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                        <div className='mt-6 text-right font-bold text-lg'>
                            Total Revenue: ${calculateTotalRevenue(history)}
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
