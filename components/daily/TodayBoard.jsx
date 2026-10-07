'use client';

// The Today board (/today): what needs doing in the shop today. Last night's
// make list from the stock check, plus anything someone asked for (the owner
// adds tasks here). Tick things off as they're done. Anything not done stays
// on the board, marked with the day it was for, until someone ticks it off.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Trash2, UserRound } from 'lucide-react';
import { SetupCheck } from '@/components/admin/AdminShell';
import Dialog from '@/components/admin/Dialog';
import { inputClass, longDate, shortDate } from '@/components/admin/schedule/scheduleUi';
import { addDays } from '@/lib/schedule/schedule';
import { api, jsonRequest } from '@/lib/site/adminApi';
import { CHIP, ErrorText, amount, checkWhen, store, timeOf } from './dailyUi';

// Who's using this device, for "done by" and "added by". Forgotten each day,
// so a shared tablet doesn't keep yesterday's person.
const ME_KEY = 'today-board-me';
const REFRESH_MS = 60000;

export default function TodayBoard() {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [me, setMe] = useState('');
    const [dialog, setDialog] = useState(null); // { kind: 'who', then? } | { kind: 'remove', task }
    const [busy, setBusy] = useState(null); // id of the task being saved

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

    // Keep up with other devices: refresh every minute and on coming back to the page.
    useEffect(() => {
        load();
        const timer = setInterval(load, REFRESH_MS);
        const onShow = () => document.visibilityState === 'visible' && load();
        window.addEventListener('focus', onShow);
        document.addEventListener('visibilitychange', onShow);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', onShow);
            document.removeEventListener('visibilitychange', onShow);
        };
    }, [load]);

    const today = data?.today;
    useEffect(() => {
        if (!today) return;
        const saved = store.get(ME_KEY);
        setMe(saved?.day === today ? saved.name : '');
    }, [today]);

    /** Do something that needs a name, asking for it first if needed. */
    const asMe = (action) => (me ? action(me) : setDialog({ kind: 'who', then: action }));
    const chooseMe = (name) => {
        store.set(ME_KEY, { name, day: today });
        setMe(name);
        const then = dialog?.then;
        setDialog(null);
        then?.(name);
    };

    const run = async (id, request) => {
        setBusy(id);
        try {
            await request();
            await load();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(null);
        }
    };
    const toggle = (task) => {
        const url = `/api/admin/daily/tasks/${task.id}`;
        if (task.doneAt) run(task.id, () => api(url, jsonRequest('PATCH', { done: false })));
        else asMe((name) => run(task.id, () => api(url, jsonRequest('PATCH', { done: true, by: name }))));
    };
    const remove = (task) => {
        setDialog(null);
        run(task.id, () => api(`/api/admin/daily/tasks/${task.id}`, { method: 'DELETE' }));
    };

    const rowProps = { busy, timeZone: data?.timeZone, onToggle: toggle, onRemove: (task) => setDialog({ kind: 'remove', task }) };
    const board = data?.board;
    const check = data?.latestCheck;
    const makeTodo = board?.todo.filter((t) => t.kind === 'make') ?? [];
    const otherTodo = board?.todo.filter((t) => t.kind !== 'make') ?? [];

    return (
        <div className='min-h-screen bg-gray-50 pb-16'>
            <header className='sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur'>
                <div className='mx-auto flex max-w-3xl items-center gap-3 px-4 py-3'>
                    <Link href='/vendor' className='text-sm text-gray-500 hover:text-gray-600'>
                        ← Back
                    </Link>
                    <div className='min-w-0'>
                        <h1 className='text-xl font-bold leading-tight'>Today</h1>
                        {today && <p className='text-sm text-gray-600'>{longDate(today)}</p>}
                    </div>
                    {data && (
                        <button
                            type='button'
                            onClick={() => setDialog({ kind: 'who' })}
                            className='ml-auto flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50'
                        >
                            <UserRound className='h-4 w-4' aria-hidden />
                            {me ? (
                                <span>
                                    {me} <span className='text-gray-600'>· change</span>
                                </span>
                            ) : (
                                'Who are you?'
                            )}
                        </button>
                    )}
                </div>
            </header>
            <SetupCheck />

            <div className='mx-auto max-w-3xl space-y-4 px-4 pt-4'>
                <ErrorText error={error} />
                {!data && !error && <p className='rounded-2xl bg-white p-6 text-center text-gray-600 shadow-sm'>Loading…</p>}

                {data && (
                    <>
                        <Card title='To do' count={board.todo.length}>
                            {board.todo.length === 0 ? (
                                <p className='px-4 pb-4 text-gray-600'>
                                    Nothing to do right now. Add a task below, or do tonight’s stock check to make tomorrow’s make list.
                                </p>
                            ) : (
                                <>
                                    {makeTodo.length > 0 && (
                                        <TaskGroup title='Make' hint={check && `From the stock check ${checkWhen(check.date, today)} by ${check.employeeName}`}>
                                            {makeTodo.map((task) => (
                                                <TaskRow key={task.id} task={task} {...rowProps} />
                                            ))}
                                        </TaskGroup>
                                    )}
                                    {otherTodo.length > 0 && (
                                        <TaskGroup title='Asked for'>
                                            {otherTodo.map((task) => (
                                                <TaskRow key={task.id} task={task} {...rowProps} />
                                            ))}
                                        </TaskGroup>
                                    )}
                                </>
                            )}
                        </Card>

                        <AddTask today={today} asMe={asMe} onAdded={load} />

                        {check && (check.low.length > 0 || check.note) && (
                            <Card title='Running low' hint={`From the stock check ${checkWhen(check.date, today)} by ${check.employeeName}`}>
                                {check.low.length > 0 && (
                                    <ul className='divide-y divide-gray-100'>
                                        {check.low.map((item) => (
                                            <li key={item.id} className='flex items-center justify-between gap-3 px-4 py-3'>
                                                <span className='font-medium'>{item.name}</span>
                                                <span className='flex items-center gap-2 text-sm'>
                                                    <span className='text-gray-700'>
                                                        {amount(item.count, item.unit)} left (target {item.target})
                                                    </span>
                                                    {item.out && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP.out}`}>Out</span>}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {check.note && (
                                    <p className='border-t border-gray-100 px-4 py-3 text-sm'>
                                        <span className='font-semibold'>Note from closing: </span>
                                        {check.note}
                                    </p>
                                )}
                            </Card>
                        )}

                        {board.upcoming.length > 0 && (
                            <Card title='Coming up' count={board.upcoming.length}>
                                {groupByDay(board.upcoming).map(([day, tasks]) => (
                                    <TaskGroup key={day} title={day === addDays(today, 1) ? `Tomorrow · ${shortDate(day)}` : shortDate(day)}>
                                        {tasks.map((task) => (
                                            <TaskRow key={task.id} task={task} {...rowProps} />
                                        ))}
                                    </TaskGroup>
                                ))}
                            </Card>
                        )}

                        {board.done.length > 0 && (
                            <Card title='Done today' count={board.done.length}>
                                <ul className='divide-y divide-gray-100'>
                                    {board.done.map((task) => (
                                        <TaskRow key={task.id} task={task} {...rowProps} />
                                    ))}
                                </ul>
                            </Card>
                        )}

                        <Link
                            href='/inventory?tab=daily'
                            className='flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 font-semibold text-gray-800 shadow-sm hover:bg-gray-50'
                        >
                            <span>
                                Closing? Do tonight’s stock check
                                <span className='block text-sm font-normal text-gray-600'>It makes tomorrow’s make list.</span>
                            </span>
                            <span aria-hidden>→</span>
                        </Link>
                    </>
                )}
            </div>

            {dialog?.kind === 'who' && <WhoDialog employees={data?.employees ?? []} current={me} onClose={() => setDialog(null)} onChoose={chooseMe} />}
            {dialog?.kind === 'remove' && (
                <Dialog
                    title='Remove this task?'
                    onClose={() => setDialog(null)}
                    onSubmit={(e) => {
                        e.preventDefault();
                        remove(dialog.task);
                    }}
                >
                    <p className='mb-4'>
                        <span className='font-semibold'>{dialog.task.title}</span> comes off the board for everyone.
                    </p>
                    <div className='grid grid-cols-2 gap-2'>
                        <button type='button' onClick={() => setDialog(null)} className='rounded-xl border border-gray-300 py-3 font-semibold hover:bg-gray-50'>
                            Keep it
                        </button>
                        <button type='submit' className='rounded-xl bg-red-700 py-3 font-semibold text-white hover:bg-red-800'>
                            Remove
                        </button>
                    </div>
                </Dialog>
            )}
        </div>
    );
}

/** [[day, tasks], …] in date order. */
function groupByDay(tasks) {
    const days = new Map();
    for (const task of tasks) days.set(task.forDate, [...(days.get(task.forDate) ?? []), task]);
    return [...days.entries()];
}

function Card({ title, count, hint, children }) {
    const id = `card-${title.toLowerCase().replace(/\W+/g, '-')}`;
    return (
        <section aria-labelledby={id} className='overflow-hidden rounded-2xl bg-white shadow-sm'>
            <div className='px-4 pb-2 pt-4'>
                <h2 id={id} className='flex items-center gap-2 text-lg font-bold'>
                    {title}
                    {count > 0 && <span className='rounded-full bg-gray-100 px-2 py-0.5 text-sm font-semibold text-gray-700'>{count}</span>}
                </h2>
                {hint && <p className='text-sm text-gray-600'>{hint}</p>}
            </div>
            {children}
        </section>
    );
}

function TaskGroup({ title, hint, children }) {
    return (
        <div className='border-t border-gray-100'>
            <div className='bg-gray-50 px-4 py-2'>
                <h3 className='text-sm font-semibold text-gray-800'>{title}</h3>
                {hint && <p className='text-xs text-gray-600'>{hint}</p>}
            </div>
            <ul className='divide-y divide-gray-100'>{children}</ul>
        </div>
    );
}

function TaskRow({ task, busy, timeZone, onToggle, onRemove }) {
    const done = Boolean(task.doneAt);
    const boxId = `task-${task.id}`;
    return (
        <li className='flex items-start gap-3 px-4 py-3'>
            <input
                id={boxId}
                type='checkbox'
                checked={done}
                onChange={() => onToggle(task)}
                disabled={busy === task.id}
                className='mt-0.5 h-6 w-6 shrink-0 cursor-pointer accent-black'
            />
            <label htmlFor={boxId} className='min-w-0 flex-1 cursor-pointer'>
                <span className={`block font-semibold ${done ? 'text-gray-600 line-through' : ''}`}>{task.title}</span>
                {task.kind === 'make' && task.quantity > 0 && <span className='block text-sm'>Make {amount(task.quantity, task.unit)}</span>}
                {task.note && <span className='block text-sm text-gray-700'>{task.note}</span>}
                <span className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600'>
                    {task.carriedFrom && !done && <span className={`rounded-full px-2 py-0.5 font-semibold ${CHIP.low}`}>From {shortDate(task.carriedFrom)}</span>}
                    {task.kind === 'task' && task.addedBy && <span>Added by {task.addedBy}</span>}
                    {done && (
                        <span className='font-medium text-green-800'>
                            ✓ {task.doneBy ? `${task.doneBy} · ` : ''}
                            {timeOf(task.doneAt, timeZone)}
                        </span>
                    )}
                </span>
            </label>
            <button type='button' onClick={() => onRemove(task)} aria-label={`Remove ${task.title}`} className='rounded-full p-2 text-gray-500 hover:bg-red-50 hover:text-red-700'>
                <Trash2 className='h-4 w-4' aria-hidden />
            </button>
        </li>
    );
}

function AddTask({ today, asMe, onAdded }) {
    const empty = { title: '', forDate: '', note: '' };
    const [form, setForm] = useState(empty);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

    const add = (name) => {
        setSaving(true);
        setError('');
        api('/api/admin/daily/tasks', jsonRequest('POST', { ...form, forDate: form.forDate || today, addedBy: name }))
            .then(() => {
                setForm(empty);
                return onAdded();
            })
            .catch((e) => setError(e.message))
            .finally(() => setSaving(false));
    };
    const submit = (event) => {
        event.preventDefault();
        asMe(add);
    };

    return (
        <section aria-labelledby='add-task' className='rounded-2xl bg-white p-4 shadow-sm'>
            <h2 id='add-task' className='text-lg font-bold'>
                Add a task
            </h2>
            <form onSubmit={submit} className='mt-3 space-y-3'>
                <label className='block'>
                    <span className='mb-1 block text-sm font-semibold'>What needs doing?</span>
                    <input type='text' required value={form.title} onChange={set('title')} maxLength={140} className={inputClass} placeholder='e.g. Clean the freezer' />
                </label>
                <div className='grid gap-3 sm:grid-cols-2'>
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Day</span>
                        <input type='date' required min={today} value={form.forDate || today} onChange={set('forDate')} className={inputClass} />
                    </label>
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Details (optional)</span>
                        <input type='text' value={form.note} onChange={set('note')} maxLength={200} className={inputClass} />
                    </label>
                </div>
                <ErrorText error={error} />
                <button type='submit' disabled={saving || !form.title.trim()} className='w-full rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80 disabled:opacity-40'>
                    {saving ? 'Adding…' : 'Add task'}
                </button>
            </form>
        </section>
    );
}

function WhoDialog({ employees, current, onClose, onChoose }) {
    const [name, setName] = useState(employees.length === 0 || employees.some((e) => e.name === current) ? current : employees[0].name);
    return (
        <Dialog
            title='Who are you?'
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) onChoose(name.trim());
            }}
        >
            <div className='space-y-4'>
                <p className='text-gray-700'>Your name goes on what you tick off and add today, on this device.</p>
                {employees.length > 0 ? (
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Name</span>
                        <select value={name} onChange={(e) => setName(e.target.value)} className={inputClass}>
                            {employees.map((e) => (
                                <option key={e.id} value={e.name}>
                                    {e.name}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : (
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Name</span>
                        <input type='text' required value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} />
                    </label>
                )}
                <button type='submit' disabled={!name.trim()} className='w-full rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80 disabled:opacity-40'>
                    That’s me
                </button>
            </div>
        </Dialog>
    );
}
