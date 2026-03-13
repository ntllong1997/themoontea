'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─── Static data ────────────────────────────────────────────────────────────

const inventoryItems = [
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

const WEBHOOK_URL = process.env.NEXT_PUBLIC_INVENTORY_WEBHOOK_URL || '';
const DRAFT_KEY   = 'inventory_draft';
const HISTORY_KEY = 'inventory_history';

const flatItems = inventoryItems.flatMap((group) =>
    group.items.map((item) => ({ category: group.category, name: item }))
);

const emptyCount    = Object.fromEntries(flatItems.map((i) => [i.name, 0]));
const emptyStatuses = Object.fromEntries(flatItems.map((i) => [i.name, 'ok']));

// ─── Helpers ────────────────────────────────────────────────────────────────

function exportCSV(counts, statuses, employeeName) {
    const rows = [['Category', 'Item', 'Amount', 'Status']];
    inventoryItems.forEach((group) => {
        group.items.forEach((item) => {
            rows.push([
                group.category,
                item,
                counts[item] ?? 0,
                statuses[item] ?? 'ok',
            ]);
        });
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `inventory_${employeeName.replace(/\s+/g, '_') || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function formatDate(iso) {
    return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
}

// ─── Sub-components ─────────────────────────────────────────────────────────

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

function HistoryEntry({ entry, onDelete }) {
    const [open, setOpen] = useState(false);
    const flagged = entry.items.filter((i) => i.status !== 'ok');
    const filled  = entry.items.filter((i) => i.amount > 0);

    return (
        <div className='rounded-lg border border-gray-200'>
            <div
                className='flex cursor-pointer items-center justify-between px-4 py-3'
                onClick={() => setOpen((p) => !p)}
            >
                <div>
                    <p className='font-medium'>{entry.employeeName || 'Unknown'}</p>
                    <p className='text-xs text-gray-500'>{formatDate(entry.submittedAt)}</p>
                </div>
                <div className='flex items-center gap-2 text-xs'>
                    <span className='rounded-full bg-gray-100 px-2 py-0.5 text-gray-600'>
                        {filled.length} filled
                    </span>
                    {flagged.length > 0 && (
                        <span className='rounded-full bg-red-100 px-2 py-0.5 text-red-600'>
                            {flagged.length} flagged
                        </span>
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

                    {/* Flagged items first */}
                    {flagged.length > 0 && (
                        <div className='mb-3'>
                            <p className='mb-1 text-xs font-semibold uppercase tracking-wide text-red-600'>Flagged Items</p>
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

                    {/* All items grouped */}
                    {inventoryItems.map((group) => {
                        const groupItems = entry.items.filter(
                            (i) => i.category === group.category && (i.amount > 0 || i.status !== 'ok')
                        );
                        if (!groupItems.length) return null;
                        return (
                            <div key={group.category} className='mb-2'>
                                <p className='mb-1 text-xs font-semibold text-gray-500'>{group.category}</p>
                                <div className='grid gap-1 sm:grid-cols-2 md:grid-cols-3'>
                                    {groupItems.map((i) => (
                                        <div key={i.name} className='flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-sm'>
                                            <span className='truncate'>{i.name}</span>
                                            <span className='ml-2 shrink-0 text-gray-500'>{i.amount ?? 0}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    <button
                        type='button'
                        onClick={() => onDelete(entry.submittedAt)}
                        className='mt-3 text-xs text-red-400 hover:text-red-600'
                    >
                        Delete this entry
                    </button>
                </div>
            )}
        </div>
    );
}

function SummaryModal({ counts, statuses, employeeName, notes, onConfirm, onCancel, submitting }) {
    const filled  = flatItems.filter((i) => counts[i.name] > 0);
    const flagged = flatItems.filter((i) => statuses[i.name] !== 'ok');

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
            <div className='w-full max-w-lg rounded-xl bg-white shadow-xl'>
                <div className='border-b border-gray-100 px-6 py-4'>
                    <h2 className='text-lg font-bold'>Review & Submit</h2>
                    <p className='text-sm text-gray-500'>{employeeName} · {new Date().toLocaleDateString()}</p>
                </div>

                <div className='max-h-80 overflow-y-auto px-6 py-4 space-y-4'>
                    {notes && (
                        <p className='text-sm text-gray-600'><span className='font-medium'>Notes:</span> {notes}</p>
                    )}

                    <div>
                        <p className='mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500'>
                            Summary
                        </p>
                        <div className='grid grid-cols-3 gap-2 text-center text-sm'>
                            <div className='rounded-lg bg-gray-50 p-2'>
                                <p className='text-xl font-bold'>{filled.length}</p>
                                <p className='text-gray-500'>items filled</p>
                            </div>
                            <div className='rounded-lg bg-yellow-50 p-2'>
                                <p className='text-xl font-bold text-yellow-700'>
                                    {flagged.filter((i) => statuses[i.name] === 'low').length}
                                </p>
                                <p className='text-yellow-600'>low stock</p>
                            </div>
                            <div className='rounded-lg bg-red-50 p-2'>
                                <p className='text-xl font-bold text-red-700'>
                                    {flagged.filter((i) => statuses[i.name] === 'out').length}
                                </p>
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
                    <button
                        type='button'
                        onClick={onCancel}
                        disabled={submitting}
                        className='rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50'
                    >
                        Back
                    </button>
                    <button
                        type='button'
                        onClick={onConfirm}
                        disabled={submitting}
                        className='rounded-lg bg-black px-5 py-2 text-sm text-white disabled:opacity-50'
                    >
                        {submitting ? 'Submitting…' : 'Confirm & Submit'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function InventoryPage() {
    const [tab,          setTab]          = useState('checklist');
    const [counts,       setCounts]       = useState(emptyCount);
    const [statuses,     setStatuses]     = useState(emptyStatuses);
    const [employeeName, setEmployeeName] = useState('');
    const [notes,        setNotes]        = useState('');
    const [submitting,   setSubmitting]   = useState(false);
    const [message,      setMessage]      = useState('');
    const [search,       setSearch]       = useState('');
    const [collapsed,    setCollapsed]    = useState({});
    const [draftSaved,   setDraftSaved]   = useState(false);
    const [showSummary,  setShowSummary]  = useState(false);
    const [history,      setHistory]      = useState([]);
    const draftTimer = useRef(null);

    // Load draft + history on mount
    useEffect(() => {
        try {
            const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
            if (draft) {
                if (draft.counts)       setCounts(draft.counts);
                if (draft.statuses)     setStatuses(draft.statuses);
                if (draft.employeeName) setEmployeeName(draft.employeeName);
                if (draft.notes)        setNotes(draft.notes);
            }
            const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            setHistory(hist);
        } catch (_) {}
    }, []);

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

    const handleStatusChange = (itemName, status) => {
        setStatuses((prev) => {
            const next = { ...prev, [itemName]: status };
            saveDraft(counts, next, employeeName, notes);
            return next;
        });
    };

    const handleReset = () => {
        setCounts(emptyCount);
        setStatuses(emptyStatuses);
        setEmployeeName('');
        setNotes('');
        setSearch('');
        localStorage.removeItem(DRAFT_KEY);
    };

    const handleDeleteHistory = (submittedAt) => {
        setHistory((prev) => {
            const next = prev.filter((e) => e.submittedAt !== submittedAt);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
            return next;
        });
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

            // Save to local history
            setHistory((prev) => {
                const next = [payload, ...prev].slice(0, 50);
                localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
                return next;
            });

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

    // Derived values
    const filledCount = useMemo(
        () => flatItems.filter((i) => counts[i.name] > 0).length,
        [counts]
    );
    const flaggedCount = useMemo(
        () => flatItems.filter((i) => statuses[i.name] !== 'ok').length,
        [statuses]
    );

    const filteredItems = useMemo(() => {
        if (!search.trim()) return inventoryItems;
        const q = search.toLowerCase();
        return inventoryItems
            .map((g) => ({ ...g, items: g.items.filter((i) => i.toLowerCase().includes(q)) }))
            .filter((g) => g.items.length > 0);
    }, [search]);

    const progressPct = Math.round((filledCount / flatItems.length) * 100);

    return (
        <main className='min-h-screen bg-gray-50'>
            {/* Header */}
            <div className='border-b border-gray-200 bg-white px-6 py-4'>
                <div className='mx-auto flex max-w-4xl items-center justify-between'>
                    <div>
                        <h1 className='text-2xl font-bold'>Inventory</h1>
                        <p className='text-sm text-gray-500'>The Moon Tea · Palmhurst, TX</p>
                    </div>
                    <div className='flex gap-2'>
                        <button
                            onClick={() => setTab('checklist')}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === 'checklist' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            Checklist
                        </button>
                        <button
                            onClick={() => setTab('history')}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === 'history' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            History
                            {history.length > 0 && (
                                <span className='ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700'>
                                    {history.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <div className='mx-auto max-w-4xl p-6'>

                {/* ── Checklist Tab ── */}
                {tab === 'checklist' && (
                    <div className='space-y-5'>
                        {/* Employee + Notes */}
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
                                        required
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

                        {/* Progress + actions */}
                        <div className='rounded-xl bg-white p-4 shadow-sm'>
                            <div className='mb-2 flex items-center justify-between text-sm'>
                                <div className='flex items-center gap-3'>
                                    <span className='font-medium'>{filledCount} / {flatItems.length} filled</span>
                                    {flaggedCount > 0 && (
                                        <span className='rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600'>
                                            {flaggedCount} flagged
                                        </span>
                                    )}
                                    {draftSaved && (
                                        <span className='text-xs text-gray-400'>Draft saved</span>
                                    )}
                                </div>
                                <div className='flex gap-2'>
                                    <button
                                        type='button'
                                        onClick={() => exportCSV(counts, statuses, employeeName)}
                                        className='rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50'
                                    >
                                        Export CSV
                                    </button>
                                    <button
                                        type='button'
                                        onClick={handleReset}
                                        className='rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50'
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>
                            <div className='h-2 w-full overflow-hidden rounded-full bg-gray-100'>
                                <div
                                    className='h-full rounded-full bg-green-500 transition-all duration-300'
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                        </div>

                        {/* Search */}
                        <input
                            type='text'
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className='w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm outline-none focus:border-black'
                            placeholder='Search items…'
                        />

                        {/* Categories */}
                        {filteredItems.map((group) => {
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
                                            {groupFlagged > 0 && (
                                                <span className='rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600'>
                                                    {groupFlagged} flagged
                                                </span>
                                            )}
                                            {groupFilled > 0 && (
                                                <span className='rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'>
                                                    {groupFilled}/{group.items.length}
                                                </span>
                                            )}
                                            <span className='text-gray-400'>{isCollapsed ? '▸' : '▾'}</span>
                                        </span>
                                    </button>

                                    {!isCollapsed && (
                                        <div className='grid gap-4 border-t border-gray-100 p-4 sm:grid-cols-2 md:grid-cols-3'>
                                            {group.items.map((item) => (
                                                <div key={item}>
                                                    <label className='mb-1 block text-sm font-medium leading-tight'>
                                                        {item}
                                                    </label>
                                                    <input
                                                        type='number'
                                                        min='0'
                                                        step='1'
                                                        inputMode='numeric'
                                                        value={counts[item] ?? 0}
                                                        onChange={(e) => handleCountChange(item, e.target.value)}
                                                        className={`w-full rounded-lg border px-3 py-2 outline-none focus:border-black ${
                                                            counts[item] > 0 ? 'border-green-400 bg-green-50' : 'border-gray-300'
                                                        }`}
                                                    />
                                                    <StatusPill
                                                        value={statuses[item] || 'ok'}
                                                        onChange={(s) => handleStatusChange(item, s)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            );
                        })}

                        {/* Submit bar */}
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
                                <p className={`text-sm ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                                    {message}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* ── History Tab ── */}
                {tab === 'history' && (
                    <div className='space-y-3'>
                        {history.length === 0 ? (
                            <div className='rounded-xl bg-white p-10 text-center text-gray-400 shadow-sm'>
                                No submissions yet.
                            </div>
                        ) : (
                            <>
                                <div className='flex items-center justify-between'>
                                    <p className='text-sm text-gray-500'>{history.length} submission{history.length !== 1 ? 's' : ''}</p>
                                    <button
                                        type='button'
                                        onClick={() => {
                                            if (confirm('Clear all history?')) {
                                                setHistory([]);
                                                localStorage.removeItem(HISTORY_KEY);
                                            }
                                        }}
                                        className='text-xs text-red-400 hover:text-red-600'
                                    >
                                        Clear all
                                    </button>
                                </div>
                                {history.map((entry) => (
                                    <HistoryEntry
                                        key={entry.submittedAt}
                                        entry={entry}
                                        onDelete={handleDeleteHistory}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Summary modal */}
            {showSummary && (
                <SummaryModal
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
