'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    getInventoryGroups, saveInventoryGroups,
    getParLevels, saveParLevel,
    getInventorySubmissions, saveInventorySubmission,
    deleteInventorySubmission, clearInventorySubmissions,
} from '@/lib/inventoryDb';

// ─── Default data ────────────────────────────────────────────────────────────

const DEFAULT_ITEMS = [
    {
        category: 'Cleaning Supplies',
        items: [
            'Poly Bags', 'T-shirt Bags', 'Gloves (LG / MD)', 'Degreaser 1 Gal',
            'Dish Soap', 'Scrub Daddy', '33-Gallon Trash Bag',
            '13-Gallon Kitchen Trash Bag', 'Lysol Disinfecting Wipes', 'Hand Soap',
        ],
    },
    {
        category: 'Dairy & Creamers',
        items: [
            'Whole Milk', 'Eggs', 'Sweetened Condensed Milk 14oz',
            'Milk Evaporated 12oz', 'Heavy Cream (if purchased)',
            'Sweetened Condensed Milk', 'Almond Milk', 'Oat Milk',
        ],
    },
    {
        category: 'Drinks',
        items: ['Drinking Water', 'Coke', 'Diet Coke', 'Spirte', 'Sugar Free Dr Pepper'],
    },
    {
        category: 'Dry Ingredients',
        items: [
            'All purpose flour', 'KIKO Bread Crumbs', 'Yeast Instant Dry',
            'Cornstarch 3 lbs', 'Sugar Gran Nat 50#', 'Kosher Salt', 'Tajin',
            'Samyang Buldak Ramen Carbonara', 'Organic Brown Sugar',
        ],
    },
    {
        category: 'Fruits & Produce',
        items: [
            'Bananas', 'Strawberries', 'Pineapple', 'Lemons', 'Limes', 'Oranges',
            'Apples', 'Cantaloupe', 'Onions', 'Corn', 'Mango Chunk (IQF)',
            'Mango Dice (IQF)', 'Lemons 3 lb', 'Limes 3 lb', 'Garlic (bulk bag)',
            'Organic Coconut Water', 'Seedless Watermelon', 'Sliced Peaches',
            'Pure Vanilla Extract',
            'Lotus Biscoff Creamy Cookie Butter Spread Pail 6.6 lb.',
            'Lotus Biscoff Cookies 8.8 oz. - 10/Case',
        ],
    },
    {
        category: 'Meat & Cheese',
        items: [
            'Cotija cheese', 'Chicken breast (bulk)', 'Mascarpone 1 lb',
            'Mozzarella Bulk (~49lb)', 'Nacho Cheese Sauce', 'KS HOT DOGS',
            'Laughing Cow Light Wedges', 'Kraft Grated Parmesan Cheese',
        ],
    },
    {
        category: 'Packaging',
        items: [
            'Cup', 'PP Sealing Film – Good Time Printed', 'Gallon Plus Freezer Bags',
            '6 1/2" x 2 1/2" x 2 1/4" White Paper Hot Dog Clamshell Container - 500/Case',
            "Lavex 2-Ply White Center Pull Paper Towel 500' Roll - 6/Case",
            'Choice Clear PET Customizable Plastic Cold Cup - 24 oz. - 600/Case',
            'Choice 9 oz. 12 oz. 16 oz. 20 oz. 24 oz. Clear PET Dome Lid with 2" Hole - 1 000/Case',
            'Choice Black Plastic Souffle Cup / Portion Cup - 2 oz. - 2 500/Case',
            'Choice PET Plastic Lid for 1.5 to 2.5 oz. Souffle Cup / Portion Cup - 2 500/Case',
            'Fast Take Tamper-Evident Clear HDPE 2 Drink Beverage Carrier - 1 000/Case',
            'Choice 12" x 12" Natural Kraft Customizable Basket Liner / Deli Wrap - 5 000/Case',
            'Carnival King #200 2 lb. Cornerstone Paper Food Tray - 1 000/Case',
            'Choice Kraft Microwavable Folded Paper #8 Take-Out Customizable Container 6" x 4 3/4" x 2 1/2" - 300/Case',
            'Dixie Ultra White 2-Ply Interfold Paper Dispenser Napkin - 6 000/Case',
            '[1,600 ct] Boba Straws | Diagonal Cut | Individually Wrapped | Black (0.39" x 9")',
            '[1,000 ct] Plastic Dome Cup Lids | PET | 90 mm',
        ],
    },
    {
        category: 'Sauces & Condiments',
        items: [
            'Garlic Powder 5#', 'Onion Powder 5#', 'OIL CLEAR SOY', 'Honey Hot Sauce',
            'Sriracha', 'Heinz Ketchup (3/44oz)', "Hellmann's Mayo (1 gal)",
            'Nutella Tub 6.6#', 'Hershey Syrup (Jug)', 'Chamoy', 'Pink Salt',
        ],
    },
    {
        category: 'Snacks & Desserts',
        items: [
            'French Fry 3/8 Big C', 'Onion Ring', 'Oreo 2.5#', 'OREO',
            'Jif Creamy Peanut Butter', 'Shin Black', 'Shin Ramyun Noodles',
        ],
    },
    {
        category: 'Syrups',
        items: [
            'Strawberry Syrup', 'Mango Syrup', 'Rose Syrup', 'Passionfruit Syrup',
            'Peach Syrup', 'Lychee Syrup', 'Honeydew Syrup', 'Pineapple Syrup',
            'Lemon Syrup', 'Red Guava Syrup', 'Grape Syrup', 'Kumquat Syrup',
            'Kiwi Syrup', 'Banana Syrup', 'Strawberry Jam', 'Mango Jam',
            'Passion Fruit Jam', 'Torani Vanilla', 'Dark Brown Sugar',
            'Strawberry Syrup, 64oz', 'Tropical Syrup, 64oz',
        ],
    },
    {
        category: 'Tea & Powders',
        items: [
            'Thai Green Tea (Thumb up brand)', 'Premium Thai Tea Mix (Cha Tra Mue)',
            'Jade Leaf Culinary Matcha Powder 1 lb. (454g) - 6/Case',
            'Taro Powder | Made in USA | 2.2 lbs', 'Non-Dairy Creamer', 'Black Tea',
            'Jasmine Green Tea', 'Milk Tea', 'Honeydew', 'Coconut', 'Egg Pudding',
        ],
    },
    {
        category: 'Toppings (Boba / Jelly)',
        items: [
            'Rainbow Jelly – BT', 'Lychee Jelly', 'Coconut Jelly', 'Coffee Jelly',
            'Brown Sugar Agar Jelly', 'Crystal Boba', 'Strawberry', 'Mango',
            'Blueberry', 'Lychee', 'Kiwi', 'Peach', 'Tapioca Pearls (Chewy)',
        ],
    },
];

