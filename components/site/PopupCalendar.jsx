'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarPlus, MapPin, Clock } from 'lucide-react';
import {
    POPUPS,
    dateKey,
    directionsUrl,
    formatTime,
    googleCalendarUrl,
    parseDate,
    upcomingPopups,
} from '@/lib/site/popups';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthTitle = (date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const longDate = (key) =>
    parseDate(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** The whole weeks covering a month, padded with the neighbours' days. */
function monthGrid(month) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: cells }, (_, i) => {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        return day;
    });
}

/**
 * "Today" only exists in the browser — the page itself is static — so it
 * stays null through the server render and the first paint, then fills in.
 */
function useToday() {
    const [today, setToday] = useState(null);
    useEffect(() => setToday(new Date()), []);
    return today;
}

export function NextPopupTeaser() {
    const today = useToday();
    if (!today) return null;
    const [next] = upcomingPopups(POPUPS, today);
    if (!next) return null;
    return (
        <a
            href='#popups'
            className='inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-moon-ink shadow-sm ring-1 ring-moon-caramel/30 transition hover:bg-white'
        >
            <span className='relative flex h-2.5 w-2.5'>
                <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-moon-orange opacity-60' />
                <span className='relative inline-flex h-2.5 w-2.5 rounded-full bg-moon-orange' />
            </span>
            Next pop-up: {longDate(next.date)} · {next.place}
        </a>
    );
}

