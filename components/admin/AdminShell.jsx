'use client';

// Shared frame for the staff pages that edit the customer site: the header,
// a switch between Menu Items and Pop-up Calendar, and a setup-problem banner.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/site/adminApi';

const PAGES = [
    { id: 'items', href: '/admin/menu', label: '🧋 Menu items' },
    { id: 'popups', href: '/admin/popups', label: '📅 Pop-up calendar' },
];

export default function AdminShell({ active, title, children }) {
    return (
        <div className='min-h-screen bg-gray-50 pb-24'>
            <header className='sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur'>
                <div className='mx-auto flex max-w-3xl items-center gap-3 px-4 py-3'>
                    <Link href='/vendor' className='text-sm text-gray-500 hover:text-gray-600'>
                        ← Back
                    </Link>
                    <h1 className='text-xl font-bold'>{title}</h1>
                    <a
                        href='/menu'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='ml-auto text-sm font-medium text-blue-600 hover:underline'
                    >
                        View menu <span aria-hidden>↗</span>
                        <span className='sr-only'> (opens in a new tab)</span>
                    </a>
                </div>
                <nav aria-label='Site editor pages' className='mx-auto max-w-3xl px-4 pb-3'>
                    <div className='grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1'>
                        {PAGES.map((page) => (
                            <Link
                                key={page.id}
                                href={page.href}
                                aria-current={active === page.id ? 'page' : undefined}
                                className={`rounded-lg py-2.5 text-center text-sm font-semibold transition-colors ${
                                    active === page.id ? 'bg-black text-white shadow-sm' : 'text-gray-700 hover:bg-white'
                                }`}
                            >
                                {page.label}
                            </Link>
                        ))}
                    </div>
                </nav>
            </header>
            <SetupCheck />
            {children}
        </div>
    );
}

/** A banner explaining a setup problem (e.g. the service key), if there is one. */
export function SetupCheck() {
    const [problem, setProblem] = useState('');
    useEffect(() => {
        api('/api/admin/status')
            .then((status) => setProblem(status.ok ? '' : status.message))
            .catch((e) => setProblem(e.message === 'Signed out' ? '' : e.message));
    }, []);
    if (!problem) return null;
    return (
        <div className='mx-auto max-w-3xl px-4 pt-4'>
            <div role='alert' className='rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900'>
                <p className='font-bold'>Saving won&apos;t work on this copy of the site yet</p>
                <p className='mt-1'>{problem}</p>
            </div>
        </div>
    );
}
