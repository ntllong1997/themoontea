import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export const TAX_RATE = 0.0825;
export const PRICES = {
    Boba: 8.0,
    Corndog: 9.0,
};

const DRINK_OPTIONS = [
    'Brown Sugar',
    'Korean Strawberry',
    'Double Cheese',
    'Tiramisu',
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
    category,
    onCategoryChange,
    selection,
    onSelectDrink,
    onSelectBoba,
    onSelectCorndog,
    onAddItem,
    orders,
    subtotal,
    tax,
    total,
    onQuantityChange,
    onSendOrder,
}) {
    return (
        <Card className='col-span-2'>
            <CardContent>
                <h2 className='text-xl font-bold mb-4'>Order Panel</h2>

                <div className='mb-2'>
                    <Button
                        variant={category === 'Boba' ? 'default' : 'outline'}
                        onClick={() => onCategoryChange('Boba')}
                    >
                        Boba
                    </Button>
                    <Button
                        variant={category === 'Corndog' ? 'default' : 'outline'}
                        onClick={() => onCategoryChange('Corndog')}
                        className='ml-2'
                    >
                        Corndog
                    </Button>
                </div>

                {category === 'Boba' && (
                    <div className='grid grid-cols-2 gap-2 mb-4'>
                        <div>
                            <p className='font-semibold'>Drinks</p>
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
                            <p className='font-semibold'>Boba</p>
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
                )}

                {category === 'Corndog' && (
                    <div className='grid grid-cols-1 gap-2 mb-4'>
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
                )}

                <Button onClick={onAddItem} className='w-full mb-6'>
                    Add to Order
                </Button>

                <h2 className='text-xl font-bold mb-4'>Summary</h2>
                {orders.map((item, index) => (
                    <div
                        key={index}
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
            </CardContent>
        </Card>
    );
}