export default function PopupCalendar() {
    const today = useToday();
    const [month, setMonth] = useState(null);
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        if (today && !month) setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    }, [today, month]);

    const upcoming = useMemo(() => (today ? upcomingPopups(POPUPS, today) : []), [today]);
    const byDate = useMemo(() => {
        const map = new Map();
        for (const popup of upcoming) map.set(popup.date, [...(map.get(popup.date) ?? []), popup]);
        return map;
    }, [upcoming]);

    if (!today || !month) {
        return <div className='h-96 animate-pulse rounded-3xl bg-white/60' aria-hidden />;
    }

    const todayKey = dateKey(today);
    const isCurrentMonth =
        month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
    const shiftMonth = (delta) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
    const listed = selected ? byDate.get(selected) ?? [] : upcoming;

    return (
        <div className='grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start'>
            <div className='rounded-3xl bg-white p-3 shadow-sm ring-1 ring-moon-caramel/20 sm:p-5'>
                <div className='mb-3 flex items-center justify-between'>
                    <button
                        type='button'
                        onClick={() => shiftMonth(-1)}
                        disabled={isCurrentMonth}
                        aria-label='Previous month'
                        className='rounded-full p-2 text-moon-ink transition hover:bg-moon-cream disabled:opacity-25 disabled:hover:bg-transparent'
                    >
                        <ChevronLeft className='h-5 w-5' />
                    </button>
                    <h3 className='font-display text-xl text-moon-ink'>{monthTitle(month)}</h3>
                    <button
                        type='button'
                        onClick={() => shiftMonth(1)}
                        aria-label='Next month'
                        className='rounded-full p-2 text-moon-ink transition hover:bg-moon-cream'
                    >
                        <ChevronRight className='h-5 w-5' />
                    </button>
                </div>

                <div className='grid grid-cols-7 gap-1 text-center'>
                    {WEEKDAYS.map((day) => (
                        <div key={day} className='pb-2 text-[11px] font-bold uppercase tracking-wide text-moon-muted sm:text-xs'>
                            {day.slice(0, 1)}
                            <span className='hidden sm:inline'>{day.slice(1)}</span>
                        </div>
                    ))}
                    {monthGrid(month).map((day) => {
                        const key = dateKey(day);
                        const inMonth = day.getMonth() === month.getMonth();
                        const hasPopup = byDate.has(key);
                        const isToday = key === todayKey;
                        const isSelected = key === selected;
                        return (
                            <button
                                key={key}
                                type='button'
                                disabled={!hasPopup}
                                onClick={() => setSelected(isSelected ? null : key)}
                                aria-pressed={isSelected}
                                aria-label={hasPopup ? `Pop-up on ${longDate(key)}` : undefined}
                                className={[
                                    'relative mx-auto flex aspect-square w-full max-w-11 items-center justify-center rounded-full text-sm transition',
                                    !inMonth && 'invisible',
                                    hasPopup
                                        ? isSelected
                                            ? 'bg-moon-ink font-bold text-white'
                                            : 'bg-moon-caramel font-bold text-white hover:bg-moon-orange'
                                        : 'cursor-default text-moon-ink/70',
                                    key < todayKey && !hasPopup && 'text-moon-ink/25',
                                    isToday && !hasPopup && 'ring-2 ring-moon-caramel/60',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                            >
                                {day.getDate()}
                            </button>
                        );
                    })}
                </div>

                <div className='mt-3 flex items-center gap-4 px-1 text-xs text-moon-muted sm:mt-4'>
                    <span className='flex items-center gap-1.5'>
                        <span className='h-3 w-3 rounded-full bg-moon-caramel' /> Pop-up day
                    </span>
                    <span className='flex items-center gap-1.5'>
                        <span className='h-3 w-3 rounded-full ring-2 ring-moon-caramel/60' /> Today
                    </span>
                </div>
            </div>

            <div>
                {selected && (
                    <button
                        type='button'
                        onClick={() => setSelected(null)}
                        className='mb-3 text-sm font-semibold text-moon-orange hover:underline'
                    >
                        ← Show all upcoming pop-ups
                    </button>
                )}

                {listed.length === 0 ? (
                    <div className='rounded-3xl border-2 border-dashed border-moon-caramel/40 bg-white/50 p-8 text-center'>
                        <p className='text-4xl'>🌙</p>
                        <p className='mt-3 font-display text-xl text-moon-ink'>New dates coming soon</p>
                        <p className='mx-auto mt-2 max-w-sm text-moon-muted'>
                            We&apos;re planning our next pop-ups right now. Check back here soon to see where to
                            find us.
                        </p>
                    </div>
                ) : (
                    <ul className='space-y-4'>
                        {listed.map((popup) => (
                            <PopupCard key={`${popup.date}-${popup.start}`} popup={popup} isToday={popup.date === todayKey} />
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function PopupCard({ popup, isToday }) {
    const date = parseDate(popup.date);
    return (
        <li className='rounded-3xl bg-white p-4 shadow-sm ring-1 ring-moon-caramel/20 sm:p-5'>
            <div className='flex gap-3 sm:gap-4'>
                <div className='flex w-16 shrink-0 flex-col items-center justify-center self-start rounded-2xl bg-moon-caramel py-2 text-white sm:w-20'>
                    <span className='text-xs font-bold uppercase tracking-wider'>
                        {date.toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <span className='font-display text-3xl leading-none'>{date.getDate()}</span>
                    <span className='text-xs font-semibold'>
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                </div>
                <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                        <h3 className='font-display text-lg leading-tight text-moon-ink sm:text-xl'>{popup.name}</h3>
                        {isToday && (
                            <span className='rounded-full bg-moon-orange px-2 py-0.5 text-xs font-bold text-white'>
                                Today!
                            </span>
                        )}
                    </div>
                    <p className='mt-1 flex items-center gap-1.5 text-sm text-moon-muted'>
                        <Clock className='h-4 w-4 shrink-0' />
                        {formatTime(popup.start)} – {formatTime(popup.end)}
                    </p>
                    <p className='mt-0.5 flex items-start gap-1.5 text-sm text-moon-muted'>
                        <MapPin className='mt-0.5 h-4 w-4 shrink-0' />
                        <span>
                            {popup.place}
                            {popup.address && <span className='block'>{popup.address}</span>}
                        </span>
                    </p>
                    {popup.note && <p className='mt-2 text-sm text-moon-ink'>{popup.note}</p>}
                </div>
            </div>
            <div className='mt-3 grid grid-cols-2 gap-2 sm:ml-24 sm:flex sm:flex-wrap'>
                <a
                    href={directionsUrl(popup)}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center justify-center gap-1.5 rounded-full bg-moon-ink px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-moon-orange sm:py-1.5'
                >
                    <MapPin className='h-4 w-4' /> Directions
                </a>
                <a
                    href={googleCalendarUrl(popup)}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center justify-center gap-1.5 rounded-full bg-moon-cream px-3.5 py-2.5 text-sm font-semibold text-moon-ink ring-1 ring-moon-caramel/40 transition hover:bg-white sm:py-1.5'
                >
                    <CalendarPlus className='h-4 w-4' /> Save date
                </a>
            </div>
        </li>
    );
}
