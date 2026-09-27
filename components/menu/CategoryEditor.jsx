'use client';

// One menu item in the /menu editor: name, price, shown/hidden, order, and its
// choice groups. Every change is an immutable updater passed to `onEdit`.
import {
    addGroup,
    addOption,
    moveCategory,
    removeCategory,
    removeGroup,
    removeOption,
    updateCategory,
    updateGroup,
    updateOption,
} from '@/lib/menu/menuDraft';

const inputClass = 'rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-black';
const smallButton = 'rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40';

/** An empty field stays empty (and fails validation) rather than becoming $0. */
const toPrice = (text) => (text.trim() === '' ? Number.NaN : Number(text));
const showPrice = (price) => (Number.isFinite(price) ? price : '');

function PriceInput({ value, onChange, label }) {
    return (
        <label className='flex items-center gap-1 text-sm text-gray-600'>
            <span aria-hidden='true'>$</span>
            <input
                type='number'
                min='0'
                step='0.01'
                inputMode='decimal'
                aria-label={label}
                value={showPrice(value)}
                onChange={(e) => onChange(toPrice(e.target.value))}
                className={`${inputClass} w-24`}
            />
        </label>
    );
}

function OptionGroupEditor({ group, categoryIndex, groupIndex, onEdit }) {
    const edit = (patch) => onEdit((d) => updateGroup(d, categoryIndex, groupIndex, patch));

    return (
        <div className='rounded-lg border border-gray-200 bg-gray-50 p-3'>
            <div className='mb-2 flex flex-wrap items-center gap-2'>
                <input
                    aria-label='Choice group name'
                    placeholder='Choice name, e.g. Flavor'
                    value={group.label}
                    onChange={(e) => edit({ label: e.target.value })}
                    className={`${inputClass} flex-1 min-w-40`}
                />
                <select
                    aria-label='How this choice prints'
                    value={group.role}
                    onChange={(e) => edit({ role: e.target.value })}
                    className={inputClass}
                >
                    <option value='name'>Part of the item name</option>
                    <option value='modifier'>Extra, in brackets</option>
                </select>
                <button
                    type='button'
                    onClick={() => onEdit((d) => removeGroup(d, categoryIndex, groupIndex))}
                    className={`${smallButton} text-red-600`}
                >
                    Remove choice
                </button>
            </div>

            <ul className='flex flex-col gap-2'>
                {group.options.map((option, optionIndex) => (
                    <li key={optionIndex} className='flex flex-wrap items-center gap-2'>
                        <input
                            aria-label='Option name'
                            placeholder='Option, e.g. Ube'
                            value={option.value}
                            onChange={(e) => onEdit((d) =>
                                updateOption(d, categoryIndex, groupIndex, optionIndex, { value: e.target.value }))}
                            className={`${inputClass} flex-1 min-w-32`}
                        />
                        <PriceInput
                            label={`Extra price for ${option.value || 'option'}`}
                            value={option.price}
                            onChange={(price) => onEdit((d) =>
                                updateOption(d, categoryIndex, groupIndex, optionIndex, { price }))}
                        />
                        <button
                            type='button'
                            aria-label={`Remove ${option.value || 'option'}`}
                            onClick={() => onEdit((d) => removeOption(d, categoryIndex, groupIndex, optionIndex))}
                            className={smallButton}
                        >
                            ✕
                        </button>
                    </li>
                ))}
            </ul>
            <button
                type='button'
                onClick={() => onEdit((d) => addOption(d, categoryIndex, groupIndex))}
                className={`${smallButton} mt-2`}
            >
                + Option
            </button>
        </div>
    );
}

export default function CategoryEditor({ category, index, count, isNew, onEdit }) {
    const edit = (patch) => onEdit((d) => updateCategory(d, index, patch));

    return (
        <section
            aria-label={category.label || 'New item'}
            className={`rounded-xl border p-4 ${category.visible ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'}`}
        >
            <div className='flex flex-wrap items-center gap-2'>
                <input
                    aria-label='Item name'
                    value={category.label}
                    onChange={(e) => edit({ label: e.target.value })}
                    className={`${inputClass} flex-1 min-w-40 text-base font-semibold`}
                />
                <PriceInput label={`Price of ${category.label}`} value={category.price} onChange={(price) => edit({ price })} />
                <label className='flex items-center gap-1.5 text-sm text-gray-700'>
                    <input
                        type='checkbox'
                        checked={category.visible}
                        onChange={(e) => edit({ visible: e.target.checked })}
                    />
                    On menu
                </label>
                <button type='button' aria-label='Move up' disabled={index === 0}
                    onClick={() => onEdit((d) => moveCategory(d, index, -1))} className={smallButton}>↑</button>
                <button type='button' aria-label='Move down' disabled={index === count - 1}
                    onClick={() => onEdit((d) => moveCategory(d, index, 1))} className={smallButton}>↓</button>
                {/* Saved items can only be hidden: deleting one would leave its
                    past orders without a name in history and the summary. */}
                {isNew && (
                    <button type='button' onClick={() => onEdit((d) => removeCategory(d, index))}
                        className={`${smallButton} text-red-600`}>
                        Delete
                    </button>
                )}
            </div>

            <p className='mt-1 text-xs text-gray-500'>
                {category.optionGroups.length === 0
                    ? 'No choices — tapping it adds it straight to the cart.'
                    : 'Option prices are added on top of the item price.'}
                {!category.visible && ' Hidden: not orderable, but old orders still show.'}
            </p>

            <div className='mt-3 flex flex-col gap-3'>
                {category.optionGroups.map((group, groupIndex) => (
                    <OptionGroupEditor
                        key={group.key}
                        group={group}
                        categoryIndex={index}
                        groupIndex={groupIndex}
                        onEdit={onEdit}
                    />
                ))}
            </div>
            <button type='button' onClick={() => onEdit((d) => addGroup(d, index))} className={`${smallButton} mt-3`}>
                + Choice
            </button>
        </section>
    );
}