// ─── Constants ───────────────────────────────────────────────────────────────

const WEBHOOK_URL = process.env.NEXT_PUBLIC_INVENTORY_WEBHOOK_URL || '';
const DRAFT_KEY   = 'inventory_draft';

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildFlat(groups) {
    return groups.flatMap((g) => g.items.map((item) => ({ category: g.category, name: item })));
}

function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const rows  = lines.map((line) => {
        const cols = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { inQ = !inQ; }
            else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
            else { cur += c; }
        }
        cols.push(cur.trim());
        return cols;
    });

    if (rows.length === 0) return [];

    // Detect header
    const first = rows[0].map((c) => c.toLowerCase());
    const hasCategoryCol = first.includes('category') || first.includes('cat');
    const hasItemCol     = first.includes('item') || first.includes('name');
    const dataRows       = (hasCategoryCol || hasItemCol) ? rows.slice(1) : rows;

    let catIdx  = hasCategoryCol ? first.findIndex((c) => c === 'category' || c === 'cat') : -1;
    let itemIdx = hasItemCol     ? first.findIndex((c) => c === 'item' || c === 'name')    : -1;

    // Fallback: single column → items only; two columns → category,item
    if (catIdx === -1 && itemIdx === -1) {
        catIdx  = dataRows[0]?.length >= 2 ? 0 : -1;
        itemIdx = dataRows[0]?.length >= 2 ? 1 : 0;
    }

    const grouped = {};
    for (const row of dataRows) {
        const item = row[itemIdx]?.trim();
        if (!item) continue;
        const cat = catIdx >= 0 ? (row[catIdx]?.trim() || 'Imported') : 'Imported';
        if (!grouped[cat]) grouped[cat] = [];
        if (!grouped[cat].includes(item)) grouped[cat].push(item);
    }

    return Object.entries(grouped).map(([category, items]) => ({ category, items }));
}

