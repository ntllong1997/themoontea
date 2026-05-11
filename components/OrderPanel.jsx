import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export const TAX_RATE = 0.0825;
export const PRICES = {
    Boba: 8.0,
    Corndog: 8.0,
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

const CORNDOG_INSIDE = ['Cheese', 'Half-Half'];
const CORNDOG_OUTSIDE = ['Potato', 'Hot Cheeto', 'Original'];

export default function OrderPanel({
    selection,
    onSelectDrink,
    onSelectBoba,
    onSelectCorndogInside,
    onSelectCorndogOutside,
    onToggleCorndogDust,
    onAddBoba,
    onAddCorndog,
}) {
    return (
        <Card>
            <CardContent>
                <h2 className='text-xl font-bold mb-4'>Order Panel</h2>

                <div className='flex flex-col gap-6'>
                    {/* ── Corndog ── */}
                    <div>
                        <p className='font-semibold mb-3 text-blue-700 border-b pb-1'>
                            Corndog — $8.00
                        </p>

                        <p className='text-xs font-medium uppercase tracking-wide text-gray-500 mb-2'>
                            Inside
                        </p>
                        <div className='flex gap-2 mb-3'>
                            {CORNDOG_INSIDE.map((opt) => (
                                <Button
                                    key={opt}
                                    variant={selection.corndogInside === opt ? 'default' : 'outline'}
                                    className='flex-1 text-sm'
                                    onClick={() => onSelectCorndogInside(opt)}
                                >
                                    {opt}
                                </Button>
                            ))}
                        </div>

                        <p className='text-xs font-medium uppercase tracking-wide text-gray-500 mb-2'>
                            Outside
                        </p>
                        <div className='flex gap-2 mb-3'>
                            {CORNDOG_OUTSIDE.map((opt) => (
                                <Button
                                    key={opt}
                                    variant={selection.corndogOutside === opt ? 'default' : 'outline'}
                                    className='flex-1 text-sm'
                                    onClick={() => onSelectCorndogOutside(opt)}
                                >
                                    {opt}
                                </Button>
                            ))}
                        </div>

                        {selection.corndogOutside === 'Potato' && (
                            <label className='flex items-center gap-2 mb-3 cursor-pointer select-none'>
                                <input
                                    type='checkbox'
                                    checked={selection.corndogDust}
                                    onChange={onToggleCorndogDust}
                                    className='w-4 h-4 accent-red-500'
                                />
                                <span className='text-sm text-red-600 font-medium'>
                                    + Hot Cheeto Dust
                                </span>
                            </label>
                        )}

                        <Button
                            onClick={onAddCorndog}
                            className='w-full'
                            disabled={!selection.corndogInside || !selection.corndogOutside}
                        >
                            + Add Corndog
                        </Button>
                    </div>

                    {/* ── Boba ── */}
                    <div>
                        <p className='font-semibold mb-3 text-blue-700 border-b pb-1'>
                            Boba — $8.00
                        </p>
                        <div className='grid grid-cols-2 gap-2 mb-3'>
                            <div>
                                <p className='text-xs font-medium uppercase tracking-wide text-gray-500 mb-2'>
                                    Drink
                                </p>
                                {DRINK_OPTIONS.map((drink) => (
                                    <Button
                                        key={drink}
                                        variant={selection.drink === drink ? 'default' : 'outline'}
                                        className='w-full mb-1 text-xs sm:text-sm leading-tight'
                                        onClick={() => onSelectDrink(drink)}
                                    >
                                        {drink}
                                    </Button>
                                ))}
                            </div>
                            <div>
                                <p className='text-xs font-medium uppercase tracking-wide text-gray-500 mb-2'>
                                    Boba
                                </p>
                                {BOBA_OPTIONS.map((boba) => (
                                    <Button
                                        key={boba}
                                        variant={selection.boba === boba ? 'default' : 'outline'}
                                        className='w-full mb-1 text-xs sm:text-sm leading-tight'
                                        onClick={() => onSelectBoba(boba)}
                                    >
                                        {boba}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <Button
                            onClick={onAddBoba}
                            className='w-full'
                            disabled={!selection.drink || !selection.boba}
                        >
                            + Add Boba
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
