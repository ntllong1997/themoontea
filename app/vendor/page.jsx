import Link from 'next/link';
import { DeviceLocationSwitch } from '@/components/LocationPicker';

export const metadata = { title: 'Staff hub' };

export default function VendorPage() {
    return (
        <div className='flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-50 p-6'>
            <div className='text-center'>
                <h1 className='text-4xl font-bold tracking-tight'>🌙 The Moon Tea</h1>
                <p className='mt-2 text-gray-500'>Internal Management</p>
                <DeviceLocationSwitch />
            </div>
            <div className='flex w-full max-w-xs flex-col gap-4'>
                <Link
                    href='/order'
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
                <Link
                    href='/summary'
                    className='flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-6 py-5 text-gray-800 shadow-sm transition-colors hover:bg-gray-50'
                >
                    <span className='text-lg font-semibold'>Sales Summary</span>
                    <span className='text-xl'>→</span>
                </Link>
                <Link
                    href='/admin/menu'
                    className='flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-6 py-5 text-gray-800 shadow-sm transition-colors hover:bg-gray-50'
                >
                    <span className='text-lg font-semibold'>Menu Items</span>
                    <span className='text-xl'>→</span>
                </Link>
                <Link
                    href='/admin/popups'
                    className='flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-6 py-5 text-gray-800 shadow-sm transition-colors hover:bg-gray-50'
                >
                    <span className='text-lg font-semibold'>Pop-up Calendar</span>
                    <span className='text-xl'>→</span>
                </Link>
                <Link
                    href='/menu'
                    className='flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-6 py-5 text-gray-800 shadow-sm transition-colors hover:bg-gray-50'
                >
                    <span className='text-lg font-semibold'>Customer Menu Site</span>
                    <span className='text-xl'>→</span>
                </Link>
            </div>
            <form action='/api/logout' method='post'>
                <button type='submit' className='text-sm text-gray-500 hover:text-gray-600 hover:underline'>
                    Sign out
                </button>
            </form>
        </div>
    );
}
