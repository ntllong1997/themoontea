// components/OrderSummary.js
import { useState } from 'react';
import useStore from '@/components/Store';
//import printOrder from '../utils/printOrder';

export default function OrderSummary() {
    const { orders, removeFromOrder, moveOrderItem, applyDiscount } =
        useStore();
    const [discountInput, setDiscountInput] = useState({});

    const handleDiscount = (index) => {
        const discount = discountInput[index] || 0;
        applyDiscount(index, parseFloat(discount));
    };

    return (
        <div className='flex flex-col gap-4'>
            <h2 className='text-2xl font-bold'>Order Summary</h2>
            {orders.length === 0 ? (
                <p className='text-gray-500'>No items in order</p>
            ) : (
                orders.map((item, index) => (
                    <div
                        key={index}
                        className='flex justify-between items-center p-4 bg-white rounded-lg shadow'
                    >
                        <div className='flex-1'>
                            <span className='text-lg'>
                                {item.name} - ${item.price.toFixed(2)}
                            </span>
                            {item.discount && (
                                <span className='text-sm text-green-600'>
                                    {' '}
                                    (Discount: ${item.discount.toFixed(2)})
                                </span>
                            )}
                        </div>
                        <div className='flex gap-2'>
                            <button
                                onClick={() => moveOrderItem(index, 'up')}
                                disabled={index === 0}
                                className='px-2 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300'
                            >
                                ↑
                            </button>
                            <button
                                onClick={() => moveOrderItem(index, 'down')}
                                disabled={index === orders.length - 1}
                                className='px-2 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300'
                            >
                                ↓
                            </button>
                            <button
                                onClick={() => removeFromOrder(index)}
                                className='px-2 py-1 bg-red-500 text-white rounded'
                            >
                                Remove
                            </button>
                            <div className='flex items-center gap-2'>
                                <input
                                    type='number'
                                    placeholder='Discount'
                                    value={discountInput[index] || ''}
                                    onChange={(e) =>
                                        setDiscountInput({
                                            ...discountInput,
                                            [index]: e.target.value,
                                        })
                                    }
                                    className='w-20 p-1 border rounded'
                                />
                                <button
                                    onClick={() => handleDiscount(index)}
                                    className='px-2 py-1 bg-green-500 text-white rounded'
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                    </div>
                ))
            )}
            {orders.length > 0 && (
                <button
                    onClick={printOrder}
                    className='mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700'
                >
                    Place Order
                </button>
            )}
        </div>
    );
}
