'use client';

import { useState, useEffect } from 'react';
import { getOrderHistory, saveOrderHistory } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { getLatestOrderNumber } from '@/lib/db';

export default function OrderSystem() {
    const [orders, setOrders] = useState([]);
    const [history, setHistory] = useState([]);
    const [category, setCategory] = useState('Boba');
    const [selectedBoba, setSelectedBoba] = useState('');
    const [selectedDrink, setSelectedDrink] = useState('');
    const [selectedCorndog, setSelectedCorndog] = useState('');

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const groupedOrders = await getOrderHistory(); // API returns array of arrays
                // Optional: sort groups by timestamp of first item in each group (most recent first)

                setHistory(groupedOrders);
            } catch (error) {
                console.error('Failed to fetch order history:', error);
            }
        };
        fetchHistory();
        console.log('Order history fetched:', history);
    }, []);

    const prices = {
        Boba: 8.0,
        Corndog: 8.0,
        Dubai: 12.0,
    };

    const handleAddItem = () => {
        let name = '';
        if (category === 'Boba' && selectedDrink && selectedBoba) {
            name = `${selectedDrink} with ${selectedBoba}`;
            const item = {
                name,
                price: prices.Boba,
                type: 'Boba',
            };
            setOrders([...orders, item]);
            setSelectedDrink('');
            setSelectedBoba('');
        } else if (category === 'Corndog' && selectedCorndog) {
            const isDubai = selectedCorndog === 'Dubai Chocolate';
            const item = {
                name: selectedCorndog,
                price: isDubai ? prices.Dubai : prices.Corndog,
                type: 'Corndog',
            };
            setOrders([...orders, item]);
            setSelectedCorndog('');
        }
    };

    const handleSendOrder = async () => {
        if (orders.length === 0) return;

        try {
            const latestOrderNumber = await getLatestOrderNumber();
            const nextOrderNumber = latestOrderNumber + 1;
            const timestamp = new Date().toISOString();

            const enrichedOrders = orders.map((item) => ({
                orderNumber: nextOrderNumber,
                name: item.name,
                price: item.price,
                type: item.type,
                timestamp,
            }));

            await saveOrderHistory(enrichedOrders);
            setHistory([...history, enrichedOrders]);
            setOrders([]);
        } catch (err) {
            console.error('Send order failed:', err);
        }
    };

    const handleRemoveItem = (index) => {
        const newOrders = [...orders];
        newOrders.splice(index, 1);
        setOrders(newOrders);
    };

    const subtotal = orders.reduce((acc, item) => acc + item.price, 0);
    const taxRate = 0.0;
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
                                            'Golden Taro',
                                            'Thai Tea',
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
                                        'Dubai Chocolate',
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
                                        {item.name} - ${item.price.toFixed(2)}
                                    </span>
                                    <Button
                                        variant='destructive'
                                        size='sm'
                                        onClick={() => handleRemoveItem(index)}
                                    >
                                        Remove
                                    </Button>
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
                            const sortedOrder = [...orderList].sort((a, b) =>
                                (a.type || '').localeCompare(b.type || '')
                            );
                            const orderNumber =
                                orderList[0]?.orderNumber ?? index + 1;
                            return (
                                <div key={index} className='mb-4 border-b pb-2'>
                                    <p className='font-semibold'>
                                        Order #{orderNumber} - Total: $
                                        {calculateOrderTotal(orderList)}
                                    </p>
                                    {sortedOrder.map((item, itemIndex) => (
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
