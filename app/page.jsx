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
import OrderPanel from '@/components/OrderPanel';
import HistorySection from '@/components/HistorySection';

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

    const prices = {
        Boba: 8.0,
        Corndog: 9.0,
        Soda: 3.0,
    };

    const handleAddItem = () => {
        let name = '';
        let price = 0;
        if (category === 'Boba' && selectedDrink && selectedBoba) {
            name = `${selectedDrink} with ${selectedBoba}`;
            price = prices.Boba;
        } else if (category === 'Corndog' && selectedCorndog) {
            name = selectedCorndog;
            price = selectedCorndog === 'Soda' ? prices.Soda : prices.Corndog;
        } else {
            return; // Nothing selected
        }

        // Check if item already exists
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

    const getHistoryBaseClass = (item) =>
        item.type !== 'Boba' ? 'bg-blue-100' : 'bg-yellow-50';

    const toggleHistoryItemReady = (orderNumber, itemIndex) => {
        const key = `${orderNumber}-${itemIndex}`;
        setReadyItems((prev) => {
            const isReady = !prev[key];
            if (isReady) return { ...prev, [key]: true };

            const next = { ...prev };
            delete next[key]; // revert to base color
            return next;
        });
    };

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
            const corndogItems = withIndex.filter(({ item }) => item.type !== 'Boba');

            if (bobaItems.length) {
                bobaOrders.push({ orderNumber, items: bobaItems });
            }
            if (corndogItems.length) {
                corndogOrders.push({ orderNumber, items: corndogItems });
            }
        });

        return { bobaOrders, corndogOrders };
    };

    const { bobaOrders, corndogOrders } = splitHistoryByType(history);
    const totalRevenue = calculateTotalRevenue(history);

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
                    <Card className='col-span-2'>
                        <CardContent>
                            <h2 className='text-xl font-bold mb-4'>
                                Order Panel
                            </h2>
                            {/* Category Buttons */}
                            <div className='mb-2'>
                                <Button
                                    variant={
                                        category === 'Boba'
                                            ? 'default'
                                            : 'outline'
                                    }
                                    onClick={() => setCategory('Boba')}
                                >
                                    Boba
                                </Button>
                                <Button
                                    variant={
                                        category === 'Corndog'
                                            ? 'default'
                                            : 'outline'
                                    }
                                    onClick={() => setCategory('Corndog')}
                                    className='ml-2'
                                >
                                    Corndog
                                </Button>
                            </div>

                            {/* Options */}
                            {category === 'Boba' && (
                                <div className='grid grid-cols-2 gap-2 mb-4'>
                                    <div>
                                        <p className='font-semibold'>Drinks</p>
                                        {[
                                            'Brown Sugar',
                                            'Korean Strawberry',
                                            'Double Cheese',
                                            'Tiramisu',
                                            'Tropical',
                                            'Strawberry',
                                            'Cafe',
                                            'Matcha Strawberry',
                                        ].map((drink) => (
                                            <Button
                                                key={drink}
                                                variant={
                                                    selectedDrink === drink
                                                        ? 'default'
                                                        : 'outline'
                                                }
                                                className='w-full mb-1'
                                                onClick={() =>
                                                    setSelectedDrink(drink)
                                                }
                                            >
                                                {drink}
                                            </Button>
                                        ))}
                                    </div>
                                    <div>
                                        <p className='font-semibold'>Boba</p>
                                        {[
                                            'Tapioca',
                                            'Mango Popping',
                                            'Strawberry Popping',
                                        ].map((boba) => (
                                            <Button
                                                key={boba}
                                                variant={
                                                    selectedBoba === boba
                                                        ? 'default'
                                                        : 'outline'
                                                }
                                                className='w-full mb-1'
                                                onClick={() =>
                                                    setSelectedBoba(boba)
                                                }
                                            >
                                                {boba}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {category === 'Corndog' && (
                                <div className='grid grid-cols-1 gap-2 mb-4'>
                                    {[
                                        'Cheese Potato',
                                        'Cheese Hot Cheeto',
                                        'Half-Half Potato',
                                        'Half-Half Hot Cheeto',
                                        'Soda',
                                    ].map((corndog) => (
                                        <Button
                                            key={corndog}
                                            variant={
                                                selectedCorndog === corndog
                                                    ? 'default'
                                                    : 'outline'
                                            }
                                            className='w-full'
                                            onClick={() =>
                                                setSelectedCorndog(corndog)
                                            }
                                        >
                                            {corndog}
                                        </Button>
                                    ))}
                                </div>
                            )}

                            <Button
                                onClick={handleAddItem}
                                className='w-full mb-6'
                            >
                                Add to Order
                            </Button>

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

            <TabsContent value='bobaHistory' className='mt-20'>
                <Card className='mt-4'>
                    <CardContent>
                        <h2 className='text-xl font-bold mb-4'>Boba History</h2>
                        {bobaOrders.map(({ orderNumber, items }) => (
                            <div
                                key={`boba-${orderNumber}`}
                                className='mb-4 border-b pb-2'
                            >
                                <p className='font-semibold'>
                                    Order #{orderNumber} - Total: $
                                    {calculateOrderTotal(
                                        items.map(({ item }) => item)
                                    )}
                                </p>
                                {items.map(({ item, itemIndex }) => (
                                    <div
                                        key={`boba-${orderNumber}-${itemIndex}`}
                                        onClick={() =>
                                            toggleHistoryItemReady(
                                                orderNumber,
                                                itemIndex
                                            )
                                        }
                                        className={`text-sm p-1 rounded cursor-pointer transition-colors ${
                                            readyItems[
                                                `${orderNumber}-${itemIndex}`
                                            ]
                                                ? 'bg-green-200'
                                                : getHistoryBaseClass(item)
                                        }`}
                                    >
                                        {item.name} - ${item.price.toFixed(2)}
                                    </div>
                                ))}
                            </div>
                        ))}
                        <div className='mt-6 text-right font-bold text-lg'>
                            Total Revenue: ${calculateTotalRevenue(history)}
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value='corndogHistory' className='mt-20'>
                <Card className='mt-4'>
                    <CardContent>
                        <h2 className='text-xl font-bold mb-4'>
                            Corndog / Soda History
                        </h2>
                        {corndogOrders.map(({ orderNumber, items }) => (
                            <div
                                key={`corndog-${orderNumber}`}
                                className='mb-4 border-b pb-2'
                            >
                                <p className='font-semibold'>
                                    Order #{orderNumber} - Total: $
                                    {calculateOrderTotal(
                                        items.map(({ item }) => item)
                                    )}
                                </p>
                                {items.map(({ item, itemIndex }) => (
                                    <div
                                        key={`corndog-${orderNumber}-${itemIndex}`}
                                        onClick={() =>
                                            toggleHistoryItemReady(
                                                orderNumber,
                                                itemIndex
                                            )
                                        }
                                        className={`text-sm p-1 rounded cursor-pointer transition-colors ${
                                            readyItems[
                                                `${orderNumber}-${itemIndex}`
                                            ]
                                                ? 'bg-green-200'
                                                : getHistoryBaseClass(item)
                                        }`}
                                    >
                                        {item.name} - ${item.price.toFixed(2)}
                                    </div>
                                ))}
                            </div>
                        ))}
                        <div className='mt-6 text-right font-bold text-lg'>
                            Total Revenue: ${calculateTotalRevenue(history)}
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
