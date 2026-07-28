// Renders the whole order panel from lib/menu/catalog.js. There is no
// per-category markup here — a new category appears automatically once it is
// added to CATEGORIES.

import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    activeAddOns,
    isSelectionComplete,
    optionPrice,
    optionValue,
    priceLabelFor,
} from '@/lib/menu/catalog';

export default function OrderPanel({
    categories,
    selections,
    onSelectOption,
    onToggleAddOn,
    onAdd,
}) {
    return (
        <Card>
            <CardContent>
                <h2 className='text-xl font-bold mb-4'>Order Panel</h2>

                <div className='flex flex-col gap-6'>
                    {categories.map((category) => (
                        <CategorySection
                            key={category.key}
                            category={category}
                            selection={selections[category.key]}
                            onSelectOption={onSelectOption}
                            onToggleAddOn={onToggleAddOn}
                            onAdd={onAdd}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * One category's builder. `layout: 'columns'` puts the option groups side by
 * side with their choices stacked (long drink lists); anything else lays each
 * group out as a row of choices (short corndog lists).
 */
function CategorySection({ category, selection, onSelectOption, onToggleAddOn, onAdd }) {
    const isColumns = category.layout === 'columns';
    // Only add-ons whose condition currently holds are offered — and the same
    // check gates their price, so what is shown is exactly what is charged.
    const addOns = activeAddOns(category, selection);

    return (
        <div>
            <p className='font-semibold mb-3 text-blue-700 border-b pb-1'>
                {category.label} — {priceLabelFor(category)}
            </p>

            <div className={isColumns ? 'grid grid-cols-2 gap-2 mb-3' : ''}>
                {category.optionGroups.map((group) => (
                    <div key={group.key} className={isColumns ? '' : 'mb-3'}>
                        <p className='text-xs font-medium uppercase tracking-wide text-gray-500 mb-2'>
                            {group.label}
                        </p>
                        <div className={isColumns ? '' : 'flex gap-2'}>
                            {group.options.map((option) => {
                                const value = optionValue(option);
                                const price = optionPrice(option);
                                return (
                                    <Button
                                        key={value}
                                        variant={selection[group.key] === value ? 'default' : 'outline'}
                                        className={
                                            isColumns
                                                ? 'w-full mb-1 text-xs sm:text-sm leading-tight'
                                                : 'flex-1 text-sm'
                                        }
                                        onClick={() => onSelectOption(category.key, group.key, value)}
                                    >
                                        {/* Sides price the option, not the category, so the
                                            cost has to be visible on the button itself. */}
                                        {price > 0 ? `${value} $${price.toFixed(2)}` : value}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {addOns.length > 0 && (
                <div className='mb-3'>
                    <p className='text-xs font-medium uppercase tracking-wide text-gray-500 mb-2'>
                        Extras
                    </p>
                    {addOns.map((addOn) => {
                        const isChecked = selection.addOns[addOn.key];
                        const priceSuffix = addOn.price > 0 ? ` +$${addOn.price.toFixed(2)}` : '';
                        return (
                            <Button
                                key={addOn.key}
                                variant={isChecked ? 'default' : 'outline'}
                                className='w-full mb-1 text-xs sm:text-sm'
                                onClick={() => onToggleAddOn(category.key, addOn.key)}
                            >
                                {isChecked ? `✓ ${addOn.resolvedLabel}` : addOn.resolvedLabel}
                                {priceSuffix}
                            </Button>
                        );
                    })}
                </div>
            )}

            <Button
                onClick={() => onAdd(category.key)}
                className='w-full'
                disabled={!isSelectionComplete(category, selection)}
            >
                + Add {category.label}
            </Button>
        </div>
    );
}
