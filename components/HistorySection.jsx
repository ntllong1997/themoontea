import { Card, CardContent } from '@/components/ui/Card';

const PAYMENT_BADGE = {
    cash: '💵 Cash',
    cashapp: '💚 CashApp',
    card: '💳 Tap',
};

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
                    orders.map(({ orderNumber, items }) => {
                        const paymentMethod = items[0]?.item?.payment_method;
                        const paymentBadge = PAYMENT_BADGE[paymentMethod];
                        return (
                        <div
                            key={`${sectionKey}-${orderNumber}`}
                            className='mb-4 border rounded-lg overflow-hidden'
                        >
                            <div className='flex justify-between items-center px-3 py-2 bg-gray-50 border-b gap-2'>
                                <p className='font-semibold text-sm shrink-0'>
                                    Order #{orderNumber}
                                </p>
                                <div className='flex items-center gap-2 ml-auto'>
                                    {paymentBadge && (
                                        <span className='text-xs font-medium text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-full shrink-0'>
                                            {paymentBadge}
                                        </span>
                                    )}
                                    {getOrderActions?.({ orderNumber, items })}
                                    <p className='text-sm text-gray-600 shrink-0'>
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
                                    const badge = getItemBadge?.(key);
                                    const tooltip = getItemTooltip?.(key);
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
                                            <span>{item.name}</span>
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
