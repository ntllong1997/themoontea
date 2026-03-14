'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }) {
    useEffect(() => { console.error(error); }, [error]);

    return (
        <main className='flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4'>
            <h2 className='text-2xl font-bold text-gray-900'>Something went wrong</h2>
            <p className='mt-2 text-sm text-gray-500'>{error?.message || 'An unexpected error occurred.'}</p>
            <button
                onClick={reset}
                className='mt-6 rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800'
            >
                Try again
            </button>
        </main>
    );
}
