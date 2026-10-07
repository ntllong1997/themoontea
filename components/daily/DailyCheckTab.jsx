'use client';

// Inventory's Daily Check tab. At closing, staff count a short list of items:
// things made in the shop under their target go on tomorrow's make list (on
// the Today board), and supplies under their target show as running low.
// Anyone signed in can change the list and the targets.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Minus, Pencil, Plus } from 'lucide-react';
import Dialog from '@/components/admin/Dialog';
import { inputClass, longDate } from '@/components/admin/schedule/scheduleUi';
import { api, jsonRequest } from '@/lib/site/adminApi';
import { planFromCounts, toCount } from '@/lib/daily/dailyStock';
import { CHIP, ErrorText, amount, checkWhen, countStatus, store, timeOf } from './dailyUi';

// Counts typed so far, so a reload mid-count doesn't lose them. Kept per day.
const DRAFT_KEY = 'daily-check-draft';

const GROUPS = [
    { kind: 'make', title: 'Made in-house', hint: 'Under target goes on tomorrow’s make list.' },
    { kind: 'buy', title: 'Supplies', hint: 'Under target shows as running low.' },
];

export default function DailyCheckTab({ currentUser }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [counts, setCounts] = useState({}); // { [itemId]: what was typed }
    const [redo, setRedo] = useState(false);
    const [editing, setEditing] = useState(false);
    const [dialog, setDialog] = useState(null); // { kind: 'item', item? } | { kind: 'finish' }

    const load = useCallback(async () => {
        try {
            const next = await api('/api/admin/daily');
            setData(next);
            setError('');
            return next;
        } catch (e) {
            if (e.message !== 'Signed out') setError(e.message);
            return null;
        }
    }, []);
    useEffect(() => {
        load().then((next) => {
            const draft = store.get(DRAFT_KEY);
            if (next && draft?.day === next.today) setCounts(draft.counts ?? {});
        });
    }, [load]);

    const setCount = (id, value) => {
        setCounts((prev) => {
            const next = { ...prev, [id]: value };
            if (data) store.set(DRAFT_KEY, { day: data.today, counts: next });
            return next;
        });
    };

    const startRedo = () => {
        const present = new Set(data.items.map((i) => i.id));
        setCounts(Object.fromEntries(data.latestCheck.counts.filter((c) => present.has(c.itemId)).map((c) => [c.itemId, String(c.count)])));
        setRedo(true);
    };

    const finished = async () => {
        store.set(DRAFT_KEY, null);
        setCounts({});
        setRedo(false);
        setDialog(null);
        await load();
    };

    const itemSaved = () => {
        setDialog(null);
        load();
    };

    if (!data) {
        return (
            <div className='space-y-3'>
                <ErrorText error={error} />
                {!error && <p className='rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm'>Loading…</p>}
            </div>
        );
    }

    const { items, latestCheck, today } = data;
    const checkedTonight = latestCheck?.date === today;

    return (
        <div className='space-y-4'>
            <div className='rounded-xl bg-white p-4 shadow-sm'>
                <div className='flex items-start justify-between gap-3'>
                    <div>
                        <h2 className='text-base font-semibold'>End-of-day check</h2>
                        <p className='mt-0.5 text-sm text-gray-600'>{longDate(today)}</p>
                        <p className='mt-1 text-sm'>
                            {checkedTonight ? (
                                <span className='font-medium text-green-800'>
                                    ✓ Done tonight by {latestCheck.employeeName} at {timeOf(latestCheck.submittedAt, data.timeZone)}
                                </span>
                            ) : (
                                <span className='text-gray-600'>
                                    Not done yet tonight
                                    {latestCheck && ` · last one ${checkWhen(latestCheck.date, today)} by ${latestCheck.employeeName}`}
                                </span>
                            )}
                        </p>
                    </div>
                    <button
                        type='button'
                        onClick={() => setEditing((on) => !on)}
                        aria-pressed={editing}
                        className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${editing ? 'bg-black text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                        {editing ? 'Done editing' : 'Edit list'}
                    </button>
                </div>
            </div>

            <ErrorText error={error} />

            {editing ? (
                <EditList items={items} onAdd={() => setDialog({ kind: 'item' })} onEdit={(item) => setDialog({ kind: 'item', item })} />
            ) : items.length === 0 ? (
                <div className='rounded-xl bg-white p-8 text-center shadow-sm'>
                    <p className='text-sm text-gray-600'>
                        Nothing to count yet. Add what to check at closing: things you make (boba, jelly, batter) and supplies that run out (cups, milk).
                    </p>
                    <button type='button' onClick={() => setDialog({ kind: 'item' })} className='mt-4 rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:opacity-80'>
                        + Add item
                    </button>
                </div>
            ) : checkedTonight && !redo ? (
                <>
                    <Result plan={latestCheck} note={latestCheck.note} />
                    <div className='flex flex-col gap-2 sm:flex-row'>
                        <Link href='/today' className='flex-1 rounded-xl bg-black py-3 text-center font-semibold text-white hover:opacity-80'>
                            Open the Today board →
                        </Link>
                        <button type='button' onClick={startRedo} className='flex-1 rounded-xl border border-gray-300 bg-white py-3 font-semibold text-gray-800 hover:bg-gray-50'>
                            Redo tonight’s check
                        </button>
                    </div>
                </>
            ) : (
                <CountList items={items} counts={counts} onCount={setCount} onFinish={() => setDialog({ kind: 'finish' })} onCancelRedo={redo ? () => setRedo(false) : null} />
            )}

            {dialog?.kind === 'item' && <ItemDialog item={dialog.item} onClose={() => setDialog(null)} onSaved={itemSaved} />}
            {dialog?.kind === 'finish' && (
                <FinishDialog items={items} counts={counts} currentUser={currentUser} redo={checkedTonight} onClose={() => setDialog(null)} onSaved={finished} />
            )}
        </div>
    );
}

// ── counting ─────────────────────────────────────────────────────────────────

function CountList({ items, counts, onCount, onFinish, onCancelRedo }) {
    const counted = items.filter((item) => toCount(counts[item.id] ?? '') !== null).length;
    const allCounted = counted === items.length;
    return (
        <>
            {GROUPS.map((group) => {
                const groupItems = items.filter((item) => item.kind === group.kind);
                if (!groupItems.length) return null;
                return (
                    <section key={group.kind} aria-labelledby={`count-${group.kind}`} className='overflow-hidden rounded-xl bg-white shadow-sm'>
                        <div className='border-b border-gray-100 px-4 py-3'>
                            <h3 id={`count-${group.kind}`} className='font-semibold'>
                                {group.title}
                            </h3>
                            <p className='text-sm text-gray-600'>{group.hint}</p>
                        </div>
                        <ul className='divide-y divide-gray-100'>
                            {groupItems.map((item) => (
                                <CountRow key={item.id} item={item} value={counts[item.id] ?? ''} onChange={(value) => onCount(item.id, value)} />
                            ))}
                        </ul>
                    </section>
                );
            })}
            <div className='sticky bottom-3 rounded-xl bg-white p-4 shadow-md ring-1 ring-gray-200'>
                <div className='flex items-center justify-between gap-3'>
                    <p className='text-sm text-gray-700'>
                        <span className='font-semibold'>
                            {counted} of {items.length}
                        </span>{' '}
                        counted
                        {!allCounted && <span className='block text-gray-600'>Count every item to finish.</span>}
                    </p>
                    <div className='flex shrink-0 gap-2'>
                        {onCancelRedo && (
                            <button type='button' onClick={onCancelRedo} className='rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50'>
                                Cancel
                            </button>
                        )}
                        <button type='button' onClick={onFinish} disabled={!allCounted} className='rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:opacity-80 disabled:opacity-40'>
                            Finish check
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

function CountRow({ item, value, onChange }) {
    const count = toCount(value);
    const status = countStatus(item, count);
    const step = (by) => onChange(String(Math.max(0, (count ?? 0) + by)));
    return (
        <li className='flex items-center gap-3 px-4 py-3'>
            <div className='min-w-0 flex-1'>
                <p className='font-medium'>{item.name}</p>
                <p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600'>
                    <span>{item.target > 0 ? `Target ${amount(item.target, item.unit)}` : `No target${item.unit ? ` · ${item.unit}` : ''}`}</span>
                    {status && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[status.tone]}`}>{status.label}</span>}
                </p>
            </div>
            <div className='flex shrink-0 items-center'>
                <button
                    type='button'
                    onClick={() => step(-1)}
                    disabled={!count}
                    aria-label={`One less ${item.name}`}
                    className='flex h-11 w-11 items-center justify-center rounded-l-xl border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40'
                >
                    <Minus className='h-4 w-4' aria-hidden />
                </button>
                <input
                    type='text'
                    inputMode='numeric'
                    value={value}
                    onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                    aria-label={`${item.name}: how many${item.unit ? ` ${item.unit}` : ''} left`}
                    placeholder='–'
                    className='h-11 w-16 border-y border-gray-300 text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600'
                />
                <button
                    type='button'
                    onClick={() => step(1)}
                    aria-label={`One more ${item.name}`}
                    className='flex h-11 w-11 items-center justify-center rounded-r-xl border border-gray-300 bg-gray-50 hover:bg-gray-100'
                >
                    <Plus className='h-4 w-4' aria-hidden />
                </button>
            </div>
        </li>
    );
}

function FinishDialog({ items, counts, currentUser, redo, onClose, onSaved }) {
    const plan = useMemo(() => planFromCounts(items, counts), [items, counts]);
    const [note, setNote] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    async function save(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            await api('/api/admin/daily/checks', jsonRequest('POST', { employeeId: currentUser?.id, employeeName: currentUser?.name, counts, note }));
            onSaved();
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    }

    return (
        <Dialog title={redo ? 'Replace tonight’s check?' : 'Finish tonight’s check?'} onClose={onClose} onSubmit={save}>
            <div className='space-y-4'>
                <Result plan={plan} compact />
                <label className='block'>
                    <span className='mb-1 block text-sm font-semibold'>Note for the morning (optional)</span>
                    <input type='text' value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={inputClass} placeholder='e.g. Freezer door sticks' />
                </label>
                {redo && <p className='text-sm text-gray-600'>This replaces tonight’s earlier check and its make list.</p>}
                <ErrorText error={error} />
                <button type='submit' disabled={saving} className='w-full rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80 disabled:opacity-40'>
                    {saving ? 'Saving…' : 'Save check'}
                </button>
            </div>
        </Dialog>
    );
}

/** What a check says: the make list and what's running low. */
function Result({ plan, note, compact = false }) {
    const card = compact ? 'rounded-xl bg-gray-50 p-3' : 'rounded-xl bg-white p-4 shadow-sm';
    return (
        <div className='space-y-3'>
            <section aria-label='Make tomorrow' className={card}>
                <h3 className='font-semibold'>Make tomorrow</h3>
                {plan.make.length === 0 ? (
                    <p className='mt-1 text-sm text-gray-600'>Nothing to make. Everything is at its target.</p>
                ) : (
                    <ul className='mt-2 space-y-1.5'>
                        {plan.make.map((item) => (
                            <li key={item.id} className='flex items-baseline justify-between gap-3 text-sm'>
                                <span className='font-medium'>{item.name}</span>
                                <span className='text-right'>
                                    <span className='font-semibold'>Make {amount(item.quantity, item.unit)}</span>
                                    <span className='block text-gray-600'>
                                        have {item.count} of {item.target}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            <section aria-label='Running low' className={card}>
                <h3 className='font-semibold'>Running low</h3>
                {plan.low.length === 0 ? (
                    <p className='mt-1 text-sm text-gray-600'>Nothing running low.</p>
                ) : (
                    <ul className='mt-2 space-y-1.5'>
                        {plan.low.map((item) => (
                            <li key={item.id} className='flex items-baseline justify-between gap-3 text-sm'>
                                <span className='font-medium'>{item.name}</span>
                                <span className='flex items-center gap-2'>
                                    <span className='text-gray-700'>
                                        {amount(item.count, item.unit)} left (target {item.target})
                                    </span>
                                    {item.out && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP.out}`}>Out</span>}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            {note && (
                <p className={`${card} text-sm`}>
                    <span className='font-semibold'>Note: </span>
                    {note}
                </p>
            )}
        </div>
    );
}

// ── editing the list ─────────────────────────────────────────────────────────

function EditList({ items, onAdd, onEdit }) {
    return (
        <>
            <button type='button' onClick={onAdd} className='w-full rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80'>
                + Add item
            </button>
            {GROUPS.map((group) => {
                const groupItems = items.filter((item) => item.kind === group.kind);
                return (
                    <section key={group.kind} aria-labelledby={`edit-${group.kind}`} className='overflow-hidden rounded-xl bg-white shadow-sm'>
                        <div className='border-b border-gray-100 px-4 py-3'>
                            <h3 id={`edit-${group.kind}`} className='font-semibold'>
                                {group.title}
                            </h3>
                            <p className='text-sm text-gray-600'>{group.hint}</p>
                        </div>
                        {groupItems.length === 0 ? (
                            <p className='px-4 py-3 text-sm text-gray-600'>None yet.</p>
                        ) : (
                            <ul className='divide-y divide-gray-100'>
                                {groupItems.map((item) => (
                                    <li key={item.id}>
                                        <button type='button' onClick={() => onEdit(item)} className='flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50'>
                                            <span className='min-w-0 flex-1'>
                                                <span className='block font-medium'>{item.name}</span>
                                                <span className='block text-sm text-gray-600'>
                                                    {item.target > 0 ? `Target ${amount(item.target, item.unit)}` : `No target${item.unit ? ` · ${item.unit}` : ''}`}
                                                </span>
                                            </span>
                                            <Pencil className='h-4 w-4 shrink-0 text-gray-500' aria-hidden />
                                            <span className='sr-only'>Edit</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                );
            })}
        </>
    );
}

function ItemDialog({ item, onClose, onSaved }) {
    const [form, setForm] = useState({
        name: item?.name ?? '',
        kind: item?.kind ?? 'make',
        unit: item?.unit ?? '',
        target: item ? String(item.target) : '',
    });
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

    const run = async (request) => {
        setSaving(true);
        setError('');
        try {
            await request();
            onSaved();
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    };
    const save = (event) => {
        event.preventDefault();
        run(() => (item ? api(`/api/admin/daily/items/${item.id}`, jsonRequest('PATCH', form)) : api('/api/admin/daily/items', jsonRequest('POST', form))));
    };
    const remove = () => {
        if (!confirm(`Stop counting ${item.name}? Past checks keep it.`)) return;
        run(() => api(`/api/admin/daily/items/${item.id}`, { method: 'DELETE' }));
    };

    return (
        <Dialog title={item ? 'Edit item' : 'Add an item to count'} onClose={onClose} onSubmit={save}>
            <div className='space-y-4'>
                <label className='block'>
                    <span className='mb-1 block text-sm font-semibold'>Item</span>
                    <input type='text' required value={form.name} onChange={set('name')} maxLength={80} className={inputClass} placeholder='e.g. Boba pearls' />
                </label>
                <fieldset>
                    <legend className='mb-1 text-sm font-semibold'>What is it?</legend>
                    <div className='grid grid-cols-2 gap-2'>
                        {[
                            ['make', 'Made in-house', 'Goes on the make list'],
                            ['buy', 'Supply', 'Shows as running low'],
                        ].map(([kind, label, hint]) => (
                            <label key={kind} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${form.kind === kind ? 'border-black bg-gray-50' : 'border-gray-300'}`}>
                                <input type='radio' name='kind' value={kind} checked={form.kind === kind} onChange={set('kind')} className='mt-1 h-4 w-4' />
                                <span>
                                    <span className='block font-semibold'>{label}</span>
                                    <span className='block text-sm text-gray-600'>{hint}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
                <div className='grid grid-cols-2 gap-3'>
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Counted in</span>
                        <input type='text' value={form.unit} onChange={set('unit')} maxLength={30} className={inputClass} placeholder='tubs, bags…' />
                    </label>
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Target</span>
                        <input
                            type='text'
                            inputMode='numeric'
                            value={form.target}
                            onChange={(e) => setForm((prev) => ({ ...prev, target: e.target.value.replace(/[^\d]/g, '').slice(0, 5) }))}
                            className={inputClass}
                            placeholder='0'
                        />
                    </label>
                </div>
                <p className='text-sm text-gray-600'>
                    {form.kind === 'make'
                        ? 'How much to have ready each day. If fewer are left at closing, the difference goes on tomorrow’s make list.'
                        : 'If fewer than this are left at closing, it shows as running low.'}{' '}
                    Leave it at 0 to just count it.
                </p>
                <ErrorText error={error} />
                <button type='submit' disabled={saving || !form.name.trim()} className='w-full rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80 disabled:opacity-40'>
                    {saving ? 'Saving…' : item ? 'Save' : 'Add item'}
                </button>
                {item && (
                    <button type='button' onClick={remove} disabled={saving} className='w-full rounded-xl border border-red-200 py-3 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40'>
                        Remove from the check
                    </button>
                )}
            </div>
        </Dialog>
    );
}
