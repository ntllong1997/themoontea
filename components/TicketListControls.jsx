'use client';

// The History tab's header: this browser's till name (shown in each ticket's
// payment log) and the All / Paid / Cancelled filter.

import { useState } from 'react';
import { HISTORY_FILTERS } from '@/lib/orders/ticketPayments';
import { DEFAULT_TILL_NAME } from '@/lib/orders/useTillName';

export function TillNameRow({ name, onRename }) {
    const [draft, setDraft] = useState(null);

    const save = () => {
        onRename(draft ?? '');
        setDraft(null);
    };

    if (draft !== null) {
        return (
            <div className='flex items-center gap-2 px-1 text-sm'>
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') save();
                        if (e.key === 'Escape') setDraft(null);
                    }}
                    placeholder='e.g. Booth iPad'
                    aria-label='Till name'
                    autoFocus
                    className='flex-1 rounded border px-2 py-1 text-sm focus:outline-none focus:border-blue-500'
                />
                <button onClick={save} className='text-xs font-semibold text-blue-600 hover:underline'>Save</button>
                <button onClick={() => setDraft(null)} className='text-xs text-gray-400 hover:text-gray-600'>Cancel</button>
            </div>
        );
    }

    return (
        <div className='flex items-center justify-between px-1 text-sm'>
            <span className='font-semibold text-gray-500' title="Shown in each ticket's payment history">
                This till: {name}
            </span>
            <button
                onClick={() => setDraft(name === DEFAULT_TILL_NAME ? '' : name)}
                className='text-xs font-semibold text-blue-600 hover:underline'
            >
                Rename
            </button>
        </div>
    );
}

/** All / Paid 4 / Cancelled 1 — counts from `history`, the day's tickets. */
export function HistoryFilterBar({ value, onChange, history }) {
    return (
        <div className='flex rounded-lg bg-gray-100 p-0.5 text-sm' role='tablist' aria-label='Show'>
            {HISTORY_FILTERS.map((filter) => {
                const count = history.filter((o) => filter.matches(o.status)).length;
                const label = filter.key === 'all' || count === 0 ? filter.title : `${filter.title} ${count}`;
                const isActive = value === filter.key;
                return (
                    <button
                        key={filter.key}
                        role='tab'
                        aria-selected={isActive}
                        onClick={() => onChange(filter.key)}
                        className={`flex-1 rounded-md py-1.5 font-semibold transition-colors ${isActive ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
