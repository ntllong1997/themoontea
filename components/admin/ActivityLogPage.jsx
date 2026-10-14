'use client';

// /admin/logs: what the iPad app has been doing — printer and card-reader
// connections, prints, payments, orders, station taps — newest first, live.
// The iPad writes the entries (MoonTea/…/Services/ActivityLog.swift); this
// page reads them through /api/admin/logs.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, Loader2, Pause, Play, Search, X } from 'lucide-react';
import { api } from '@/lib/site/adminApi';
import {
    CATEGORIES,
    LEVEL_FILTERS,
    deviceLabel,
    latestReceivedAt,
    mergeEntries,
    todayKey,
} from '@/lib/logs/activityLog';

const POLL_MS = 3000;

const CATEGORY_ICONS = {
    printer: '🖨️',
    reader: '💳',
    payment: '💵',
    order: '🧾',
    station: '🧋',
    sync: '🔄',
    app: '📱',
};

const LEVEL_STYLES = {
    error: 'bg-red-100 text-red-800',
    warning: 'bg-amber-100 text-amber-900',
    info: 'bg-gray-100 text-gray-700',
    debug: 'bg-gray-50 text-gray-500',
};

const ROW_STYLES = {
    error: 'border-l-4 border-l-red-500',
    warning: 'border-l-4 border-l-amber-400',
    info: 'border-l-4 border-l-transparent',
    debug: 'border-l-4 border-l-transparent opacity-70',
};

const selectClass =
    'rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-blue-600';

