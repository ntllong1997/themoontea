'use client';

import { useCallback, useEffect, useState } from 'react';
import { PREP_STORAGE_KEY, dayKey, parseStages, serializeStages, withStage } from './prepProgress';

function readSaved() {
    try {
        return parseStages(localStorage.getItem(PREP_STORAGE_KEY), dayKey());
    } catch {
        return {}; // storage blocked (e.g. private browsing): progress lives in the page only
    }
}

/**
 * Station progress shared by every page on this device: the order page and
 * each station page show the same stage, and it survives reloads and
 * restarts. Pages open in other tabs follow along through the `storage` event.
 *
 * @returns {{ stageOf: (rowId: string) => string|undefined, setStage: (rowId: string, stage: string) => void }}
 */
export function usePrepProgress() {
    const [byRow, setByRow] = useState({});

    useEffect(() => {
        setByRow(readSaved());
        const onStorage = (event) => {
            if (event.key === PREP_STORAGE_KEY) setByRow(readSaved());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const setStage = useCallback((rowId, stage) => {
        setByRow((prev) => {
            const next = withStage(prev, rowId, stage);
            try {
                localStorage.setItem(PREP_STORAGE_KEY, serializeStages(next, dayKey()));
            } catch (err) {
                console.error('[prep] could not save progress:', err);
            }
            return next;
        });
    }, []);

    const stageOf = useCallback((rowId) => byRow[rowId], [byRow]);

    return { stageOf, setStage };
}
