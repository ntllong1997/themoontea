import Link from 'next/link';

export default function HomePage() {
    return (
        <main className='flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-50 p-6'>
            <div className='text-center'>
                <h1 className='text-4xl font-bold tracking-tight'>🌙 The Moon Tea</h1>
                <p className='mt-2 text-gray-500'>Internal Management</p>
            </div>
            <div className='flex w-full max-w-xs flex-col gap-4'>
                <Link
                    href='/orders'
                    className='flex items-center justify-between rounded-2xl bg-black px-6 py-5 text-white shadow-sm transition-opacity hover:opacity-80'
                >
                    <span className='text-lg font-semibold'>Order Track</span>
                    <span className='text-xl'>→</span>
                </Link>
                <Link
                    href='/inventory'
                    className='flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-6 py-5 text-gray-800 shadow-sm transition-colors hover:bg-gray-50'
                >
                    <span className='text-lg font-semibold'>Inventory</span>
                    <span className='text-xl'>→</span>
                </Link>
            </div>
        </main>
    );
}
