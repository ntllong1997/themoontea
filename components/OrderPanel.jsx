import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export const TAX_RATE = 0.0825;
export const PRICES = {
    Boba: 8.0,
    Corndog: 9.0,
};

const DRINK_OPTIONS = [
    'Brown Sugar',
    'Matcha Brown Sugar',
    'Golden Taro',
    'Korean Strawberry',
    'Tropical',
    'Strawberry',
    'Cafe',
    'Matcha Strawberry',
];

const BOBA_OPTIONS = [
    'Tapioca',
    'Mango Popping',
    'Strawberry Popping',
    'Nothing',
];

const CORNDOG_OPTIONS = [
    'Cheese Potato',
    'Cheese Hot Cheeto',
    'Half-Half Potato',
    'Half-Half Hot Cheeto',
    'Cheese Original',
    'Half-Half Original',
];

export default function OrderPanel({
    selection,
    onSelectDrink,
    onSelectBoba,
    onSelectCorndog,
    onAddBoba,
    onAddCorndog,
    orders,
    subtotal,
    tax,
    total,
    onQuantityChange,
    onSendOrder,
}) {
    return (
        <Card className='col-span-2'>
            <CardContent className='flex flex-col min-h-screen'>
                <h2 className='text-xl font-bold mb-4'>Order Panel</h2>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-6'>
                    <div>
                        <p className='font-semibold mb-2'>Boba</p>
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                            <div>
                                <p className='text-sm font-medium mb-1'>
                                    Drinks
                                </p>
                                {DRINK_OPTIONS.map((drink) => (
                                    <Button
                                        key={drink}
                                        variant={
                                            selection.drink === drink
                                                ? 'default'
                                                : 'outline'
                                        }
                                        className='w-full mb-1'
                                        onClick={() => onSelectDrink(drink)}
                                    >
                                        {drink}
                                    </Button>
                                ))}
                            </div>
                            <div>
                                <p className='text-sm font-medium mb-1'>
                                    Boba
                                </p>
                                {BOBA_OPTIONS.map((boba) => (
                                    <Button
                                        key={boba}
                                        variant={
                                            selection.boba === boba
                                                ? 'default'
                                                : 'outline'
                                        }
                                        className='w-full mb-1'
                                        onClick={() => onSelectBoba(boba)}
                                    >
                                        {boba}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <Button onClick={onAddBoba} className='w-full mt-3'>
                            Add Boba
                        </Button>
                    </div>

                    <div>
                        <p className='font-semibold mb-2'>Corndog</p>
                        <div className='grid grid-cols-1 gap-2'>
                            {CORNDOG_OPTIONS.map((corndog) => (
                                <Button
                                    key={corndog}
                                    variant={
                                        selection.corndog === corndog
                                            ? 'default'
                                            : 'outline'
                                    }
                                    className='w-full'
                                    onClick={() => onSelectCorndog(corndog)}
                                >
                                    {corndog}
                                </Button>
                            ))}
                        </div>
                        <Button
                            onClick={onAddCorndog}
                            className='w-full mt-3'
                        >
                            Add Corndog
                        </Button>
                    </div>
                </div>

                <div className='sticky bottom-0 bg-white pt-4 border-t border rounded-t-md mt-auto'>
                    <h2 className='text-xl font-bold mb-4'>Summary</h2>
                    {orders.map((item, index) => (
                        <div
                            key={`${item.type}-${item.name}`}
                            className='flex justify-between items-center mb-2'
                        >
                            <span>
                                {item.name} - ${item.price.toFixed(2)} x{' '}
                                {item.quantity}
                            </span>
                            <div className='flex items-center gap-2'>
                                <Button
                                    size='sm'
                                    onClick={() => onQuantityChange(index, -1)}
                                >
                                    -
                                </Button>
                                <Button
                                    size='sm'
                                    onClick={() => onQuantityChange(index, 1)}
                                >
                                    +
                                </Button>
                                <Button
                                    variant='destructive'
                                    size='sm'
                                    onClick={() =>
                                        onQuantityChange(index, -item.quantity)
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
                    <Button onClick={onSendOrder} className='mt-4 w-full'>
                        Send Order
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
