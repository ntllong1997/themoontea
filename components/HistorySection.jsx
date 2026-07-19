import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';

const calculateOrderTotal = (orderList, taxRate) => {
    const subtotal = orderList.reduce((sum, item) => sum + item.price, 0);
    const tax = subtotal * taxRate;
    return (subtotal + tax).toFixed(2);
};

export default function HistorySection({
    title,
    sectionKey,
    orders,
    taxRate,
    totalRevenue,
    onItemClick,
    getItemClassName,
    getItemBadge,
    getItemTooltip,
    getOrderActions,
    getOrderPhone,
    onSavePhone,
    className = '',
}) {
    const [editingPhone, setEditingPhone] = useState(null);
    const [draftPhone, setDraftPhone] = useState('');

    const handleEditPhone = (orderNumber) => {
        setDraftPhone(getOrderPhone?.(orderNumber) ?? '');
        setEditingPhone(orderNumber);
    };

    const handleSavePhone = (orderNumber) => {
        onSavePhone?.(orderNumber, draftPhone);
        setEditingPhone(null);
    };

    return (
        <Card className={`mt-4 ${className}`}>
            <CardContent>
                {title && (
                    <div className='flex justify-between items-center mb-4'>
                        <h2 className='text-xl font-bold'>{title}</h2>
                        <span className='text-sm text-gray-500'>
                            {orders.length} order{orders.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                )}

                {orders.length === 0 ? (
                    <p className='text-gray-400 text-sm py-8 text-center'>
                        No orders yet.
                    </p>
                ) : (
                    orders.map(({ orderNumber, items }) => {
                        const phone = getOrderPhone ? getOrderPhone(orderNumber) : '';
                        return (
                            <div
                                key={`${sectionKey}-${orderNumber}`}
                                className='mb-4 border rounded-lg overflow-hidden'
                            >
                                <div className='flex items-center px-3 py-2 bg-gray-50 border-b gap-2'>
                                    <p className='font-semibold text-sm shrink-0'>
                                        Order #{orderNumber}
                                    </p>

                                    {/* Inline phone */}
                                    <div className='flex items-center gap-1 flex-1 min-w-0'>
                                        {editingPhone === orderNumber ? (
                                            <>
                                                <input
                                                    type='tel'
                                                    value={draftPhone}
                                                    onChange={(e) => setDraftPhone(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSavePhone(orderNumber);
                                                        if (e.key === 'Escape') setEditingPhone(null);
                                                    }}
                                                    autoFocus
                                                    className='text-xs border rounded px-2 py-1 w-28 focus:outline-none focus:border-blue-400'
                                                />
                                                <button
                                                    onClick={() => handleSavePhone(orderNumber)}
                                                    className='text-xs text-blue-600 font-semibold hover:underline'
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={() => setEditingPhone(null)}
                                                    className='text-xs text-gray-400 hover:text-gray-600'
                                                >
                                                    ✕
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => handleEditPhone(orderNumber)}
                                                className='text-xs text-gray-400 hover:text-gray-600 truncate'
                                            >
                                                {phone ? phone : '+ phone'}
                                            </button>
                                        )}
                                    </div>

                                    <div className='flex items-center gap-2 shrink-0'>
                                        {getOrderActions?.({ orderNumber, items })}
                                        <p className='text-sm text-gray-600'>
                                            $
                                            {calculateOrderTotal(
                                                items.map(({ item }) => item),
                                                taxRate
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className='p-2 space-y-1'>
                                    {items.map(({ item, itemIndex }) => {
                                        const key = `${orderNumber}-${itemIndex}`;
                                        const badge = getItemBadge?.(key, item);
                                        const tooltip = getItemTooltip?.(key, item);
                                        return (
                                            <div
                                                key={`${sectionKey}-${orderNumber}-${itemIndex}`}
                                                onClick={() =>
                                                    onItemClick(
                                                        orderNumber,
                                                        itemIndex
                                                    )
                                                }
                                                title={tooltip}
                                                className={`flex justify-between items-center text-sm px-3 py-2 rounded cursor-pointer transition-colors hover:opacity-80 select-none ${getItemClassName(item, key)}`}
                                            >
                                                <span>{item.displayName ?? item.name}</span>
                                                <span className='flex items-center gap-2'>
                                                    <span className='text-gray-600'>
                                                        ${item.price.toFixed(2)}
                                                    </span>
                                                    {badge && (
                                                        <span className='text-xs font-semibold'>
                                                            {badge}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                )}

                <div className='mt-4 pt-3 border-t flex justify-between items-center font-bold text-base'>
                    <span>Total Revenue</span>
                    <span>${totalRevenue}</span>
                </div>
            </CardContent>
        </Card>
    );
}