function exportCSV(groups, counts, statuses, employeeName) {
    const rows = [['Category', 'Item', 'Amount', 'Status']];
    groups.forEach((group) => {
        group.items.forEach((item) => {
            rows.push([group.category, item, counts[item] ?? 0, statuses[item] ?? 'ok']);
        });
    });
    const csv  = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `inventory_${(employeeName || 'export').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportTemplateCSV(groups) {
    const rows = [['Category', 'Item']];
    groups.forEach((g) => g.items.forEach((i) => rows.push([g.category, i])));
    const csv  = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'inventory_template.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function exportShoppingList(shoppingItems, counts, pars, statuses) {
    const rows = [['Category', 'Item', 'Have', 'Need (Par)', 'Short', 'Status']];
    shoppingItems.forEach((i) => {
        const have  = counts[i.name] ?? 0;
        const need  = pars[i.name]  ?? '';
        const short = need !== '' ? Math.max(0, need - have) : '';
        rows.push([i.category, i.name, have, need, short, statuses[i.name] ?? 'ok']);
    });
    const csv  = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `shopping_list_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function copyShoppingListText(shoppingItems, counts, pars, statuses) {
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const lines = [`SHOPPING LIST — ${date}`, ''];
    const cats  = [...new Set(shoppingItems.map((i) => i.category))];
    cats.forEach((cat) => {
        lines.push(cat);
        shoppingItems
            .filter((i) => i.category === cat)
            .forEach((i) => {
                const have   = counts[i.name] ?? 0;
                const par    = pars[i.name];
                const status = statuses[i.name] ?? 'ok';
                const detail = par ? `  — have ${have}, need ${par}` : '';
                const flag   = status !== 'ok' ? ` [${status.toUpperCase()}]` : '';
                lines.push(`  • ${i.name}${flag}${detail}`);
            });
        lines.push('');
    });
    navigator.clipboard.writeText(lines.join('\n'));
}

function formatDate(iso) {
    return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
}

// ─── StatusPill ──────────────────────────────────────────────────────────────

function StatusPill({ value, onChange }) {
    const options = [
        { key: 'ok',  label: 'OK',  bg: 'bg-green-100 text-green-700'  },
        { key: 'low', label: 'Low', bg: 'bg-yellow-100 text-yellow-700' },
        { key: 'out', label: 'Out', bg: 'bg-red-100 text-red-700'       },
    ];
    return (
        <div className='mt-1 flex gap-1'>
            {options.map((o) => (
                <button
                    key={o.key}
                    type='button'
                    onClick={() => onChange(o.key)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition-opacity ${o.bg} ${value === o.key ? 'opacity-100 ring-1 ring-current' : 'opacity-40'}`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

// ─── HistoryEntry ────────────────────────────────────────────────────────────

function HistoryEntry({ entry, onDelete }) {
    const [open, setOpen] = useState(false);
    const flagged = entry.items.filter((i) => i.status !== 'ok');
    const filled  = entry.items.filter((i) => i.amount > 0);

    // Group unique categories from this entry
    const categories = [...new Set(entry.items.map((i) => i.category))];

    return (
        <div className='rounded-lg border border-gray-200 bg-white'>
            <div
                className='flex cursor-pointer items-center justify-between px-4 py-3'
                onClick={() => setOpen((p) => !p)}
            >
                <div>
                    <p className='font-medium'>{entry.employeeName || 'Unknown'}</p>
                    <p className='text-xs text-gray-500'>{formatDate(entry.submittedAt)}</p>
                </div>
                <div className='flex items-center gap-2 text-xs'>
                    <span className='rounded-full bg-gray-100 px-2 py-0.5 text-gray-600'>{filled.length} filled</span>
                    {flagged.length > 0 && (
                        <span className='rounded-full bg-red-100 px-2 py-0.5 text-red-600'>{flagged.length} flagged</span>
                    )}
                    <span className='text-gray-400'>{open ? '▾' : '▸'}</span>
                </div>
            </div>

            {open && (
                <div className='border-t border-gray-100 px-4 py-3'>
                    {entry.notes && (
                        <p className='mb-3 text-sm text-gray-600'>
                            <span className='font-medium'>Notes:</span> {entry.notes}
                        </p>
                    )}
                    {flagged.length > 0 && (
                        <div className='mb-3'>
                            <p className='mb-1 text-xs font-semibold uppercase tracking-wide text-red-600'>Flagged</p>
                            <div className='grid gap-1 sm:grid-cols-2 md:grid-cols-3'>
                                {flagged.map((i) => (
                                    <div key={i.name} className='flex items-center justify-between rounded bg-red-50 px-2 py-1 text-sm'>
                                        <span className='truncate'>{i.name}</span>
                                        <span className={`ml-2 shrink-0 rounded px-1.5 text-xs font-medium ${i.status === 'low' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                            {i.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {categories.map((cat) => {
                        const catItems = entry.items.filter((i) => i.category === cat && (i.amount > 0 || i.status !== 'ok'));
                        if (!catItems.length) return null;
                        return (
                            <div key={cat} className='mb-2'>
                                <p className='mb-1 text-xs font-semibold text-gray-500'>{cat}</p>
                                <div className='grid gap-1 sm:grid-cols-2 md:grid-cols-3'>
                                    {catItems.map((i) => (
                                        <div key={i.name} className='flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-sm'>
                                            <span className='truncate'>{i.name}</span>
                                            <span className='ml-2 shrink-0 text-gray-500'>{i.amount ?? 0}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    <button type='button' onClick={() => onDelete(entry._id, entry.submittedAt)} className='mt-3 text-xs text-red-400 hover:text-red-600'>
                        Delete this entry
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── SummaryModal ────────────────────────────────────────────────────────────

function SummaryModal({ flatItems, counts, statuses, employeeName, notes, onConfirm, onCancel, submitting }) {
    const filled  = flatItems.filter((i) => counts[i.name] > 0);
    const flagged = flatItems.filter((i) => statuses[i.name] !== 'ok');
    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
            <div className='w-full max-w-lg rounded-xl bg-white shadow-xl'>
                <div className='border-b border-gray-100 px-6 py-4'>
                    <h2 className='text-lg font-bold'>Review & Submit</h2>
                    <p className='text-sm text-gray-500'>{employeeName} · {new Date().toLocaleDateString()}</p>
                </div>
                <div className='max-h-80 overflow-y-auto space-y-4 px-6 py-4'>
                    {notes && <p className='text-sm text-gray-600'><span className='font-medium'>Notes:</span> {notes}</p>}
                    <div>
                        <p className='mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500'>Summary</p>
                        <div className='grid grid-cols-3 gap-2 text-center text-sm'>
                            <div className='rounded-lg bg-gray-50 p-2'>
                                <p className='text-xl font-bold'>{filled.length}</p>
                                <p className='text-gray-500'>items filled</p>
                            </div>
                            <div className='rounded-lg bg-yellow-50 p-2'>
                                <p className='text-xl font-bold text-yellow-700'>{flagged.filter((i) => statuses[i.name] === 'low').length}</p>
                                <p className='text-yellow-600'>low stock</p>
                            </div>
                            <div className='rounded-lg bg-red-50 p-2'>
                                <p className='text-xl font-bold text-red-700'>{flagged.filter((i) => statuses[i.name] === 'out').length}</p>
                                <p className='text-red-600'>out of stock</p>
                            </div>
                        </div>
                    </div>
                    {flagged.length > 0 && (
                        <div>
                            <p className='mb-1 text-xs font-semibold uppercase tracking-wide text-red-500'>Flagged Items</p>
                            <div className='space-y-1'>
                                {flagged.map((i) => (
                                    <div key={i.name} className='flex items-center justify-between text-sm'>
                                        <span className='text-gray-700'>{i.name}</span>
                                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${statuses[i.name] === 'low' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                            {statuses[i.name]}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className='flex justify-end gap-2 border-t border-gray-100 px-6 py-4'>
                    <button type='button' onClick={onCancel} disabled={submitting} className='rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50'>Back</button>
                    <button type='button' onClick={onConfirm} disabled={submitting} className='rounded-lg bg-black px-5 py-2 text-sm text-white disabled:opacity-50'>
                        {submitting ? 'Submitting…' : 'Confirm & Submit'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── CSVImportModal ──────────────────────────────────────────────────────────

function CSVImportModal({ parsed, onConfirm, onCancel }) {
    const [mode, setMode] = useState('merge'); // 'merge' | 'replace'
    const totalItems = parsed.reduce((s, g) => s + g.items.length, 0);
    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
            <div className='w-full max-w-lg rounded-xl bg-white shadow-xl'>
                <div className='border-b border-gray-100 px-6 py-4'>
                    <h2 className='text-lg font-bold'>Import CSV</h2>
                    <p className='text-sm text-gray-500'>{parsed.length} categories · {totalItems} items found</p>
                </div>
                <div className='max-h-72 overflow-y-auto px-6 py-4'>
                    <div className='space-y-2'>
                        {parsed.map((g) => (
                            <div key={g.category}>
                                <p className='text-xs font-semibold text-gray-500'>{g.category} ({g.items.length})</p>
                                <p className='truncate text-sm text-gray-700'>{g.items.slice(0, 4).join(', ')}{g.items.length > 4 ? ` +${g.items.length - 4} more` : ''}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className='border-t border-gray-100 px-6 py-3'>
                    <p className='mb-2 text-xs font-medium text-gray-600'>Import mode</p>
                    <div className='flex gap-3'>
                        {[
                            { key: 'merge',   label: 'Merge',   desc: 'Add new items, keep existing' },
                            { key: 'replace', label: 'Replace', desc: 'Remove all current items first' },
                        ].map((m) => (
                            <label key={m.key} className={`flex flex-1 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${mode === m.key ? 'border-black bg-gray-50' : 'border-gray-200'}`}>
                                <input type='radio' name='import-mode' value={m.key} checked={mode === m.key} onChange={() => setMode(m.key)} className='mt-0.5' />
                                <div>
                                    <p className='font-medium'>{m.label}</p>
                                    <p className='text-xs text-gray-500'>{m.desc}</p>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
                <div className='flex justify-end gap-2 border-t border-gray-100 px-6 py-4'>
                    <button type='button' onClick={onCancel} className='rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50'>Cancel</button>
                    <button type='button' onClick={() => onConfirm(mode)} className='rounded-lg bg-black px-5 py-2 text-sm text-white'>Import</button>
                </div>
            </div>
        </div>
    );
}

// ─── ManageTab ───────────────────────────────────────────────────────────────

function ManageTab({ groups, onChange, pars, onParChange }) {
    const [editCat,  setEditCat]  = useState(null); // { catIdx, value }
    const [editItem, setEditItem] = useState(null); // { catIdx, itemIdx, value }
    const [newItem,  setNewItem]  = useState({});   // { [catIdx]: string }
    const [newCat,   setNewCat]   = useState('');
    const [csvModal, setCsvModal] = useState(null); // parsed groups | null
    const fileRef = useRef(null);

    const update = (next) => onChange(next);

    // ── Category actions ──────────────────────────────────────────────────

    const saveCatName = (catIdx) => {
        const val = editCat.value.trim();
        if (!val) return setEditCat(null);
        const next = groups.map((g, i) => i === catIdx ? { ...g, category: val } : g);
        update(next);
        setEditCat(null);
    };

    const deleteCategory = (catIdx) => {
        if (!confirm(`Delete category "${groups[catIdx].category}" and all its items?`)) return;
        update(groups.filter((_, i) => i !== catIdx));
    };

    const addCategory = () => {
        const val = newCat.trim();
        if (!val) return;
        if (groups.some((g) => g.category.toLowerCase() === val.toLowerCase())) return;
        update([...groups, { category: val, items: [] }]);
        setNewCat('');
    };

    // ── Item actions ──────────────────────────────────────────────────────

    const saveItemName = (catIdx, itemIdx) => {
        const val = editItem.value.trim();
        if (!val) return setEditItem(null);
        const next = groups.map((g, ci) => {
            if (ci !== catIdx) return g;
            const items = g.items.map((it, ii) => ii === itemIdx ? val : it);
            return { ...g, items };
        });
        update(next);
        setEditItem(null);
    };

    const deleteItem = (catIdx, itemIdx) => {
        const next = groups.map((g, ci) => {
            if (ci !== catIdx) return g;
            return { ...g, items: g.items.filter((_, ii) => ii !== itemIdx) };
        });
        update(next);
    };

    const addItem = (catIdx) => {
        const val = (newItem[catIdx] || '').trim();
        if (!val) return;
        const next = groups.map((g, ci) => {
            if (ci !== catIdx) return g;
            if (g.items.includes(val)) return g;
            return { ...g, items: [...g.items, val] };
        });
        update(next);
        setNewItem((p) => ({ ...p, [catIdx]: '' }));
    };

    // ── CSV import ────────────────────────────────────────────────────────

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const parsed = parseCSV(ev.target.result);
            if (parsed.length === 0) { alert('No valid rows found. Expected columns: Category, Item'); return; }
            setCsvModal(parsed);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleCSVImport = (mode) => {
        if (!csvModal) return;
        let next;
        if (mode === 'replace') {
            next = csvModal;
        } else {
            // Merge: for each parsed group, merge into existing
            next = [...groups];
            for (const parsed of csvModal) {
                const existing = next.find((g) => g.category.toLowerCase() === parsed.category.toLowerCase());
                if (existing) {
                    const newItems = parsed.items.filter((it) => !existing.items.includes(it));
                    existing.items = [...existing.items, ...newItems];
                } else {
                    next.push({ ...parsed });
                }
            }
            next = next.map((g) => ({ ...g })); // shallow clone for state update
        }
        update(next);
        setCsvModal(null);
    };

    return (
        <div className='space-y-5'>
            {/* Toolbar */}
            <div className='flex flex-wrap items-center gap-2'>
                <input
                    ref={fileRef}
                    type='file'
                    accept='.csv,text/csv'
                    className='hidden'
                    onChange={handleFileChange}
                />
                <button
                    type='button'
                    onClick={() => fileRef.current?.click()}
                    className='rounded-lg bg-black px-4 py-2 text-sm text-white'
                >
                    Import CSV
                </button>
                <button
                    type='button'
                    onClick={() => exportTemplateCSV(groups)}
                    className='rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50'
                >
                    Download Template
                </button>
                <span className='text-xs text-gray-400'>CSV format: Category, Item (with header row)</span>
            </div>

            {/* Add category */}
            <div className='flex gap-2'>
                <input
                    type='text'
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                    placeholder='New category name…'
                    className='flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black'
                />
                <button
                    type='button'
                    onClick={addCategory}
                    disabled={!newCat.trim()}
                    className='rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-40'
                >
                    + Add Category
                </button>
            </div>

            {/* Reset to defaults */}
            <div className='flex justify-end'>
                <button
                    type='button'
                    onClick={() => { if (confirm('Reset to default items? This cannot be undone.')) onChange(DEFAULT_ITEMS); }}
                    className='text-xs text-red-400 hover:text-red-600'
                >
                    Reset to defaults
                </button>
            </div>

            {/* Categories */}
            {groups.map((group, catIdx) => (
                <section key={catIdx} className='rounded-xl bg-white shadow-sm'>
                    {/* Category header */}
                    <div className='flex items-center gap-2 border-b border-gray-100 px-4 py-3'>
                        {editCat?.catIdx === catIdx ? (
                            <input
                                autoFocus
                                value={editCat.value}
                                onChange={(e) => setEditCat({ catIdx, value: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveCatName(catIdx); if (e.key === 'Escape') setEditCat(null); }}
                                onBlur={() => saveCatName(catIdx)}
                                className='flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-semibold outline-none focus:border-black'
                            />
                        ) : (
                            <span className='flex-1 font-semibold'>{group.category}</span>
                        )}
                        <span className='text-xs text-gray-400'>{group.items.length} items</span>
                        <button
                            type='button'
                            onClick={() => setEditCat({ catIdx, value: group.category })}
                            className='text-gray-400 hover:text-black'
                            title='Rename'
                        >
                            ✎
                        </button>
                        <button
                            type='button'
                            onClick={() => deleteCategory(catIdx)}
                            className='text-gray-300 hover:text-red-500'
                            title='Delete category'
                        >
                            ✕
                        </button>
                    </div>

                    {/* Items */}
                    <div className='divide-y divide-gray-50'>
                        {group.items.map((item, itemIdx) => (
                            <div key={itemIdx} className='flex items-center gap-2 px-4 py-2'>
                                {editItem?.catIdx === catIdx && editItem?.itemIdx === itemIdx ? (
                                    <input
                                        autoFocus
                                        value={editItem.value}
                                        onChange={(e) => setEditItem({ catIdx, itemIdx, value: e.target.value })}
                                        onKeyDown={(e) => { if (e.key === 'Enter') saveItemName(catIdx, itemIdx); if (e.key === 'Escape') setEditItem(null); }}
                                        onBlur={() => saveItemName(catIdx, itemIdx)}
                                        className='flex-1 rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-black'
                                    />
                                ) : (
                                    <span className='flex-1 text-sm'>{item}</span>
                                )}
                                <input
                                    type='number'
                                    min='0'
                                    step='1'
                                    inputMode='numeric'
                                    value={pars[item] || ''}
                                    onChange={(e) => onParChange(item, e.target.value)}
                                    placeholder='Par'
                                    title='Par level (minimum quantity)'
                                    className='w-16 shrink-0 rounded border border-gray-200 px-2 py-1 text-center text-xs text-gray-500 outline-none focus:border-orange-400'
                                />
                                <button
                                    type='button'
                                    onClick={() => setEditItem({ catIdx, itemIdx, value: item })}
                                    className='shrink-0 text-gray-300 hover:text-black'
                                    title='Rename item'
                                >
                                    ✎
                                </button>
                                <button
                                    type='button'
                                    onClick={() => deleteItem(catIdx, itemIdx)}
                                    className='shrink-0 text-gray-300 hover:text-red-500'
                                    title='Delete item'
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Add item row */}
                    <div className='flex gap-2 px-4 py-3'>
                        <input
                            type='text'
                            value={newItem[catIdx] || ''}
                            onChange={(e) => setNewItem((p) => ({ ...p, [catIdx]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addItem(catIdx)}
                            placeholder='Add item…'
                            className='flex-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-black focus:bg-white'
                        />
                        <button
                            type='button'
                            onClick={() => addItem(catIdx)}
                            disabled={!(newItem[catIdx] || '').trim()}
                            className='rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40'
                        >
                            + Add
                        </button>
                    </div>
                </section>
            ))}

            {csvModal && (
                <CSVImportModal
                    parsed={csvModal}
                    onConfirm={handleCSVImport}
                    onCancel={() => setCsvModal(null)}
                />
            )}
        </div>
    );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function InventoryPage() {
    const [tab,          setTab]          = useState('checklist');
    const [groups,       setGroups]       = useState(DEFAULT_ITEMS);
    const [counts,       setCounts]       = useState({});
    const [statuses,     setStatuses]     = useState({});
    const [employeeName, setEmployeeName] = useState('');
    const [notes,        setNotes]        = useState('');
    const [submitting,   setSubmitting]   = useState(false);
    const [message,      setMessage]      = useState('');
    const [search,       setSearch]       = useState('');
    const [collapsed,    setCollapsed]    = useState({});
    const [draftSaved,   setDraftSaved]   = useState(false);
    const [showSummary,  setShowSummary]  = useState(false);
    const [history,      setHistory]      = useState([]);
    const [pars,         setPars]         = useState({});
    const [isLoading,    setIsLoading]    = useState(true);
    const draftTimer    = useRef(null);
    const parSaveTimer  = useRef(null);

    // Derived
    const flatItems = useMemo(() => buildFlat(groups), [groups]);

    // Sync counts/statuses when items list changes (add defaults for new items)
    useEffect(() => {
        setCounts((prev) => {
            const next = {};
            flatItems.forEach((i) => { next[i.name] = prev[i.name] ?? 0; });
            return next;
        });
        setStatuses((prev) => {
            const next = {};
            flatItems.forEach((i) => { next[i.name] = prev[i.name] ?? 'ok'; });
            return next;
        });
    }, [flatItems]);

    // Load from Supabase on mount
    useEffect(() => {
        const load = async () => {
            try {
                const [fetchedGroups, fetchedPars, fetchedHistory] = await Promise.all([
                    getInventoryGroups(),
                    getParLevels(),
                    getInventorySubmissions(),
                ]);

                if (fetchedGroups) {
                    setGroups(fetchedGroups);
                } else {
                    // First time — seed DB with defaults
                    await saveInventoryGroups(DEFAULT_ITEMS);
                }

                setPars(fetchedPars);
                setHistory(fetchedHistory);

                // Draft stays in localStorage (per-session)
                const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
                if (draft) {
                    if (draft.counts)       setCounts(draft.counts);
                    if (draft.statuses)     setStatuses(draft.statuses);
                    if (draft.employeeName) setEmployeeName(draft.employeeName);
                    if (draft.notes)        setNotes(draft.notes);
                }
            } catch (err) {
                console.error('Failed to load inventory from Supabase:', err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const handleGroupsChange = (next) => {
        setGroups(next);
        saveInventoryGroups(next).catch(console.error);
    };

    // Auto-save draft (debounced 800ms)
    const saveDraft = useCallback((c, s, name, n) => {
        clearTimeout(draftTimer.current);
        draftTimer.current = setTimeout(() => {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ counts: c, statuses: s, employeeName: name, notes: n }));
            setDraftSaved(true);
            setTimeout(() => setDraftSaved(false), 2000);
        }, 800);
    }, []);

    const handleCountChange = (itemName, value) => {
        const num = Math.max(0, Math.floor(Number(value) || 0));
        setCounts((prev) => {
            const next = { ...prev, [itemName]: num };
            saveDraft(next, statuses, employeeName, notes);
            return next;
        });
    };

    const handleParChange = (itemName, value) => {
        const num = Math.max(0, Math.floor(Number(value) || 0));
        setPars((prev) => {
            const next = { ...prev };
            if (num > 0) { next[itemName] = num; } else { delete next[itemName]; }
            clearTimeout(parSaveTimer.current);
            parSaveTimer.current = setTimeout(() => {
                saveParLevel(itemName, num).catch(console.error);
            }, 600);
            return next;
        });
    };

    const handleStatusChange = (itemName, status) => {
        setStatuses((prev) => {
            const next = { ...prev, [itemName]: status };
            saveDraft(counts, next, employeeName, notes);
            return next;
        });
    };

    const handleReset = () => {
        const empty = Object.fromEntries(flatItems.map((i) => [i.name, 0]));
        const emptyS = Object.fromEntries(flatItems.map((i) => [i.name, 'ok']));
        setCounts(empty);
        setStatuses(emptyS);
        setEmployeeName('');
        setNotes('');
        setSearch('');
        localStorage.removeItem(DRAFT_KEY);
    };

    const handleDeleteHistory = (id, submittedAt) => {
        if (id) deleteInventorySubmission(id).catch(console.error);
        setHistory((prev) => prev.filter((e) => (e._id ? e._id !== id : e.submittedAt !== submittedAt)));
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setMessage('');
        const payload = {
            employeeName,
            notes,
            submittedAt: new Date().toISOString(),
            items: flatItems.map((item) => ({
                category: item.category,
                name:     item.name,
                amount:   counts[item.name] || null,
                status:   statuses[item.name] || 'ok',
            })),
        };
        try {
            if (WEBHOOK_URL) {
                const res = await fetch(WEBHOOK_URL, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(payload),
                });
                if (!res.ok) throw new Error('Failed to submit inventory.');
            }
            const newId = await saveInventorySubmission(payload);
            setHistory((prev) => [{ ...payload, _id: newId }, ...prev].slice(0, 50));
            setMessage('Submitted successfully.');
            setShowSummary(false);
            handleReset();
        } catch (error) {
            setMessage(error.message || 'Something went wrong.');
            setShowSummary(false);
        } finally {
            setSubmitting(false);
        }
    };

    // Derived stats
    const filledCount  = useMemo(() => flatItems.filter((i) => counts[i.name] > 0).length, [flatItems, counts]);
    const flaggedCount = useMemo(() => flatItems.filter((i) => statuses[i.name] !== 'ok').length, [flatItems, statuses]);
    const progressPct  = flatItems.length ? Math.round((filledCount / flatItems.length) * 100) : 0;

    const filteredGroups = useMemo(() => {
        if (!search.trim()) return groups;
        const q = search.toLowerCase();
        return groups
            .map((g) => ({ ...g, items: g.items.filter((i) => i.toLowerCase().includes(q)) }))
            .filter((g) => g.items.length > 0);
    }, [search, groups]);

    const shoppingItems = useMemo(() =>
        flatItems.filter((i) =>
            statuses[i.name] === 'out' ||
            statuses[i.name] === 'low' ||
            (pars[i.name] > 0 && (counts[i.name] ?? 0) < pars[i.name])
        ),
        [flatItems, statuses, pars, counts]
    );

    const tabs = [
        { key: 'checklist', label: 'Checklist' },
        { key: 'shopping',  label: `Shopping List${shoppingItems.length > 0 ? ` (${shoppingItems.length})` : ''}` },
        { key: 'history',   label: `History${history.length > 0 ? ` (${history.length})` : ''}` },
        { key: 'manage',    label: 'Manage Items' },
    ];

    if (isLoading) {
        return (
            <main className='flex min-h-screen items-center justify-center bg-gray-50'>
                <div className='text-center'>
                    <div className='mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-black' />
                    <p className='text-sm text-gray-500'>Loading inventory…</p>
                </div>
            </main>
        );
    }

    return (
        <main className='min-h-screen bg-gray-50'>
            {/* Header */}
            <div className='border-b border-gray-200 bg-white px-6 py-4'>
                <div className='mx-auto flex max-w-4xl items-center justify-between'>
                    <div>
                        <h1 className='text-2xl font-bold'>Inventory</h1>
                        <p className='text-sm text-gray-500'>The Moon Tea · Palmhurst, TX</p>
                    </div>
                    <div className='flex gap-1.5'>
                        {tabs.map((t) => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === t.key ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className='mx-auto max-w-4xl p-6'>

                {/* ── Checklist Tab ── */}
                {tab === 'checklist' && (
                    <div className='space-y-5'>
                        <div className='rounded-xl bg-white p-4 shadow-sm'>
                            <div className='grid gap-4 md:grid-cols-2'>
                                <div>
                                    <label className='mb-1 block text-sm font-medium'>Employee Name</label>
                                    <input
                                        type='text'
                                        value={employeeName}
                                        onChange={(e) => { setEmployeeName(e.target.value); saveDraft(counts, statuses, e.target.value, notes); }}
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-black'
                                        placeholder='Enter your name'
                                    />
                                </div>
                                <div>
                                    <label className='mb-1 block text-sm font-medium'>Notes</label>
                                    <input
                                        type='text'
                                        value={notes}
                                        onChange={(e) => { setNotes(e.target.value); saveDraft(counts, statuses, employeeName, e.target.value); }}
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-black'
                                        placeholder='Optional notes'
                                    />
                                </div>
                            </div>
                        </div>

                        <div className='rounded-xl bg-white p-4 shadow-sm'>
                            <div className='mb-2 flex items-center justify-between text-sm'>
                                <div className='flex items-center gap-3'>
                                    <span className='font-medium'>{filledCount} / {flatItems.length} filled</span>
                                    {flaggedCount > 0 && (
                                        <span className='rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600'>{flaggedCount} flagged</span>
                                    )}
                                    {draftSaved && <span className='text-xs text-gray-400'>Draft saved</span>}
                                </div>
                                <div className='flex gap-2'>
                                    <button type='button' onClick={() => exportCSV(groups, counts, statuses, employeeName)} className='rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50'>
                                        Export CSV
                                    </button>
                                    <button type='button' onClick={handleReset} className='rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50'>
                                        Reset
                                    </button>
                                </div>
                            </div>
                            <div className='h-2 w-full overflow-hidden rounded-full bg-gray-100'>
                                <div className='h-full rounded-full bg-green-500 transition-all duration-300' style={{ width: `${progressPct}%` }} />
                            </div>
                        </div>

                        <input
                            type='text'
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className='w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm outline-none focus:border-black'
                            placeholder='Search items…'
                        />

                        {filteredGroups.map((group) => {
                            const isCollapsed  = collapsed[group.category] && !search.trim();
                            const groupFilled  = group.items.filter((i) => counts[i] > 0).length;
                            const groupFlagged = group.items.filter((i) => statuses[i] !== 'ok').length;
                            return (
                                <section key={group.category} className='rounded-xl bg-white shadow-sm'>
                                    <button
                                        type='button'
                                        onClick={() => setCollapsed((p) => ({ ...p, [group.category]: !p[group.category] }))}
                                        className='flex w-full items-center justify-between px-4 py-3 text-left'
                                    >
                                        <span className='font-semibold'>{group.category}</span>
                                        <span className='flex items-center gap-1.5 text-sm'>
                                            {groupFlagged > 0 && <span className='rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600'>{groupFlagged} flagged</span>}
                                            {groupFilled > 0 && <span className='rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'>{groupFilled}/{group.items.length}</span>}
                                            <span className='text-gray-400'>{isCollapsed ? '▸' : '▾'}</span>
                                        </span>
                                    </button>
                                    {!isCollapsed && (
                                        <div className='grid gap-4 border-t border-gray-100 p-4 sm:grid-cols-2 md:grid-cols-3'>
                                            {group.items.map((item) => (
                                                <div key={item}>
                                                    <label className='mb-1 block text-sm font-medium leading-tight'>{item}</label>
                                                    <input
                                                        type='number'
                                                        min='0'
                                                        step='1'
                                                        inputMode='numeric'
                                                        value={counts[item] ?? 0}
                                                        onChange={(e) => handleCountChange(item, e.target.value)}
                                                        className={`w-full rounded-lg border px-3 py-2 outline-none focus:border-black ${
                                                            pars[item] > 0 && (counts[item] ?? 0) < pars[item]
                                                                ? 'border-orange-400 bg-orange-50'
                                                                : counts[item] > 0
                                                                ? 'border-green-400 bg-green-50'
                                                                : 'border-gray-300'
                                                        }`}
                                                    />
                                                    {pars[item] > 0 && (counts[item] ?? 0) < pars[item] && (
                                                        <p className='mt-0.5 text-xs text-orange-500'>Below par (need {pars[item]})</p>
                                                    )}
                                                    <StatusPill value={statuses[item] || 'ok'} onChange={(s) => handleStatusChange(item, s)} />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            );
                        })}

                        <div className='flex items-center gap-3 pt-2'>
                            <button
                                type='button'
                                disabled={!employeeName.trim()}
                                onClick={() => { setMessage(''); setShowSummary(true); }}
                                className='rounded-lg bg-black px-5 py-2.5 font-medium text-white disabled:opacity-50'
                            >
                                Review & Submit
                            </button>
                            {message && (
                                <p className={`text-sm ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{message}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Shopping List Tab ── */}
                {tab === 'shopping' && (
                    <div className='space-y-4'>
                        {shoppingItems.length === 0 ? (
                            <div className='rounded-xl bg-white p-10 text-center shadow-sm'>
                                <p className='text-2xl'>✓</p>
                                <p className='mt-2 font-medium text-gray-700'>All good! Nothing needs ordering.</p>
                                <p className='mt-1 text-sm text-gray-400'>Items marked Low/Out or below their par level will appear here.</p>
                            </div>
                        ) : (
                            <>
                                <div className='flex flex-wrap items-center justify-between gap-2'>
                                    <p className='text-sm text-gray-500'>{shoppingItems.length} item{shoppingItems.length !== 1 ? 's' : ''} to order</p>
                                    <div className='flex gap-2'>
                                        <button
                                            type='button'
                                            onClick={() => { copyShoppingListText(shoppingItems, counts, pars, statuses); }}
                                            className='rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50'
                                        >
                                            Copy Text
                                        </button>
                                        <button
                                            type='button'
                                            onClick={() => exportShoppingList(shoppingItems, counts, pars, statuses)}
                                            className='rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white'
                                        >
                                            Export CSV
                                        </button>
                                    </div>
                                </div>
                                {[...new Set(shoppingItems.map((i) => i.category))].map((cat) => {
                                    const catItems = shoppingItems.filter((i) => i.category === cat);
                                    return (
                                        <section key={cat} className='rounded-xl bg-white shadow-sm'>
                                            <div className='border-b border-gray-100 px-4 py-3'>
                                                <span className='font-semibold'>{cat}</span>
                                                <span className='ml-2 text-xs text-gray-400'>{catItems.length} item{catItems.length !== 1 ? 's' : ''}</span>
                                            </div>
                                            <div className='divide-y divide-gray-50'>
                                                {catItems.map((i) => {
                                                    const have   = counts[i.name] ?? 0;
                                                    const par    = pars[i.name];
                                                    const status = statuses[i.name] ?? 'ok';
                                                    const belowPar = par > 0 && have < par;
                                                    return (
                                                        <div key={i.name} className='flex items-center justify-between px-4 py-3'>
                                                            <div>
                                                                <p className='text-sm font-medium'>{i.name}</p>
                                                                {belowPar && (
                                                                    <p className='text-xs text-orange-500'>have {have} · need {par} · short {par - have}</p>
                                                                )}
                                                            </div>
                                                            <div className='flex items-center gap-2'>
                                                                {status !== 'ok' && (
                                                                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${status === 'low' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                                        {status.toUpperCase()}
                                                                    </span>
                                                                )}
                                                                {belowPar && status === 'ok' && (
                                                                    <span className='rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700'>Below par</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    );
                                })}
                            </>
                        )}
                    </div>
                )}

                {/* ── History Tab ── */}
                {tab === 'history' && (
                    <div className='space-y-3'>
                        {history.length === 0 ? (
                            <div className='rounded-xl bg-white p-10 text-center text-gray-400 shadow-sm'>No submissions yet.</div>
                        ) : (
                            <>
                                <div className='flex items-center justify-between'>
                                    <p className='text-sm text-gray-500'>{history.length} submission{history.length !== 1 ? 's' : ''}</p>
                                    <button
                                        type='button'
                                        onClick={() => { if (confirm('Clear all history?')) { clearInventorySubmissions().catch(console.error); setHistory([]); } }}
                                        className='text-xs text-red-400 hover:text-red-600'
                                    >
                                        Clear all
                                    </button>
                                </div>
                                {history.map((entry) => (
                                    <HistoryEntry key={entry._id || entry.submittedAt} entry={entry} onDelete={handleDeleteHistory} />
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* ── Manage Tab ── */}
                {tab === 'manage' && (
                    <ManageTab groups={groups} onChange={handleGroupsChange} pars={pars} onParChange={handleParChange} />
                )}
            </div>

            {showSummary && (
                <SummaryModal
                    flatItems={flatItems}
                    counts={counts}
                    statuses={statuses}
                    employeeName={employeeName}
                    notes={notes}
                    onConfirm={handleSubmit}
                    onCancel={() => setShowSummary(false)}
                    submitting={submitting}
                />
            )}
        </main>
    );
}
