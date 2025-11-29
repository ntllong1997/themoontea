import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';

export default function HistoryPanel({
    history,
    calculateOrderTotal,
    calculateTotalRevenue,
}) {
    // Keep track of color states per item
    const [colorState, setColorState] = useState({});

    // Function to handle color cycling
    const handleColorCycle = (orderIndex, itemIndex) => {
        const key = `${orderIndex}-${itemIndex}`;
        const current = colorState[key] || 0;
        const next = (current + 1) % 3; // cycle 0 → 1 → 2 → 0
        setColorState((prev) => ({ ...prev, [key]: next }));
    };

    const getColorClass = (key) => {
        const color = colorState[key] || 0;
        switch (color) {
            case 0:
                return 'bg-blue-100';
            case 1:
                return 'bg-yellow-100';
            case 2:
                return 'bg-green-100';
            default:
                return 'bg-blue-100';
        }
    };

    return (
        <Card className='mt-4'>
            <CardContent>
                <h2 className='text-xl font-bold mb-4'>Order History</h2>

                {history.map((orderList, orderIndex) => {
                    const orderNumber =
                        orderList[0]?.orderNumber ?? orderIndex + 1;
                    return (
                        <div key={orderIndex} className='mb-4 border-b pb-2'>
                            <p className='font-semibold'>
                                Order #{orderNumber} - Total: $
                                {calculateOrderTotal(orderList)}
                            </p>

                            {orderList.map((item, itemIndex) => {
                                const key = `${orderIndex}-${itemIndex}`;
                                return (
                                    <div
                                        key={key}
                                        onClick={() =>
                                            handleColorCycle(
                                                orderIndex,
                                                itemIndex
                                            )
                                        }
                                        className={`text-sm p-1 rounded cursor-pointer transition-colors ${getColorClass(
                                            key
                                        )}`}
                                    >
                                        {item.name} - ${item.price.toFixed(2)}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}

                <div className='mt-6 text-right font-bold text-lg'>
                    Total Revenue: ${calculateTotalRevenue(history)}
                </div>
            </CardContent>
        </Card>
    );
}
