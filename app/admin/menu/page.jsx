'use client';

// Staff page for the customer menu: mark items sold out or hidden, reorder
// them, and add or edit items with a photo (app/api/admin/menu/). Its sister
// page /admin/popups edits the pop-up calendar.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowUp, Camera, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { SECTIONS, STATUSES, categoryTitle, formatPrice } from '@/lib/site/menu';
import { resizePhoto } from '@/lib/site/resizePhoto';
import AdminShell from '@/components/admin/AdminShell';
import Dialog from '@/components/admin/Dialog';
import { api, jsonRequest } from '@/lib/site/adminApi';

const NEW_CATEGORY = '__new__';

const STATUS_STYLE = {
    available: 'bg-green-700 text-white',
    sold_out: 'bg-amber-700 text-white',
    hidden: 'bg-gray-700 text-white',
};

export default function AdminMenuPage() {
    // Old bookmarks of the pop-ups tab (/admin/menu?tab=popups) go to its own page.
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('tab') === 'popups') window.location.replace('/admin/popups');
    }, []);

    return (
        <AdminShell active='items' title='Menu Items'>
            <MenuItemsTab />
        </AdminShell>
    );
}

function MenuItemsTab() {
    const [items, setItems] = useState(null);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null); // an item, or {} for a new one

    const load = useCallback(async () => {
        try {
            const { items } = await api('/api/admin/menu');
            setItems(items);
            setError('');
        } catch (e) {
            setError(e.message);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Known categories first, in page order, then any others items use.
    const categories = useMemo(() => {
        const used = [...new Set((items ?? []).map((i) => i.category))];
        return [...SECTIONS.map((s) => s.id), ...used.filter((c) => !SECTIONS.some((s) => s.id === c))];
    }, [items]);

    const grouped = useMemo(
        () =>
            categories
                .map((category) => ({
                    category,
                    items: (items ?? [])
                        .filter((i) => i.category === category)
                        .sort((a, b) => a.sort_order - b.sort_order),
                }))
                .filter((group) => group.items.length > 0),
        [categories, items]
    );

    const replaceItem = (updated) => setItems((all) => all.map((i) => (i.id === updated.id ? updated : i)));

    async function setStatus(item, status) {
        const previous = item.status;
        replaceItem({ ...item, status });
        try {
            replaceItem((await api(`/api/admin/menu/${item.id}`, jsonRequest('PATCH', { status }))).item);
        } catch (e) {
            replaceItem({ ...item, status: previous });
            setError(e.message);
        }
    }

    async function move(group, index, direction) {
        const other = group.items[index + direction];
        const item = group.items[index];
        if (!other) return;
        // Swap positions; if two items share a position, nudge them apart.
        const [a, b] =
            item.sort_order === other.sort_order
                ? [other.sort_order + direction, item.sort_order]
                : [other.sort_order, item.sort_order];
        replaceItem({ ...item, sort_order: a });
        replaceItem({ ...other, sort_order: b });
        try {
            await Promise.all([
                api(`/api/admin/menu/${item.id}`, jsonRequest('PATCH', { sort_order: a })),
                api(`/api/admin/menu/${other.id}`, jsonRequest('PATCH', { sort_order: b })),
            ]);
        } catch (e) {
            setError(e.message);
            load();
        }
    }

    return (
        <>
            <div className='mx-auto max-w-3xl space-y-6 px-4 pt-4'>
                <p className='text-sm text-gray-500'>
                    <b className='text-green-700'>Available</b> shows normally. <b className='text-amber-700'>Sold out</b>{' '}
                    stays on the menu, greyed out. <b className='text-gray-700'>Hidden</b> takes it off the menu.
                    Changes show on the menu right away.
                </p>

                {error && (
                    <div role='alert' className='flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800'>
                        <span className='flex-1'>{error}</span>
                        <button type='button' onClick={() => setError('')} aria-label='Dismiss message' className='-m-1 rounded p-1'>
                            <X className='h-4 w-4' aria-hidden />
                        </button>
                    </div>
                )}

                {items === null && !error && (
                    <div className='flex justify-center py-16 text-gray-500' role='status'>
                        <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                        <span className='sr-only'>Loading menu items…</span>
                    </div>
                )}

                {grouped.map((group) => (
                    <section key={group.category}>
                        <h2 className='mb-2 text-sm font-bold uppercase tracking-wide text-gray-500'>
                            {categoryTitle(group.category)}
                        </h2>
                        <ul className='space-y-2'>
                            {group.items.map((item, index) => (
                                <ItemRow
                                    key={item.id}
                                    item={item}
                                    isFirst={index === 0}
                                    isLast={index === group.items.length - 1}
                                    onStatus={(status) => setStatus(item, status)}
                                    onMove={(direction) => move(group, index, direction)}
                                    onEdit={() => setEditing(item)}
                                />
                            ))}
                        </ul>
                    </section>
                ))}

                {items?.length === 0 && <p className='py-12 text-center text-gray-500'>No items yet.</p>}
            </div>

            {items && (
                <button
                    type='button'
                    onClick={() => setEditing({})}
                    className='fixed bottom-5 right-5 flex items-center gap-2 rounded-full bg-black px-5 py-4 font-semibold text-white shadow-lg transition-opacity hover:opacity-80'
                >
                    <Plus className='h-5 w-5' /> Add item
                </button>
            )}

            {editing && (
                <ItemEditor
                    item={editing}
                    categories={categories}
                    onClose={() => setEditing(null)}
                    onSaved={(saved) => {
                        setItems((all) =>
                            all.some((i) => i.id === saved.id) ? all.map((i) => (i.id === saved.id ? saved : i)) : [...all, saved]
                        );
                        setEditing(null);
                    }}
                    onDeleted={(id) => {
                        setItems((all) => all.filter((i) => i.id !== id));
                        setEditing(null);
                    }}
                />
            )}
        </>
    );
}

function Thumb({ src, className = '' }) {
    return (
        <div className={`relative shrink-0 overflow-hidden rounded-xl bg-gray-100 ${className}`}>
            {src ? (
                <Image src={src} alt='' fill sizes='96px' unoptimized className='object-contain' />
            ) : (
                <Camera className='absolute inset-0 m-auto h-5 w-5 text-gray-300' />
            )}
        </div>
    );
}

function ItemRow({ item, isFirst, isLast, onStatus, onMove, onEdit }) {
    return (
        // Hidden rows get a dashed outline rather than fading, so their text keeps full contrast.
        <li className={`rounded-2xl p-3 shadow-sm ${item.status === 'hidden' ? 'border-2 border-dashed border-gray-300 bg-gray-50' : 'bg-white ring-1 ring-gray-200'}`}>
            <div className='flex items-center gap-3'>
                <Thumb src={item.image_url} className='h-14 w-14' />
                <button type='button' onClick={onEdit} className='min-w-0 flex-1 text-left'>
                    <p className='truncate font-semibold'>{item.name}</p>
                    <p className='text-sm text-gray-500'>{formatPrice(item.price, item.price_note) ?? 'No price'}</p>
                </button>
                <div className='flex flex-col'>
                    <button
                        type='button'
                        onClick={() => onMove(-1)}
                        disabled={isFirst}
                        aria-label={`Move ${item.name} up`}
                        className='rounded p-1 text-gray-500 hover:text-black disabled:opacity-20'
                    >
                        <ArrowUp className='h-4 w-4' />
                    </button>
                    <button
                        type='button'
                        onClick={() => onMove(1)}
                        disabled={isLast}
                        aria-label={`Move ${item.name} down`}
                        className='rounded p-1 text-gray-500 hover:text-black disabled:opacity-20'
                    >
                        <ArrowDown className='h-4 w-4' />
                    </button>
                </div>
                <button
                    type='button'
                    onClick={onEdit}
                    aria-label={`Edit ${item.name}`}
                    className='rounded-full p-2 text-gray-500 hover:bg-gray-100'
                >
                    <Pencil className='h-4 w-4' />
                </button>
            </div>
            <div role='group' aria-label={`${item.name} status`} className='mt-3 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1'>
                {STATUSES.map((status) => (
                    <button
                        key={status.value}
                        type='button'
                        onClick={() => item.status !== status.value && onStatus(status.value)}
                        aria-pressed={item.status === status.value}
                        className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                            item.status === status.value ? STATUS_STYLE[status.value] : 'text-gray-600 hover:bg-white'
                        }`}
                    >
                        {status.label}
                    </button>
                ))}
            </div>
        </li>
    );
}

const inputClass =
    'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 focus:border-black focus:outline-none focus:ring-2 focus:ring-blue-600';

function ItemEditor({ item, categories, onClose, onSaved, onDeleted }) {
    const isNew = !item.id;
    const [form, setForm] = useState({
        name: item.name ?? '',
        description: item.description ?? '',
        price: item.price ?? '',
        price_note: item.price_note ?? null,
        category: item.category ?? categories[0] ?? 'boba',
        newCategory: '',
        image_url: item.image_url ?? '',
        status: item.status ?? 'available',
        tags: (item.tags ?? []).join(', '),
    });
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const fileInput = useRef(null);

    const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

    async function pickPhoto(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setUploading(true);
        setError('');
        try {
            const photo = await resizePhoto(file);
            const body = new FormData();
            body.append('photo', photo, `photo.${photo.type === 'image/webp' ? 'webp' : 'jpg'}`);
            const { url } = await api('/api/admin/menu/photo', { method: 'POST', body });
            setForm((f) => ({ ...f, image_url: url }));
        } catch (e) {
            setError(e.message);
        }
        setUploading(false);
    }

    async function save(event) {
        event.preventDefault();
        const category = form.category === NEW_CATEGORY ? form.newCategory.trim() : form.category;
        if (!category) return setError('Type a name for the new category');
        setSaving(true);
        setError('');
        const payload = {
            name: form.name,
            description: form.description,
            price: form.price === '' ? null : form.price,
            price_note: form.price_note,
            category,
            image_url: form.image_url || null,
            status: form.status,
            tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        };
        try {
            const { item: saved } = isNew
                ? await api('/api/admin/menu', jsonRequest('POST', payload))
                : await api(`/api/admin/menu/${item.id}`, jsonRequest('PATCH', payload));
            onSaved(saved);
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    }

    async function remove() {
        if (!window.confirm(`Delete “${item.name}” for good? To take it off the menu for now, use Hidden instead.`)) return;
        setSaving(true);
        try {
            await api(`/api/admin/menu/${item.id}`, { method: 'DELETE' });
            onDeleted(item.id);
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    }

    return (
        <Dialog title={isNew ? 'Add item' : 'Edit item'} onClose={onClose} onSubmit={save}>
                <div className='space-y-4'>
                    <div className='flex items-center gap-4'>
                        <button
                            type='button'
                            onClick={() => fileInput.current?.click()}
                            className='relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-black'
                            aria-label={form.image_url ? 'Change photo' : 'Add photo'}
                        >
                            {form.image_url ? (
                                <Image src={form.image_url} alt='' fill sizes='112px' unoptimized className='object-contain' />
                            ) : (
                                <Camera className='absolute inset-0 m-auto h-7 w-7 text-gray-500' />
                            )}
                            {uploading && (
                                <span className='absolute inset-0 flex items-center justify-center bg-white/70' role='status'>
                                    <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                                    <span className='sr-only'>Uploading photo…</span>
                                </span>
                            )}
                        </button>
                        <div className='space-y-2 text-sm'>
                            <button
                                type='button'
                                onClick={() => fileInput.current?.click()}
                                disabled={uploading}
                                className='font-semibold text-blue-600 hover:underline'
                            >
                                {form.image_url ? 'Change photo' : 'Upload photo'}
                            </button>
                            {form.image_url && (
                                <button
                                    type='button'
                                    onClick={() => setForm((f) => ({ ...f, image_url: '' }))}
                                    className='block text-gray-500 hover:underline'
                                >
                                    Remove photo
                                </button>
                            )}
                            <p className='text-gray-500'>Best on a plain white background.</p>
                        </div>
                        <input ref={fileInput} type='file' accept='image/*' onChange={pickPhoto} className='hidden' />
                    </div>

                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Name</span>
                        <input required value={form.name} onChange={set('name')} maxLength={80} className={inputClass} placeholder='e.g. Thai Tea' />
                    </label>

                    <div className='grid grid-cols-2 gap-3'>
                        <label className='block'>
                            <span className='mb-1 block text-sm font-semibold'>Price ($)</span>
                            <input
                                type='number'
                                inputMode='decimal'
                                min='0'
                                step='0.01'
                                value={form.price}
                                onChange={set('price')}
                                className={inputClass}
                                placeholder='8'
                            />
                        </label>
                        <label className='block'>
                            <span className='mb-1 block text-sm font-semibold'>Category</span>
                            <select value={form.category} onChange={set('category')} className={inputClass}>
                                {categories.map((c) => (
                                    <option key={c} value={c}>
                                        {categoryTitle(c)}
                                    </option>
                                ))}
                                <option value={NEW_CATEGORY}>+ New category…</option>
                            </select>
                        </label>
                    </div>
                    <label className='flex items-center gap-2 text-sm text-gray-600'>
                        <input
                            type='checkbox'
                            checked={form.price_note === 'from'}
                            onChange={(e) => setForm((f) => ({ ...f, price_note: e.target.checked ? 'from' : null }))}
                        />
                        Show as “from” price (e.g. “from $5”)
                    </label>
                    {form.category === NEW_CATEGORY && (
                        <input
                            autoFocus
                            value={form.newCategory}
                            onChange={set('newCategory')}
                            maxLength={40}
                            aria-label='New category name'
                            className={inputClass}
                            placeholder='New category name, e.g. Smoothies'
                        />
                    )}

                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Description</span>
                        <textarea
                            value={form.description}
                            onChange={set('description')}
                            maxLength={500}
                            rows={3}
                            className={inputClass}
                            placeholder='What customers should know about it'
                        />
                    </label>

                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Tags</span>
                        <input
                            value={form.tags}
                            onChange={set('tags')}
                            className={inputClass}
                            placeholder='Comma separated, e.g. New, Best seller'
                        />
                    </label>

                    <div role='group' aria-labelledby='item-status-label'>
                        <span id='item-status-label' className='mb-1 block text-sm font-semibold'>Status</span>
                        <div className='grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1'>
                            {STATUSES.map((status) => (
                                <button
                                    key={status.value}
                                    type='button'
                                    onClick={() => setForm((f) => ({ ...f, status: status.value }))}
                                    aria-pressed={form.status === status.value}
                                    className={`rounded-lg py-2 text-sm font-semibold ${
                                        form.status === status.value ? STATUS_STYLE[status.value] : 'text-gray-600'
                                    }`}
                                >
                                    {status.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && <p role='alert' className='rounded-xl bg-red-50 p-3 text-sm text-red-800'>{error}</p>}

                    <div className='flex gap-3 pt-2'>
                        {!isNew && (
                            <button
                                type='button'
                                onClick={remove}
                                disabled={saving}
                                aria-label='Delete item'
                                className='rounded-xl border border-red-200 px-4 text-red-600 hover:bg-red-50 disabled:opacity-40'
                            >
                                <Trash2 className='h-5 w-5' />
                            </button>
                        )}
                        <button
                            type='submit'
                            disabled={saving || uploading}
                            className='flex-1 rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80 disabled:opacity-40'
                        >
                            {saving ? 'Saving…' : isNew ? 'Add to menu' : 'Save changes'}
                        </button>
                    </div>
                </div>
        </Dialog>
    );
}
