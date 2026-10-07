'use client';

// The store's staff schedule: a week at a glance (tap a shift to change it), and the
// team (add people, days off, each person's calendar link).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, ChevronLeft, ChevronRight, Loader2, Palmtree, Pencil, Plus, Repeat, Trash2, X } from 'lucide-react';
import { api, jsonRequest } from '@/lib/site/adminApi';
import { dateKey } from '@/lib/site/popups';
import { addDays, datesBetween, expandShifts, isOff, weekStart, WEEKDAYS } from '@/lib/schedule/schedule';
import { AddShiftDialog, CalendarLinkDialog, EditShiftDialog, TimeOffDialog } from './ScheduleDialogs';
import { colorFor, inputClass, shortDate, timeRange } from './scheduleUi';

export default function SchedulePage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [view, setView] = useState('week');
    const [dialog, setDialog] = useState(null); // { kind, ...props }

    const load = useCallback(async () => {
        try {
            setData(await api('/api/admin/schedule'));
            setError('');
        } catch (e) {
            if (e.message !== 'Signed out') setError(e.message);
        }
    }, []);
    useEffect(() => {
        load();
    }, [load]);

    const saved = () => {
        setDialog(null);
        load();
    };
    const byId = useMemo(() => new Map((data?.employees ?? []).map((e) => [e.id, e])), [data]);

    return (
        <div className='min-h-screen bg-gray-50 pb-16'>
            <header className='sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur'>
                <div className='mx-auto flex max-w-3xl items-center gap-3 px-4 py-3'>
                    <Link href='/vendor' className='text-sm text-gray-500 hover:text-gray-600'>
                        ← Back
                    </Link>
                    <h1 className='text-xl font-bold'>Staff Schedule</h1>
                </div>
                <nav aria-label='Schedule views' className='mx-auto max-w-3xl px-4 pb-3'>
                    <div className='grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1'>
                        {[
                            ['week', '🗓️ Week'],
                            ['team', '👥 Team & days off'],
                        ].map(([id, label]) => (
                            <button
                                key={id}
                                type='button'
                                onClick={() => setView(id)}
                                aria-pressed={view === id}
                                className={`rounded-lg py-2.5 text-sm font-semibold ${view === id ? 'bg-black text-white shadow-sm' : 'text-gray-700 hover:bg-white'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </nav>
            </header>

            <main className='mx-auto max-w-3xl space-y-4 px-4 pt-4'>
                {error && (
                    <div role='alert' className='flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800'>
                        <span className='flex-1'>{error}</span>
                        <button type='button' onClick={() => setError('')} aria-label='Dismiss message' className='-m-1 rounded p-1'>
                            <X className='h-4 w-4' aria-hidden />
                        </button>
                    </div>
                )}
                {!data && !error && (
                    <div className='flex justify-center py-16 text-gray-500' role='status'>
                        <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                        <span className='sr-only'>Loading the schedule…</span>
                    </div>
                )}
                {data && data.employees.length === 0 && view === 'week' && (
                    <div className='rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center'>
                        <p className='font-semibold'>Add your team first</p>
                        <button type='button' onClick={() => setView('team')} className='mt-3 rounded-xl bg-black px-4 py-2.5 font-semibold text-white'>
                            Go to Team
                        </button>
                    </div>
                )}
                {data && data.employees.length > 0 && view === 'week' && <WeekView data={data} byId={byId} setDialog={setDialog} />}
                {data && view === 'team' && <TeamView data={data} setDialog={setDialog} reload={load} setError={setError} />}
            </main>

            {dialog?.kind === 'add' && <AddShiftDialog employees={data.employees} date={dialog.date} employeeId={dialog.employeeId} onClose={() => setDialog(null)} onSaved={saved} />}
            {dialog?.kind === 'edit' && <EditShiftDialog shift={dialog.shift} employee={byId.get(dialog.shift.employeeId)} onClose={() => setDialog(null)} onSaved={saved} />}
            {dialog?.kind === 'off' && <TimeOffDialog employees={data.employees} employeeId={dialog.employeeId} date={dialog.date} onClose={() => setDialog(null)} onSaved={saved} />}
            {dialog?.kind === 'link' && <CalendarLinkDialog employee={dialog.employee} onClose={() => setDialog(null)} onChanged={load} />}
        </div>
    );
}

// ── the week ────────────────────────────────────────────────────────────────

function WeekView({ data, byId, setDialog }) {
    const today = dateKey(new Date());
    const [monday, setMonday] = useState(() => weekStart(today));
    const sunday = addDays(monday, 6);
    const days = datesBetween(monday, sunday);
    const shifts = useMemo(() => expandShifts({ shifts: data.shifts, timeOff: data.timeOff, from: monday, to: sunday }), [data, monday, sunday]);
    const hours = shifts.reduce((sum, s) => sum + minutes(s.end) - minutes(s.start), 0) / 60;

    return (
        <>
            <div className='flex items-center gap-2'>
                <button type='button' onClick={() => setMonday(addDays(monday, -7))} aria-label='Previous week' className='rounded-xl bg-white p-2.5 ring-1 ring-gray-200 hover:bg-gray-100'>
                    <ChevronLeft className='h-5 w-5' aria-hidden />
                </button>
                <h2 className='flex-1 text-center font-bold' aria-live='polite'>
                    {shortDate(monday)} – {shortDate(sunday)}
                    <span className='block text-xs font-normal text-gray-500'>
                        {shifts.length} shifts · {hours % 1 ? hours.toFixed(1) : hours} hours
                    </span>
                </h2>
                <button type='button' onClick={() => setMonday(addDays(monday, 7))} aria-label='Next week' className='rounded-xl bg-white p-2.5 ring-1 ring-gray-200 hover:bg-gray-100'>
                    <ChevronRight className='h-5 w-5' aria-hidden />
                </button>
            </div>
            {monday !== weekStart(today) && (
                <button type='button' onClick={() => setMonday(weekStart(today))} className='mx-auto block text-sm font-semibold text-blue-700 hover:underline'>
                    Back to this week
                </button>
            )}

            <ol className='space-y-3'>
                {days.map((day) => {
                    const dayShifts = shifts.filter((s) => s.date === day);
                    const off = data.employees.filter((e) => isOff(data.timeOff, e.id, day));
                    return (
                        <li key={day} className={`rounded-2xl bg-white p-3 shadow-sm ring-1 ${day === today ? 'ring-2 ring-black' : 'ring-gray-200'}`}>
                            <div className='flex items-center gap-2'>
                                <h3 className='font-bold'>
                                    {shortDate(day)}
                                    {day === today && <span className='ml-2 rounded-full bg-black px-2 py-0.5 text-xs text-white'>Today</span>}
                                </h3>
                                <button
                                    type='button'
                                    onClick={() => setDialog({ kind: 'add', date: day })}
                                    className='ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50'
                                >
                                    <Plus className='h-4 w-4' aria-hidden /> Shift<span className='sr-only'> on {shortDate(day)}</span>
                                </button>
                            </div>
                            {dayShifts.length > 0 && (
                                <ul className='mt-2 space-y-1.5'>
                                    {dayShifts.map((shift) => (
                                        <li key={shift.key}>
                                            <button
                                                type='button'
                                                onClick={() => setDialog({ kind: 'edit', shift })}
                                                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ring-1 hover:opacity-80 ${colorFor(data.employees, shift.employeeId)}`}
                                            >
                                                <span className='min-w-0 flex-1'>
                                                    <span className='flex items-center gap-1.5 font-semibold'>
                                                        {byId.get(shift.employeeId)?.name}
                                                        {shift.repeat === 'weekly' ? (
                                                            <Repeat className='h-3.5 w-3.5 shrink-0' aria-label='every week' />
                                                        ) : (
                                                            <span className='text-xs font-normal'>(one time)</span>
                                                        )}
                                                    </span>
                                                    <span className='block text-sm'>
                                                        {timeRange(shift.start, shift.end)}
                                                        {shift.note && ` · ${shift.note}`}
                                                    </span>
                                                </span>
                                                <Pencil className='ml-auto h-4 w-4 shrink-0' aria-hidden />
                                                <span className='sr-only'>Change</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {off.length > 0 && (
                                <p className='mt-2 flex items-center gap-1 text-sm text-gray-600'>
                                    <Palmtree className='h-4 w-4' aria-hidden /> Off: {off.map((e) => e.name).join(', ')}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ol>
        </>
    );
}

const minutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

// ── the team ────────────────────────────────────────────────────────────────

function TeamView({ data, setDialog, reload, setError }) {
    const today = dateKey(new Date());
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const upcomingOff = data.timeOff.filter((off) => off.endDate >= today);

    const run = async (request) => {
        setBusy(true);
        try {
            await request();
            await reload();
        } catch (e) {
            setError(e.message);
        }
        setBusy(false);
    };

    const add = (event) => {
        event.preventDefault();
        run(async () => {
            await api('/api/admin/schedule/employees', jsonRequest('POST', { name }));
            setName('');
        });
    };
    const rename = (employee) => {
        const next = window.prompt('New name', employee.name);
        if (next && next.trim() !== employee.name) run(() => api(`/api/admin/schedule/employees/${employee.id}`, jsonRequest('PATCH', { name: next })));
    };
    const remove = (employee) => {
        if (window.confirm(`Remove ${employee.name}? Their shifts, days off and calendar link are deleted, and they can no longer sign in to Inventory.`)) {
            run(() => api(`/api/admin/schedule/employees/${employee.id}`, { method: 'DELETE' }));
        }
    };

    return (
        <>
            <section aria-labelledby='team-heading' className='space-y-2'>
                <h2 id='team-heading' className='font-bold'>
                    Team ({data.employees.length})
                </h2>
                <ul className='space-y-2'>
                    {data.employees.map((employee) => (
                        <li key={employee.id} className='rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-200'>
                            <div className='flex items-center gap-2'>
                                <span className={`h-3 w-3 shrink-0 rounded-full ring-2 ${colorFor(data.employees, employee.id)}`} aria-hidden />
                                <p className='flex-1 font-semibold'>{employee.name}</p>
                                <button type='button' onClick={() => rename(employee)} disabled={busy} aria-label={`Rename ${employee.name}`} className='rounded-lg p-2 text-gray-600 hover:bg-gray-100'>
                                    <Pencil className='h-4 w-4' aria-hidden />
                                </button>
                                <button type='button' onClick={() => remove(employee)} disabled={busy} aria-label={`Remove ${employee.name}`} className='rounded-lg p-2 text-red-700 hover:bg-red-50'>
                                    <Trash2 className='h-4 w-4' aria-hidden />
                                </button>
                            </div>
                            <p className='mt-1 text-sm text-gray-600'>{regularHours(data.shifts, employee.id, today)}</p>
                            <div className='mt-2 grid grid-cols-2 gap-2'>
                                <button
                                    type='button'
                                    onClick={() => setDialog({ kind: 'link', employee })}
                                    className='flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold ring-1 ring-gray-300 hover:bg-gray-50'
                                >
                                    <CalendarCheck className='h-4 w-4' aria-hidden /> Calendar link
                                </button>
                                <button
                                    type='button'
                                    onClick={() => setDialog({ kind: 'off', employeeId: employee.id, date: today })}
                                    className='flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold ring-1 ring-gray-300 hover:bg-gray-50'
                                >
                                    <Palmtree className='h-4 w-4' aria-hidden /> Day off
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
                <form onSubmit={add} className='flex gap-2'>
                    <label htmlFor='new-employee' className='sr-only'>
                        New employee&apos;s name
                    </label>
                    <input id='new-employee' value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder='New employee’s name' className={inputClass} />
                    <button type='submit' disabled={busy || !name.trim()} className='flex shrink-0 items-center gap-1 rounded-xl bg-black px-4 font-semibold text-white hover:opacity-80 disabled:opacity-40'>
                        <Plus className='h-4 w-4' aria-hidden /> Add
                    </button>
                </form>
            </section>

            <section aria-labelledby='off-heading' className='space-y-2 pt-4'>
                <h2 id='off-heading' className='font-bold'>
                    Upcoming days off
                </h2>
                {upcomingOff.length === 0 ? (
                    <p className='text-sm text-gray-600'>Nobody has asked for time off.</p>
                ) : (
                    <ul className='space-y-2'>
                        {upcomingOff.map((off) => {
                            const who = data.employees.find((e) => e.id === off.employeeId)?.name ?? 'Someone';
                            const when = off.startDate === off.endDate ? shortDate(off.startDate) : `${shortDate(off.startDate)} – ${shortDate(off.endDate)}`;
                            return (
                                <li key={off.id} className='flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-200'>
                                    <Palmtree className='h-5 w-5 shrink-0 text-gray-500' aria-hidden />
                                    <p className='flex-1'>
                                        <span className='font-semibold'>{who}</span> · {when}
                                        {off.note && <span className='block text-sm text-gray-600'>{off.note}</span>}
                                    </p>
                                    <button
                                        type='button'
                                        disabled={busy}
                                        onClick={() =>
                                            window.confirm(`Cancel ${who}'s day off (${when})? Their shifts come back.`) &&
                                            run(() => api(`/api/admin/schedule/time-off/${off.id}`, { method: 'DELETE' }))
                                        }
                                        className='rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-gray-300 hover:bg-gray-50'
                                    >
                                        Cancel<span className='sr-only'> {who}&apos;s day off</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <button
                    type='button'
                    onClick={() => setDialog({ kind: 'off', date: today })}
                    disabled={data.employees.length === 0}
                    className='flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline disabled:opacity-40'
                >
                    <Plus className='h-4 w-4' aria-hidden /> Add a day off
                </button>
            </section>
        </>
    );
}

/** "Saturdays 10 AM – 4 PM, Sundays 11 AM – 3 PM" from someone's current weekly shifts. */
function regularHours(shifts, employeeId, today) {
    const weekly = shifts
        .filter((s) => s.employeeId === employeeId && s.repeat === 'weekly' && (!s.endDate || s.endDate >= today))
        .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.start.localeCompare(b.start));
    if (weekly.length === 0) return 'No regular shifts yet. Add one from the Week view.';
    return weekly.map((s) => `${WEEKDAYS[s.weekday].slice(0, 3)} ${timeRange(s.start, s.end)}`).join(' · ');
}
