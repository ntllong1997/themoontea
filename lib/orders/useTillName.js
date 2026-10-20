'use client';

import { useCallback, useEffect, useState } from 'react';

const TILL_NAME_KEY = 'moonteaTillName';

/** What a browser is called until staff name it. */
export const DEFAULT_TILL_NAME = 'Website';

function readSaved() {
    try {
        return localStorage.getItem(TILL_NAME_KEY)?.trim() || DEFAULT_TILL_NAME;
    } catch {
        return DEFAULT_TILL_NAME; // storage blocked (e.g. private browsing)
    }
}

/**
 * This browser's name in each ticket's payment log ("Cash → Card, Website,
 * 2:14 PM"), like the iPhone app's till name. Saved per device.
 *
 * @returns {[string, (name: string) => void]}
 */
export function useTillName() {
    const [name, setName] = useState(DEFAULT_TILL_NAME);

    useEffect(() => setName(readSaved()), []);

    const rename = useCallback((next) => {
        const trimmed = next.trim();
        try {
            if (trimmed) localStorage.setItem(TILL_NAME_KEY, trimmed);
            else localStorage.removeItem(TILL_NAME_KEY);
        } catch {
            // Not saved, but still used on this page.
        }
        setName(trimmed || DEFAULT_TILL_NAME);
    }, []);

    return [name, rename];
}
