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
    readyItems,
    onToggleReady,
    getHistoryBaseClass,
    taxRate,
    totalRevenue,
}) {
    return (
        <Card className='mt-4'>
            <CardContent>
                <div className='flex justify-between items-center mb-4'>
                    <h2 className='text-xl font-bold'>{title}</h2>
                    <span className='text-sm text-gray-500'>
                        {orders.length} order{orders.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {orders.length === 0 ? (
                    <p className='text-gray-400 text-sm py-8 text-center'>
                        No orders yet.
                    </p>
                ) : (
                    orders.map(({ orderNumber, items }) => (
                        <div
                            key={`${sectionKey}-${orderNumber}`}
                            className='mb-4 border rounded-lg overflow-hidden'
                        >
                            <div className='flex justify-between items-center px-3 py-2 bg-gray-50 border-b'>
                                <p className='font-semibold text-sm'>
                                    Order #{orderNumber}
                                </p>
                                <p className='text-sm text-gray-600'>
                                    $
                                    {calculateOrderTotal(
                                        items.map(({ item }) => item),
                                        taxRate
                                    )}
                                </p>
                            </div>
                            <div className='p-2 space-y-1'>
                                {items.map(({ item, itemIndex }) => {
                                    const isReady =
                                        readyItems[
                                            `${orderNumber}-${itemIndex}`
                                        ];
                                    return (
                                        <div
                                            key={`${sectionKey}-${orderNumber}-${itemIndex}`}
                                            onClick={() =>
                                                onToggleReady(
                                                    orderNumber,
                                                    itemIndex
                                                )
                                            }
                                            title={
                                                isReady
                                                    ? 'Click to mark as not ready'
                                                    : 'Click to mark as ready'
                                            }
                                            className={`flex justify-between items-center text-sm px-3 py-2 rounded cursor-pointer transition-colors hover:opacity-80 select-none ${
                                                isReady
                                                    ? 'bg-green-200'
                                                    : getHistoryBaseClass(item)
                                            }`}
                                        >
                                            <span>{item.name}</span>
                                            <span className='flex items-center gap-2'>
                                                <span className='text-gray-600'>
                                                    $
                                                    {item.price.toFixed(2)}
                                                </span>
                                                {isReady && (
                                                    <span className='text-green-700 font-semibold text-xs'>
                                                        Ready
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}

                <div className='mt-4 pt-3 border-t flex justify-between items-center font-bold text-base'>
                    <span>Total Revenue</span>
                    <span>${totalRevenue}</span>
                </div>
            </CardContent>
        </Card>
    );
}
