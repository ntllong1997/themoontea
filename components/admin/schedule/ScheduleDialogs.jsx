'use client';

// The schedule page's pop-ups: add a shift, change a shift, days off, and an
// employee's calendar link.

import { useState } from 'react';
import { CalendarCheck, Check, Copy, MessageSquare, RefreshCw } from 'lucide-react';
import Dialog from '@/components/admin/Dialog';
import { api, jsonRequest } from '@/lib/site/adminApi';
import { weekdayOf } from '@/lib/schedule/schedule';
import { everyWeekday, feedUrls, inputClass, longDate, timeRange } from './scheduleUi';

function ErrorText({ error }) {
    return error ? (
        <p role='alert' className='rounded-xl bg-red-50 p-3 text-sm text-red-800'>
            {error}
        </p>
    ) : null;
}

function TimeFields({ form, set }) {
    return (
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
    );
}

function NoteField({ form, set }) {
    return (
        <label className='block'>
            <span className='mb-1 block text-sm font-semibold'>
                Note <span className='font-normal text-gray-500'>(optional)</span>
            </span>
            <input value={form.note} onChange={set('note')} maxLength={120} className={inputClass} placeholder='e.g. Opening, Closing, Drink station' />
        </label>
    );
}

const useForm = (initial) => {
    const [form, setForm] = useState(initial);
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    return [form, set, setForm];
};

