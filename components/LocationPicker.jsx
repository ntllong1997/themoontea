'use client';

import { useState } from 'react';
import { LOCATIONS, locationLabel, useDeviceLocation } from '@/lib/locations';

// Full-screen "which location is this device at?" prompt. Shown the first time
// the till, a station or the home page opens on a device, and when changing it.
export default function LocationPicker({ onPick }) {
    return (
        <div className='fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gray-50 p-6'>
            <div className='text-center'>
                <h1 className='text-2xl font-bold'>Which location is this device at?</h1>
                <p className='mt-2 text-sm text-gray-500'>
                    Saved on this device. You can change it from the home screen.
                </p>
            </div>
            <div className='flex w-full max-w-xs flex-col gap-4'>
                {LOCATIONS.map(({ id, label }) => (
                    <button
                        key={id}
                        type='button'
                        onClick={() => onPick(id)}
                        className='rounded-2xl bg-black px-6 py-5 text-lg font-semibold text-white shadow-sm transition-opacity hover:opacity-80'
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// "📍 Location 1 · Change" line for the home page.
export function DeviceLocationSwitch() {
    const [locationId, setLocationId] = useDeviceLocation();
    const [isChanging, setIsChanging] = useState(false);

    if (locationId === undefined) return null;

    if (locationId === null || isChanging) {
        return (
            <LocationPicker
                onPick={(id) => {
                    setLocationId(id);
                    setIsChanging(false);
                }}
            />
        );
    }

    return (
        <p className='mt-3 text-sm text-gray-600'>
            📍 {locationLabel(locationId)} ·{' '}
            <button
                type='button'
                onClick={() => setIsChanging(true)}
                className='font-medium text-blue-600 hover:underline'
            >
                Change
            </button>
        </p>
    );
}
