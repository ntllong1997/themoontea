import { Button } from '@/components/ui/Button';

export default function OrderSummary({
    orders,
    handleQuantityChange,
    subtotal,
    tax,
    total,
    handleSendOrder,
}) {
    return (
        <div>
            <h2 className='text-xl font-bold mb-4'>Summary</h2>
            {orders.map((item, index) => (
                <div
                    key={index}
                    className='flex justify-between items-center mb-2'
                >
                    <span>
                        {item.name} - ${item.price.toFixed(2)} x {item.quantity}
                    </span>
                    <div className='flex items-center gap-2'>
                        <Button
                            size='sm'
                            onClick={() => handleQuantityChange(index, -1)}
                        >
                            -
                        </Button>
                        <Button
                            size='sm'
                            onClick={() => handleQuantityChange(index, 1)}
                        >
                            +
                        </Button>
                        <Button
                            variant='destructive'
                            size='sm'
                            onClick={() =>
                                handleQuantityChange(index, -item.quantity)
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
            <Button onClick={handleSendOrder} className='mt-4 w-full'>
                Send Order
            </Button>
        </div>
    );
}
