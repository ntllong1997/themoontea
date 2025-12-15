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
                <h2 className='text-xl font-bold mb-4'>{title}</h2>
                {orders.map(({ orderNumber, items }) => (
                    <div
                        key={`${sectionKey}-${orderNumber}`}
                        className='mb-4 border-b pb-2'
                    >
                        <p className='font-semibold'>
                            Order #{orderNumber} - Total: $
                            {calculateOrderTotal(
                                items.map(({ item }) => item),
                                taxRate
                            )}
                        </p>
                        {items.map(({ item, itemIndex }) => (
                            <div
                                key={`${sectionKey}-${orderNumber}-${itemIndex}`}
                                onClick={() =>
                                    onToggleReady(orderNumber, itemIndex)
                                }
                                className={`text-sm p-1 rounded cursor-pointer transition-colors ${
                                    readyItems[`${orderNumber}-${itemIndex}`]
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
                    Total Revenue: ${totalRevenue}
                </div>
            </CardContent>
        </Card>
    );
}