const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export default function ActivityLogPage() {
    // '' means "today" until the server tells us which day that is.
    const [day, setDay] = useState('');
    const [level, setLevel] = useState('all');
    const [category, setCategory] = useState('');
    const [device, setDevice] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [live, setLive] = useState(true);

    const [entries, setEntries] = useState(null);
    const [meta, setMeta] = useState({ day: '', timeZone: '', truncated: false });
    const [error, setError] = useState('');
    const [lastChecked, setLastChecked] = useState(null);
    const [fresh, setFresh] = useState(() => new Set());

    const cursor = useRef(null);
    // Ids already on screen, to tell which polled entries are new.
    const known = useRef(new Set());
    // Ignores responses to requests made before the filters last changed.
    const generation = useRef(0);

    // Type, pause, then search — not one request per keystroke.
    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const query = useMemo(() => {
        const params = new URLSearchParams();
        if (day) params.set('day', day);
        if (level !== 'all') params.set('level', level);
        if (category) params.set('category', category);
        if (device) params.set('device', device);
        if (search) params.set('q', search);
        return params;
    }, [day, level, category, device, search]);

    const load = useCallback(async () => {
        const mine = ++generation.current;
        setEntries(null);
        setFresh(new Set());
        setError('');
        try {
            const body = await api(`/api/admin/logs?${query}`);
            if (mine !== generation.current) return;
            setEntries(body.entries);
            known.current = new Set(body.entries.map((e) => e.id));
            setMeta({ day: body.day, timeZone: body.timeZone, truncated: body.truncated });
            cursor.current = latestReceivedAt(body.entries) ?? new Date().toISOString();
            setLastChecked(new Date());
        } catch (e) {
            if (mine === generation.current && e.message !== 'Signed out') setError(e.message);
        }
    }, [query]);

    useEffect(() => {
        load();
    }, [load]);

    const viewingToday = !day || (meta.timeZone && day === todayKey(new Date(), meta.timeZone));
    const polling = live && viewingToday && entries !== null && !error;

    useEffect(() => {
        if (!polling) return undefined;
        const mine = generation.current;
        let busy = false;
        const tick = async () => {
            if (busy || document.visibilityState !== 'visible') return;
            busy = true;
            try {
                const params = new URLSearchParams(query);
                params.set('since', cursor.current);
                const body = await api(`/api/admin/logs?${params}`);
                if (mine !== generation.current) return;
                const added = body.entries.filter((e) => !known.current.has(e.id));
                if (added.length) {
                    for (const e of added) known.current.add(e.id);
                    setEntries((current) => mergeEntries(current ?? [], added));
                    setFresh(new Set(added.map((e) => e.id)));
                    const newest = latestReceivedAt(body.entries);
                    if (newest && Date.parse(newest) > Date.parse(cursor.current)) cursor.current = newest;
                }
                setLastChecked(new Date());
            } catch {
                // A missed poll is fine; the next one picks up from the same cursor.
            } finally {
                busy = false;
            }
        };
        const timer = setInterval(tick, POLL_MS);
        return () => clearInterval(timer);
    }, [polling, query]);

    // New rows glow briefly so they're easy to spot.
    useEffect(() => {
        if (!fresh.size) return undefined;
        const timer = setTimeout(() => setFresh(new Set()), 2500);
        return () => clearTimeout(timer);
    }, [fresh]);

    const devices = useMemo(() => {
        const seen = new Map();
        for (const entry of entries ?? []) {
            if (!seen.has(entry.deviceId)) seen.set(entry.deviceId, deviceLabel(entry));
        }
        if (device && !seen.has(device)) seen.set(device, device.slice(0, 4));
        return [...seen];
    }, [entries, device]);

    const counts = useMemo(() => {
        const c = { error: 0, warning: 0 };
        for (const entry of entries ?? []) if (entry.level in c) c[entry.level] += 1;
        return c;
    }, [entries]);

    const timeFormat = useMemo(
        () =>
            new Intl.DateTimeFormat('en-US', {
                timeZone: meta.timeZone || undefined,
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
            }),
        [meta.timeZone]
    );

    const csvHref = useMemo(() => {
        const params = new URLSearchParams(query);
        if (!params.get('day') && meta.day) params.set('day', meta.day);
        params.set('format', 'csv');
        return `/api/admin/logs?${params}`;
    }, [query, meta.day]);

    const filtered = level !== 'all' || category || device || search;
    const clearFilters = () => {
        setLevel('all');
        setCategory('');
        setDevice('');
        setSearchInput('');
        setSearch('');
    };

    return (
        <div className='min-h-screen bg-gray-50 pb-16'>
            <header className='sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur'>
                <div className='mx-auto flex max-w-4xl items-center gap-3 px-4 py-3'>
                    <Link href='/vendor' className='text-sm text-gray-500 hover:text-gray-600'>
                        ← Back
                    </Link>
                    <h1 className='text-xl font-bold'>Activity Log</h1>
                    <LiveStatus polling={polling} live={live} viewingToday={viewingToday} lastChecked={lastChecked} />
                </div>
                <div className='mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 pb-3'>
                    <label className='sr-only' htmlFor='log-day'>
                        Day
                    </label>
                    <input
                        id='log-day'
                        type='date'
                        value={day || meta.day}
                        max={meta.timeZone ? todayKey(new Date(), meta.timeZone) : undefined}
                        onChange={(e) => setDay(e.target.value)}
                        className={selectClass}
                    />
                    <label className='sr-only' htmlFor='log-category'>
                        Category
                    </label>
                    <select id='log-category' value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
                        <option value=''>All activity</option>
                        {CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>
                                {CATEGORY_ICONS[c.id]} {c.label}
                            </option>
                        ))}
                    </select>
                    <label className='sr-only' htmlFor='log-level'>
                        Level
                    </label>
                    <select id='log-level' value={level} onChange={(e) => setLevel(e.target.value)} className={selectClass}>
                        {Object.entries(LEVEL_FILTERS).map(([id, f]) => (
                            <option key={id} value={id}>
                                {f.label}
                            </option>
                        ))}
                    </select>
                    {devices.length > 1 || device ? (
                        <>
                            <label className='sr-only' htmlFor='log-device'>
                                Device
                            </label>
                            <select id='log-device' value={device} onChange={(e) => setDevice(e.target.value)} className={selectClass}>
                                <option value=''>All devices</option>
                                {devices.map(([id, label]) => (
                                    <option key={id} value={id}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </>
                    ) : null}
                    <div className='relative min-w-[10rem] flex-1'>
                        <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400' aria-hidden />
                        <label className='sr-only' htmlFor='log-search'>
                            Search messages or an order number
                        </label>
                        <input
                            id='log-search'
                            type='search'
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder='Search, or an order #'
                            className={`${selectClass} w-full pl-9`}
                        />
                    </div>
                </div>
            </header>

            <main className='mx-auto max-w-4xl space-y-3 px-4 pt-4'>
                {error && (
                    <div role='alert' className='rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800'>
                        <p className='font-bold'>Couldn&apos;t load the activity log</p>
                        <p className='mt-1'>{error}</p>
                        <button type='button' onClick={load} className='mt-3 font-semibold underline'>
                            Try again
                        </button>
                    </div>
                )}

                {entries === null && !error && (
                    <div className='flex justify-center py-16 text-gray-500' role='status'>
                        <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                        <span className='sr-only'>Loading activity…</span>
                    </div>
                )}

                {entries && (
                    <div className='flex flex-wrap items-center gap-2 text-sm'>
                        <span className='text-gray-600'>
                            {entries.length.toLocaleString()} {entries.length === 1 ? 'entry' : 'entries'}
                        </span>
                        {counts.error > 0 && (
                            <span className='rounded-full bg-red-100 px-2.5 py-0.5 font-semibold text-red-800'>
                                {counts.error} {counts.error === 1 ? 'error' : 'errors'}
                            </span>
                        )}
                        {counts.warning > 0 && (
                            <span className='rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-900'>
                                {counts.warning} {counts.warning === 1 ? 'warning' : 'warnings'}
                            </span>
                        )}
                        {filtered && (
                            <button
                                type='button'
                                onClick={clearFilters}
                                className='inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-gray-600 hover:bg-gray-200'
                            >
                                <X className='h-3.5 w-3.5' aria-hidden /> Clear filters
                            </button>
                        )}
                        <span className='ml-auto flex items-center gap-2'>
                            {viewingToday && (
                                <button
                                    type='button'
                                    onClick={() => setLive((v) => !v)}
                                    aria-pressed={live}
                                    className='inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 font-medium hover:bg-gray-50'
                                >
                                    {live ? <Pause className='h-4 w-4' aria-hidden /> : <Play className='h-4 w-4' aria-hidden />}
                                    {live ? 'Pause' : 'Go live'}
                                </button>
                            )}
                            <a
                                href={csvHref}
                                className='inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 font-medium hover:bg-gray-50'
                            >
                                <Download className='h-4 w-4' aria-hidden /> CSV
                            </a>
                        </span>
                    </div>
                )}

                {entries && meta.truncated && (
                    <p className='rounded-xl bg-blue-50 p-3 text-sm text-blue-900'>
                        Showing the newest {entries.length.toLocaleString()}. Narrow the filters, or download the CSV for the
                        whole day.
                    </p>
                )}

                {entries && entries.length === 0 && (
                    <div className='rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600'>
                        <p className='font-semibold'>{filtered ? 'Nothing matches these filters.' : 'No activity this day.'}</p>
                        {!filtered && viewingToday && (
                            <p className='mt-1 text-sm'>
                                Entries appear here a few seconds after they happen on the iPad. If the iPad is in use and
                                nothing shows up, check it&apos;s online.
                            </p>
                        )}
                    </div>
                )}

                {entries && entries.length > 0 && (
                    <ol className='divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white'>
                        {entries.map((entry) => (
                            <LogRow
                                key={entry.id}
                                entry={entry}
                                time={timeFormat.format(new Date(entry.createdAt))}
                                isFresh={fresh.has(entry.id)}
                                showDevice={devices.length > 1}
                                onDevice={() => setDevice(entry.deviceId)}
                            />
                        ))}
                    </ol>
                )}
            </main>
        </div>
    );
}

function LiveStatus({ polling, live, viewingToday, lastChecked }) {
    if (!viewingToday) return null;
    if (!live) return <span className='ml-auto text-sm text-gray-500'>Paused</span>;
    return (
        <span className='ml-auto inline-flex items-center gap-2 text-sm text-gray-600' role='status'>
            <span className={`h-2.5 w-2.5 rounded-full ${polling ? 'animate-pulse bg-green-500' : 'bg-gray-300'}`} aria-hidden />
            Live
            {lastChecked && (
                <span className='sr-only'>
                    , last checked {lastChecked.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                </span>
            )}
        </span>
    );
}

function LogRow({ entry, time, isFresh, showDevice, onDevice }) {
    const details = Object.entries(entry.details ?? {}).sort(([a], [b]) => a.localeCompare(b));
    return (
        <li
            className={`flex flex-col gap-0.5 px-4 py-3 transition-colors duration-700 sm:flex-row sm:gap-3 ${ROW_STYLES[entry.level] ?? ''} ${
                isFresh ? 'bg-yellow-50' : ''
            }`}
        >
            <div className='shrink-0 text-xs tabular-nums text-gray-500 sm:w-24 sm:pt-0.5 sm:text-sm'>{time}</div>
            <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                    <span className='font-medium text-gray-900'>
                        <span aria-hidden className='mr-1.5 text-sm' title={categoryLabel(entry.category)}>
                            {CATEGORY_ICONS[entry.category] ?? '•'}
                        </span>
                        <span className='sr-only'>{categoryLabel(entry.category)}: </span>
                        {entry.message}
                    </span>
                    {entry.level !== 'info' && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${LEVEL_STYLES[entry.level] ?? ''}`}>
                            {entry.level}
                        </span>
                    )}
                </div>
                {details.length > 0 && (
                    <dl className='mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600'>
                        {details.map(([key, value]) => (
                            <div key={key} className='flex gap-1'>
                                <dt className='text-gray-400'>{key}</dt>
                                <dd className='break-all font-mono'>{String(value)}</dd>
                            </div>
                        ))}
                    </dl>
                )}
                {showDevice && (
                    <button type='button' onClick={onDevice} className='mt-1 text-xs text-gray-400 hover:text-gray-600 hover:underline'>
                        {deviceLabel(entry)} · v{entry.appVersion}
                    </button>
                )}
            </div>
        </li>
    );
}
