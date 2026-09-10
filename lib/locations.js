'use client';

import { useCallback, useEffect, useState } from 'react';

// The shops orders are split between. `id` is what the `orders.location`
// column stores — rename a location by changing its label here. The iPad app
// is fixed to Location 1 (AppConstants.locationID in Constants.swift).
export const LOCATIONS = [
    { id: 1, label: 'Location 1' },
    { id: 2, label: 'Location 2' },
];

export const locationLabel = (id) =>
    LOCATIONS.find((location) => location.id === id)?.label ?? `Location ${id}`;

const LOCATION_KEY = 'moonteaLocation';

function readSavedLocation() {
    try {
        const id = Number(localStorage.getItem(LOCATION_KEY));
        return LOCATIONS.some((location) => location.id === id) ? id : null;
    } catch {
        return null;
    }
}

/**
 * The location this device is at, chosen once and saved in the browser.
 *
 * `undefined` until localStorage has been read (it does not exist during the
 * server render), then `null` if nothing has been chosen yet — so a page can
 * tell "still loading" apart from "ask which location".
 *
 * @returns {[number | null | undefined, (id: number) => void]}
 */
export function useDeviceLocation() {
    const [locationId, setLocationIdState] = useState(undefined);

    useEffect(() => {
        setLocationIdState(readSavedLocation());
    }, []);

    const setLocationId = useCallback((id) => {
        try { localStorage.setItem(LOCATION_KEY, String(id)); } catch {}
        setLocationIdState(id);
    }, []);

    return [locationId, setLocationId];
}