/** Add a shift on a day, every week by default. */
export function AddShiftDialog({ employees, date, employeeId = '', onClose, onSaved }) {
    const [form, set] = useForm({ employeeId: employeeId || employees[0]?.id || '', date, start: '10:00', end: '16:00', note: '', weekly: true });
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    async function save(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            await api('/api/admin/schedule/shifts', jsonRequest('POST', form));
            onSaved();
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    }

    return (
        <Dialog title='Add a shift' onClose={onClose} onSubmit={save}>
            <div className='space-y-4'>
                <label className='block'>
                    <span className='mb-1 block text-sm font-semibold'>Who</span>
                    <select required value={form.employeeId} onChange={set('employeeId')} className={inputClass}>
                        {employees.map((e) => (
                            <option key={e.id} value={e.id}>
                                {e.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className='block'>
                    <span className='mb-1 block text-sm font-semibold'>Day</span>
                    <input type='date' required value={form.date} onChange={set('date')} className={inputClass} />
                </label>
                <TimeFields form={form} set={set} />
                <NoteField form={form} set={set} />
                <label className='flex items-center gap-3 rounded-xl bg-gray-50 p-3 font-semibold'>
                    <input type='checkbox' checked={form.weekly} onChange={set('weekly')} className='h-5 w-5' />
                    <span>
                        Repeat every week{form.date && ` (${everyWeekday(weekdayOf(form.date))})`}
                        <span className='block text-sm font-normal text-gray-600'>Untick for a one-time shift.</span>
                    </span>
                </label>
                <ErrorText error={error} />
                <button type='submit' disabled={saving || !form.employeeId} className='w-full rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80 disabled:opacity-40'>
                    {saving ? 'Saving…' : 'Add shift'}
                </button>
            </div>
        </Dialog>
    );
}

/**
 * Change one shift on one day. A weekly shift can change just that day (the
 * usual case: someone swaps hours) or every week.
 */
export function EditShiftDialog({ shift, employee, onClose, onSaved }) {
    const [form, set] = useForm({ start: shift.start, end: shift.end, note: shift.note ?? '' });
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const weekly = shift.repeat === 'weekly';

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
    const patch = (body) => api(`/api/admin/schedule/shifts/${shift.shiftId}`, jsonRequest('PATCH', body));

    const justThisDay = () =>
        run(() =>
            api(
                '/api/admin/schedule/shifts',
                jsonRequest('POST', { employeeId: shift.employeeId, date: shift.date, ...form, weekly: false, replaces: { shiftId: shift.shiftId, date: shift.date } })
            )
        );
    const everyWeek = (event) => {
        event?.preventDefault();
        run(() => patch(form));
    };
    const removeThisDay = () => run(() => patch({ action: 'skip', date: shift.date }));
    const stopRepeating = () => {
        if (window.confirm(`Stop ${employee?.name}'s ${everyWeekday(weekdayOf(shift.date))} shift from ${longDate(shift.date)} on?`)) {
            run(() => patch({ action: 'stop', date: shift.date }));
        }
    };
    const deleteOnce = () => {
        if (window.confirm(`Delete ${employee?.name}'s shift on ${longDate(shift.date)}?`)) {
            run(() => api(`/api/admin/schedule/shifts/${shift.shiftId}`, { method: 'DELETE' }));
        }
    };

    return (
        <Dialog title={`${employee?.name ?? 'Shift'} · ${longDate(shift.date)}`} onClose={onClose} onSubmit={weekly ? (e) => e.preventDefault() : everyWeek}>
            <div className='space-y-4'>
                <p className='text-sm text-gray-600'>
                    {weekly ? `Works ${everyWeekday(weekdayOf(shift.date))}, ${timeRange(shift.start, shift.end)}, every week.` : 'A one-time shift.'}
                </p>
                <TimeFields form={form} set={set} />
                <NoteField form={form} set={set} />
                <ErrorText error={error} />
                {weekly ? (
                    <div className='space-y-2'>
                        <button type='button' onClick={justThisDay} disabled={saving} className='w-full rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80 disabled:opacity-40'>
                            Save for {longDate(shift.date)} only
                        </button>
                        <button type='button' onClick={everyWeek} disabled={saving} className='w-full rounded-xl py-3 font-semibold ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40'>
                            Save for every {weekdayName(shift.date)}
                        </button>
                        <div className='grid grid-cols-2 gap-2 pt-2'>
                            <button type='button' onClick={removeThisDay} disabled={saving} className='rounded-xl py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-40'>
                                Remove this day only
                            </button>
                            <button type='button' onClick={stopRepeating} disabled={saving} className='rounded-xl py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-40'>
                                Stop from this day on
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className='flex gap-2'>
                        <button type='button' onClick={deleteOnce} disabled={saving} className='rounded-xl px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-40'>
                            Delete
                        </button>
                        <button type='submit' disabled={saving} className='flex-1 rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80 disabled:opacity-40'>
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                )}
            </div>
        </Dialog>
    );
}

const weekdayName = (date) => everyWeekday(weekdayOf(date)).slice(0, -1);

/** Record a day off (or several in a row). */
export function TimeOffDialog({ employees, employeeId = '', date, onClose, onSaved }) {
    const [form, set] = useForm({ employeeId: employeeId || employees[0]?.id || '', startDate: date, endDate: date, note: '' });
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    async function save(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            await api('/api/admin/schedule/time-off', jsonRequest('POST', form));
            onSaved();
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    }

    return (
        <Dialog title='Day off' onClose={onClose} onSubmit={save}>
            <div className='space-y-4'>
                <label className='block'>
                    <span className='mb-1 block text-sm font-semibold'>Who</span>
                    <select required value={form.employeeId} onChange={set('employeeId')} className={inputClass}>
                        {employees.map((e) => (
                            <option key={e.id} value={e.id}>
                                {e.name}
                            </option>
                        ))}
                    </select>
                </label>
                <div className='grid grid-cols-2 gap-3'>
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>First day off</span>
                        <input
                            type='date'
                            required
                            value={form.startDate}
                            onChange={(e) => {
                                const value = e.target.value;
                                set('startDate')(e);
                                if (!form.endDate || form.endDate < value) set('endDate')({ target: { type: 'date', value } });
                            }}
                            className={inputClass}
                        />
                    </label>
                    <label className='block'>
                        <span className='mb-1 block text-sm font-semibold'>Last day off</span>
                        <input type='date' required value={form.endDate} min={form.startDate} onChange={set('endDate')} className={inputClass} />
                    </label>
                </div>
                <label className='block'>
                    <span className='mb-1 block text-sm font-semibold'>
                        Reason <span className='font-normal text-gray-500'>(optional, only staff see it)</span>
                    </span>
                    <input value={form.note} onChange={set('note')} maxLength={120} className={inputClass} placeholder='e.g. Family trip' />
                </label>
                <p className='text-sm text-gray-600'>Their shifts on these days are taken off the schedule and their phone calendar.</p>
                <ErrorText error={error} />
                <button type='submit' disabled={saving || !form.employeeId} className='w-full rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80 disabled:opacity-40'>
                    {saving ? 'Saving…' : 'Save day off'}
                </button>
            </div>
        </Dialog>
    );
}

/** An employee's private calendar link: add it on this phone, copy it, or text it. */
export function CalendarLinkDialog({ employee, onClose, onChanged }) {
    const [token, setToken] = useState(employee.calendarToken);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const urls = feedUrls(token);
    const message = `Hi ${employee.name}! Tap to add your Moon Tea work shifts to your phone's calendar: ${urls.webcal}  (Android / Google Calendar: ${urls.https})`;

    async function copy() {
        try {
            await navigator.clipboard.writeText(urls.https);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            window.prompt('Copy this link:', urls.https);
        }
    }

    async function reset() {
        if (!window.confirm(`Make a new link for ${employee.name}? The old link stops working, so they'll need to subscribe again.`)) return;
        setBusy(true);
        setError('');
        try {
            const { calendarToken } = await api(`/api/admin/schedule/employees/${employee.id}/link`, { method: 'POST' });
            setToken(calendarToken);
            onChanged();
        } catch (e) {
            setError(e.message);
        }
        setBusy(false);
    }

    return (
        <Dialog title={`${employee.name}'s calendar link`} onClose={onClose} onSubmit={(e) => e.preventDefault()}>
            <div className='space-y-4'>
                <p className='text-sm text-gray-600'>
                    {employee.name} subscribes once, and their shifts show up in their phone&apos;s calendar and stay up to date on their
                    own. The link shows only their shifts. Keep it private: anyone with it can see them.
                </p>
                <a href={urls.webcal} className='flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3 font-semibold text-white hover:opacity-80'>
                    <CalendarCheck className='h-5 w-5' aria-hidden /> Add to this iPhone&apos;s Calendar
                </a>
                <div className='grid grid-cols-2 gap-2'>
                    <a
                        href={`sms:?&body=${encodeURIComponent(message)}`}
                        className='flex items-center justify-center gap-2 rounded-xl py-3 font-semibold ring-1 ring-gray-300 hover:bg-gray-50'
                    >
                        <MessageSquare className='h-4 w-4' aria-hidden /> Text the link
                    </a>
                    <button type='button' onClick={copy} className='flex items-center justify-center gap-2 rounded-xl py-3 font-semibold ring-1 ring-gray-300 hover:bg-gray-50'>
                        {copied ? <Check className='h-4 w-4' aria-hidden /> : <Copy className='h-4 w-4' aria-hidden />}
                        {copied ? 'Copied' : 'Copy link'}
                    </button>
                </div>
                <p className='sr-only' aria-live='polite'>
                    {copied ? 'Link copied' : ''}
                </p>
                <ErrorText error={error} />
                <button type='button' onClick={reset} disabled={busy} className='flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-black disabled:opacity-40'>
                    <RefreshCw className='h-4 w-4' aria-hidden /> Make a new link (stops the old one)
                </button>
            </div>
        </Dialog>
    );
}
