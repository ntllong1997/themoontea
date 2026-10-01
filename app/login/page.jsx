'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
    const searchParams = useSearchParams();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // Only ever return to a page on this site.
    const next = searchParams.get('next');
    const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/vendor';

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            if (response.ok) {
                window.location.assign(destination);
                return;
            }
            const body = await response.json().catch(() => ({}));
            setError(body.error ?? 'Could not sign in');
        } catch {
            setError('Could not reach the server. Check the internet connection.');
        }
        setBusy(false);
    }

    return (
        <form onSubmit={submit} className='w-full max-w-xs space-y-4'>
            <div className='text-center'>
                <h1 className='text-3xl font-bold tracking-tight'>🌙 The Moon Tea</h1>
                <p className='mt-2 text-gray-500'>Staff sign in</p>
            </div>
            <input
                type='password'
                autoFocus
                autoComplete='current-password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder='Password'
                aria-label='Password'
                className='w-full rounded-2xl border border-gray-200 bg-white px-5 py-4 text-lg outline-none focus:border-black'
            />
            {error && <p className='text-center text-sm font-medium text-red-600'>{error}</p>}
            <button
                type='submit'
                disabled={busy || !password}
                className='w-full rounded-2xl bg-black px-6 py-4 text-lg font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-40'
            >
                {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className='text-center text-xs text-gray-400'>This device stays signed in for 30 days.</p>
        </form>
    );
}

export default function LoginPage() {
    return (
        <main className='flex min-h-screen items-center justify-center bg-gray-50 p-6'>
            <Suspense>
                <LoginForm />
            </Suspense>
        </main>
    );
}
