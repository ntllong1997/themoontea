import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export const TAX_RATE = 0.0825;
export const PRICES = {
    Boba: 8.0,
    Corndog: 8.0,
};
export const HOT_CHEETO_DUST_PRICE = 1.0;

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

// Drinks that have an optional customization
export const DRINK_CUSTOMIZATIONS = {
    'Matcha Strawberry': 'Only Matcha',
    'Golden Taro':       'Only Taro',
};

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

// Corndogs eligible for Hot Cheeto Dust add-on
export const POTATO_CORNDOGS = ['Cheese Potato', 'Half-Half Potato'];

export default function OrderPanel({
    selection,
    onSelectDrink,
    onSelectBoba,
    onSelectCorndog,
    onAddBoba,
    onAddCorndog,
    drinkCustomization,
    onToggleDrinkCustomization,
    corndogDust,
    onToggleCorndogDust,
}) {
    const customizationLabel = DRINK_CUSTOMIZATIONS[selection.drink];
    const isPotato = POTATO_CORNDOGS.includes(selection.corndog);

    return (
        <Card>
            <CardContent>
                <h2 className='text-xl font-bold mb-4'>Order Panel</h2>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
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

                        {/* Drink customization toggle */}
                        {customizationLabel && (
                            <div className='mb-3'>
                                <p className='text-xs font-medium uppercase tracking-wide text-gray-500 mb-1'>
                                    Customization
                                </p>
                                <Button
                                    variant={drinkCustomization ? 'default' : 'outline'}
                                    className='w-full text-xs sm:text-sm'
                                    onClick={onToggleDrinkCustomization}
                                >
                                    {drinkCustomization ? `✓ ${customizationLabel}` : customizationLabel}
                                </Button>
                            </div>
                        )}

                        <Button
                            onClick={onAddBoba}
                            className='w-full'
                            disabled={!selection.drink || !selection.boba}
                        >
                            + Add Boba
                        </Button>
                    </div>

                    {/* ── Corndog ── */}
                    <div>
                        <p className='font-semibold mb-3 text-blue-700 border-b pb-1'>
                            Corndog — $8.00
                        </p>
                        <div className='grid grid-cols-2 gap-2 mb-3'>
                            {CORNDOG_OPTIONS.map((corndog) => (
                                <Button
                                    key={corndog}
                                    variant={selection.corndog === corndog ? 'default' : 'outline'}
                                    className='w-full text-xs sm:text-sm leading-tight'
                                    onClick={() => onSelectCorndog(corndog)}
                                >
                                    {corndog}
                                </Button>
                            ))}
                        </div>

                        {/* Hot Cheeto Dust add-on for potato corndogs */}
                        {isPotato && (
                            <div className='mb-3'>
                                <p className='text-xs font-medium uppercase tracking-wide text-gray-500 mb-1'>
                                    Add-on
                                </p>
                                <Button
                                    variant={corndogDust ? 'default' : 'outline'}
                                    className='w-full text-xs sm:text-sm'
                                    onClick={onToggleCorndogDust}
                                >
                                    {corndogDust ? '✓ Hot Cheeto Dust +$1.00' : 'Hot Cheeto Dust +$1.00'}
                                </Button>
                            </div>
                        )}

                        <Button
                            onClick={onAddCorndog}
                            className='w-full'
                            disabled={!selection.corndog}
                        >
                            + Add Corndog{corndogDust && isPotato ? ' ($9.00)' : ' ($8.00)'}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
