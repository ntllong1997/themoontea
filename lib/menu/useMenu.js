'use client';

// The live menu for a page. Starts in `isLoading` with the built-in menu (so
// history can still render), then switches to the saved menu — or the last
// one this device saw, if offline. Re-checks every minute so a till left open
// all day picks up edits made on /menu without a reload.
import { useEffect, useState } from 'react';
import { DEFAULT_MENU, buildMenu } from '@/lib/menu/catalog';
import { MENU_SOURCES, loadMenuConfig } from '@/lib/menu/loadMenu';
import { fetchMenuConfig } from '@/lib/menu/menuDb';

const CACHE_KEY = 'moontea.menuConfig.v1';
const REFRESH_INTERVAL_MS = 60_000;

const localStorageCache = {
    read: () => JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'),
    write: (config) => localStorage.setItem(CACHE_KEY, JSON.stringify(config)),
};

/**
 * @returns {{ menu: ReturnType<typeof buildMenu>, isLoading: boolean,
 *             source: string|null }}
 *   `source` is one of MENU_SOURCES once loaded — `cached` means this device
 *   could not reach the saved menu and is using the last one it saw.
 */
export function useMenu() {
    const [state, setState] = useState({ menu: DEFAULT_MENU, isLoading: true, source: null, json: null });

    useEffect(() => {
        let isCancelled = false;

        const refresh = async () => {
            const { config, source } = await loadMenuConfig({
                fetchConfig: fetchMenuConfig,
                cache: localStorageCache,
            });
            if (isCancelled) return;

            // Rebuild only when the menu actually changed, so a quiet refresh
            // does not re-render every panel once a minute.
            const json = JSON.stringify(config);
            setState((prev) => (prev.json === json && prev.source === source
                ? prev
                : { menu: buildMenu(config), isLoading: false, source, json }));
        };

        refresh();
        const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
        return () => {
            isCancelled = true;
            clearInterval(timer);
        };
    }, []);

    return { menu: state.menu, isLoading: state.isLoading, source: state.source };
}

export { MENU_SOURCES };
