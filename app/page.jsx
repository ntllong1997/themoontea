'use client';

import { useState, useEffect } from 'react';
import { getOrderHistory, saveOrderHistory } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';

export default function OrderSystem() {
    const [orders, setOrders] = useState([]);
    const [history, setHistory] = useState([]);
    const [category, setCategory] = useState('Boba');
    const [selectedBoba, setSelectedBoba] = useState('');
    const [selectedDrink, setSelectedDrink] = useState('');
    const [selectedCorndog, setSelectedCorndog] = useState('');

    useEffect(() => {
        const fetchHistory = async () => {
            const storedHistory = await getOrderHistory();
            setHistory(storedHistory);
        };
        fetchHistory();
    }, []);

    const prices = {
        Boba: 7.0,
        Corndog: 8.0,
    };

    const handleAddItem = () => {
        if (category === 'Boba' && selectedDrink && selectedBoba) {
            const item = {
                type: 'Boba',
                drink: selectedDrink,
                boba: selectedBoba,
                price: prices.Boba,
            };
            setOrders([...orders, item]);
            setSelectedDrink('');
            setSelectedBoba('');
        } else if (category === 'Corndog' && selectedCorndog) {
            const item = {
                type: 'Corndog',
                name: selectedCorndog,
                price: prices.Corndog,
            };
            setOrders([...orders, item]);
            setSelectedCorndog('');
        }
    };

    const handleSendOrder = async () => {
        if (orders.length === 0) return;
        const newHistory = [...history, orders];
        setHistory(newHistory);
        await saveOrderHistory(newHistory);
        setOrders([]);
    };

    const handleRemoveItem = (index) => {
        const newOrders = [...orders];
        newOrders.splice(index, 1);
        setOrders(newOrders);
    };

    const subtotal = orders.reduce((acc, item) => acc + item.price, 0);
    const taxRate = 0.0825;
    const tax = subtotal * taxRate;
    const total = (subtotal + tax).toFixed(2);

    const calculateOrderTotal = (orderList) => {
        const subtotal = orderList.reduce((sum, item) => sum + item.price, 0);
        const tax = subtotal * taxRate;
        return (subtotal + tax).toFixed(2);
    };

    return (
        <Tabs defaultValue='order' className='p-4'>
            <TabsList>
                <TabsTrigger value='order'>Order</TabsTrigger>
                <TabsTrigger value='history'>History</TabsTrigger>
            </TabsList>

            <TabsContent value='order'>
                <div className='grid grid-cols-2 gap-4 mt-4'>
                    {/* Order Panel + Summary Combined */}
                    <Card className='col-span-2'>
                        <CardContent>
                            <h2 className='text-xl font-bold mb-4'>
                                Order Panel
                            </h2>
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
                                        {item.type === 'Boba'
                                            ? `${item.drink} with ${item.boba}`
                                            : item.name}{' '}
                                        - ${item.price.toFixed(2)}
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

            <TabsContent value='history'>
                <Card className='mt-4'>
                    <CardContent>
                        <h2 className='text-xl font-bold mb-4'>
                            Order History
                        </h2>
                        {history.map((orderList, index) => (
                            <div key={index} className='mb-4 border-b pb-2'>
                                <p className='font-semibold'>
                                    Order #{index + 1} - Total: $
                                    {calculateOrderTotal(orderList)}
                                </p>
                                {orderList.map((item, itemIndex) => (
                                    <div key={itemIndex} className='text-sm'>
                                        {item.type === 'Boba'
                                            ? `${item.drink} with ${item.boba}`
                                            : item.name}{' '}
                                        - ${item.price.toFixed(2)}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
