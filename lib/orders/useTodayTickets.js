'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getTodayOrderRows, subscribeToOrderChanges, todayScope } from '@/lib/db';
import { createTicketCache } from './ticketCache';

// A full re-read now and then, in case a Realtime change went missing. The
// iPhone app's safety refresh runs at the same pace.
const SAFETY_REFRESH_MS = 20000;

// The rows of one save reach Realtime one at a time, a few ms apart; showing
// them together saves a re-render per row.
const PUBLISH_DELAY_MS = 100;

/**
 * Today's tickets at one location, kept live: read once, then updated from
 * Supabase Realtime, with a full re-read every 20 s and whenever the page
 * comes back into view or online. See lib/orders/ticketCache.js.
 *
 * `addRows` and `patchOrder` show this page's own saves straight away.
 *
 * @param {number|null|undefined} locationId
 * @returns {{
 *   history: Array<ReturnType<typeof import('./orderModel').buildOrder>>,
 *   loaded: boolean,
 *   addRows: (rows: Array<object>) => void,
 *   patchOrder: (orderUuid: string, patch: object) => void,
 * }}
 */
export function useTodayTickets(locationId) {
    const [history, setHistory] = useState([]);
    // Whether `history` holds a full read yet, rather than nothing.
    const [loaded, setLoaded] = useState(false);
    const cacheRef = useRef(null);

    useEffect(() => {
        setHistory([]);
        setLoaded(false);
        if (!locationId) return undefined;

        const cache = createTicketCache();
        cacheRef.current = cache;
        let disposed = false;
        let publishTimer = null;

        const publish = () => {
            clearTimeout(publishTimer);
            publishTimer = null;
            if (!disposed) setHistory(cache.orders(todayScope(locationId)));
        };
        const publishSoon = () => {
            publishTimer ??= setTimeout(publish, PUBLISH_DELAY_MS);
        };

        // One full read at a time; asking during one queues one more after it.
        let reading = false;
        let readAgain = false;
        const refresh = async () => {
            if (reading) {
                readAgain = true;
                return;
            }
            reading = true;
            try {
                do {
                    readAgain = false;
                    cache.startRead();
                    try {
                        const rows = await getTodayOrderRows(locationId);
                        if (disposed) return;
                        cache.finishRead(rows, todayScope(locationId));
                        publish();
                        setLoaded(true);
                    } catch (error) {
                        cache.abandonRead();
                        console.error('Failed to fetch order history:', error);
                    }
                } while (readAgain && !disposed);
            } finally {
                reading = false;
            }
        };

        const unsubscribe = subscribeToOrderChanges({
            onChange: (change) => {
                cache.applyChange(change, todayScope(locationId));
                publishSoon();
            },
            // Catches up on whatever happened before (re)joining.
            onSubscribed: refresh,
        });
        refresh();
        const timer = setInterval(refresh, SAFETY_REFRESH_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', refresh);

        return () => {
            disposed = true;
            cacheRef.current = null;
            clearTimeout(publishTimer);
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', refresh);
            unsubscribe();
        };
    }, [locationId]);

    const addRows = useCallback(
        (rows) => {
            const cache = cacheRef.current;
            if (!cache) return;
            cache.addRows(rows, todayScope(locationId));
            setHistory(cache.orders(todayScope(locationId)));
        },
        [locationId]
    );

    const patchOrder = useCallback(
        (orderUuid, patch) => {
            const cache = cacheRef.current;
            if (!cache) return;
            cache.patchOrder(orderUuid, patch, todayScope(locationId));
            setHistory(cache.orders(todayScope(locationId)));
        },
        [locationId]
    );

    return { history, loaded, addRows, patchOrder };
}
