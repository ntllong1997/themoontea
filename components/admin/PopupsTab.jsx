'use client';

// The body of /admin/popups: the dates on the customer pop-up calendar.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Copy, Loader2, MapPin, Clock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { dateKey, formatTime, parseDate } from '@/lib/site/popups';
import { api, jsonRequest } from '@/lib/site/adminApi';
import CalendarSubscribe from '@/components/admin/CalendarSubscribe';
import Dialog from '@/components/admin/Dialog';

const inputClass =
    'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 focus:border-black focus:outline-none focus:ring-2 focus:ring-blue-600';

const longDate = (key) =>
    parseDate(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

const byWhen = (a, b) => (a.date + a.start).localeCompare(b.date + b.start);

export default function PopupsTab() {
    const [popups, setPopups] = useState(null);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null); // a pop-up, or a draft without an id
    const [showPast, setShowPast] = useState(false);

    const load = useCallback(async () => {
        try {
            setPopups((await api('/api/admin/popups')).popups);
            setError('');
        } catch (e) {
            setError(e.message);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const today = dateKey(new Date());
    const upcoming = useMemo(() => (popups ?? []).filter((p) => p.date >= today).sort(byWhen), [popups, today]);
    const past = useMemo(() => (popups ?? []).filter((p) => p.date < today).sort(byWhen).reverse(), [popups, today]);

    return (
        <>
            <div className='mx-auto max-w-3xl space-y-4 px-4 pt-4'>
                <p className='text-sm text-gray-500'>
                    These show on the pop-up calendar on the customer menu. Past dates disappear from it on their
                    own.
                </p>

                <CalendarSubscribe />

                {error && (
                    <div role='alert' className='flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800'>
                        <span className='flex-1'>{error}</span>
                        <button type='button' onClick={() => setError('')} aria-label='Dismiss message' className='-m-1 rounded p-1'>
                            <X className='h-4 w-4' aria-hidden />
                        </button>
                    </div>
                )}

                {popups === null && !error && (
                    <div className='flex justify-center py-16 text-gray-500' role='status'>
                        <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                        <span className='sr-only'>Loading pop-ups…</span>
                    </div>
                )}

                {popups && upcoming.length === 0 && (
                    <div className='rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center'>
                        <CalendarPlus className='mx-auto h-8 w-8 text-gray-300' />
                        <p className='mt-2 font-semibold'>No upcoming pop-ups</p>
                        <p className='text-sm text-gray-500'>
                            Customers see “New dates coming soon” until you add one.
                        </p>
                    </div>
                )}

                <ul className='space-y-2'>
                    {upcoming.map((popup) => (
                        <PopupRow key={popup.id} popup={popup} isToday={popup.date === today} onEdit={() => setEditing(popup)} />
                    ))}
                </ul>

                {past.length > 0 && (
                    <div className='pt-2'>
                        <button
                            type='button'
                            onClick={() => setShowPast((v) => !v)}
                            aria-expanded={showPast}
                            className='text-sm font-semibold text-gray-500 hover:text-gray-800'
                        >
                            {showPast ? 'Hide' : 'Show'} past pop-ups ({past.length})
                        </button>
                        {showPast && (
                            <ul className='mt-2 space-y-2'>
                                {past.map((popup) => (
                                    <PopupRow key={popup.id} popup={popup} onEdit={() => setEditing(popup)} />
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {popups && (
                <button
                    type='button'
                    onClick={() => setEditing({})}
                    className='fixed bottom-5 right-5 flex items-center gap-2 rounded-full bg-black px-5 py-4 font-semibold text-white shadow-lg transition-opacity hover:opacity-80'
                >
                    <Plus className='h-5 w-5' /> Add pop-up
                </button>
            )}

            {editing && (
                <PopupEditor
                    // A duplicate swaps in a new draft; re-key so the form resets.
                    key={editing.id ?? `draft-${editing.name ?? ''}`}
                    popup={editing}
                    onClose={() => setEditing(null)}
                    onDuplicate={(draft) => setEditing(draft)}
                    onSaved={(saved) => {
                        setPopups((all) =>
                            all.some((p) => p.id === saved.id) ? all.map((p) => (p.id === saved.id ? saved : p)) : [...all, saved]
                        );
                        setEditing(null);
                    }}
                    onDeleted={(id) => {
                        setPopups((all) => all.filter((p) => p.id !== id));
                        setEditing(null);
                    }}
                />
            )}
        </>
    );
}

function PopupRow({ popup, isToday, onEdit }) {
    const date = parseDate(popup.date);
    return (
        <li>
            <button
                type='button'
                onClick={onEdit}
                aria-label={`Edit ${popup.name}, ${longDate(popup.date)}, ${formatTime(popup.start)} to ${formatTime(popup.end)}, ${popup.place}`}
                className='flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-gray-200 hover:ring-gray-400'
            >
                <div className='flex w-14 shrink-0 flex-col items-center rounded-xl bg-gray-900 py-1.5 text-white'>
                    <span className='text-[10px] font-bold uppercase tracking-wider'>
                        {date.toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <span className='text-xl font-bold leading-none'>{date.getDate()}</span>
                    <span className='text-[10px] font-semibold'>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                </div>
                <div className='min-w-0 flex-1'>
                    <p className='flex items-center gap-2 font-semibold'>
                        <span className='truncate'>{popup.name}</span>
                        {isToday && <span className='rounded-full bg-green-700 px-2 py-0.5 text-xs text-white'>Today</span>}
                    </p>
                    <p className='flex items-center gap-1 text-sm text-gray-500'>
                        <Clock className='h-3.5 w-3.5 shrink-0' /> {formatTime(popup.start)} – {formatTime(popup.end)}
                    </p>
                    <p className='flex items-center gap-1 truncate text-sm text-gray-500'>
                        <MapPin className='h-3.5 w-3.5 shrink-0' /> {popup.place}
                    </p>
                </div>
                <Pencil className='h-4 w-4 shrink-0 text-gray-500' />
            </button>
        </li>
    );
}

function PopupEditor({ popup, onClose, onDuplicate, onSaved, onDeleted }) {
    const isNew = !popup.id;
    const [form, setForm] = useState({
        date: popup.date ?? '',
        start: popup.start ?? '11:00',
        end: popup.end ?? '16:00',
        name: popup.name ?? '',
        place: popup.place ?? '',
        address: popup.address ?? '',
        note: popup.note ?? '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

    async function save(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const { popup: saved } = isNew
                ? await api('/api/admin/popups', jsonRequest('POST', form))
                : await api(`/api/admin/popups/${popup.id}`, jsonRequest('PATCH', form));
            onSaved(saved);
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    }

    async function remove() {
        if (!window.confirm(`Delete “${popup.name}” on ${longDate(popup.date)}?`)) return;
        setSaving(true);
        try {
            await api(`/api/admin/popups/${popup.id}`, { method: 'DELETE' });
            onDeleted(popup.id);
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    }

    return (
        <Dialog title={isNew ? 'Add pop-up' : 'Edit pop-up'} onClose={onClose} onSubmit={save}>
                <div className='space-y-4'>
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Date</span>
                        <input type='date' required value={form.date} onChange={set('date')} className={inputClass} />
                    </label>
                    <div className='grid grid-cols-2 gap-3'>
                        <label className='block'>
                            <span className='mb-1 block text-sm font-semibold'>Starts</span>
                            <input type='time' required value={form.start} onChange={set('start')} className={inputClass} />
                        </label>
                        <label className='block'>
                            <span className='mb-1 block text-sm font-semibold'>Ends</span>
                            <input type='time' required value={form.end} onChange={set('end')} className={inputClass} />
                        </label>
                    </div>
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Event name</span>
                        <input
                            required
                            value={form.name}
                            onChange={set('name')}
                            maxLength={80}
                            className={inputClass}
                            placeholder='e.g. Sunday Farmers Market'
                        />
                    </label>
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Place</span>
                        <input
                            required
                            value={form.place}
                            onChange={set('place')}
                            maxLength={120}
                            className={inputClass}
                            placeholder='e.g. Riverside Park'
                        />
                    </label>
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>
                            Address <span className='font-normal text-gray-500'>(optional, for the Directions button)</span>
                        </span>
                        <input
                            value={form.address}
                            onChange={set('address')}
                            maxLength={200}
                            className={inputClass}
                            placeholder='e.g. 123 Main St, Springfield'
                        />
                    </label>
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>
                            Note <span className='font-normal text-gray-500'>(optional)</span>
                        </span>
                        <input
                            value={form.note}
                            onChange={set('note')}
                            maxLength={300}
                            className={inputClass}
                            placeholder='e.g. Look for the moon flag!'
                        />
                    </label>

                    {error && <p role='alert' className='rounded-xl bg-red-50 p-3 text-sm text-red-800'>{error}</p>}

                    <div className='flex gap-3 pt-2'>
                        {!isNew && (
                            <>
                                <button
                                    type='button'
                                    onClick={remove}
                                    disabled={saving}
                                    aria-label='Delete pop-up'
                                    className='rounded-xl border border-red-200 px-4 text-red-600 hover:bg-red-50 disabled:opacity-40'
                                >
                                    <Trash2 className='h-5 w-5' />
                                </button>
                                <button
                                    type='button'
                                    // Same event, new date: keep everything but the date.
                                    onClick={() => onDuplicate({ ...form, date: '' })}
                                    disabled={saving}
                                    aria-label='Copy to a new date'
                                    title='Copy to a new date'
                                    className='rounded-xl border border-gray-200 px-4 text-gray-600 hover:bg-gray-50 disabled:opacity-40'
                                >
                                    <Copy className='h-5 w-5' />
                                </button>
                            </>
                        )}
                        <button
                            type='submit'
                            disabled={saving}
                            className='flex-1 rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80 disabled:opacity-40'
                        >
                            {saving ? 'Saving…' : isNew ? 'Add to calendar' : 'Save changes'}
                        </button>
                    </div>
                </div>
        </Dialog>
    );
}
