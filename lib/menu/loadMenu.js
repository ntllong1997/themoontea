// Which menu a till should use, with its I/O injected so it can be tested
// under plain `node --test`. useMenu.js wires in Supabase and localStorage.
//
// Order of preference:
//   1. the saved menu (valid)          -> also cached on this device
//   2. no saved menu exists yet        -> the built-in menu
//   3. the fetch failed or was invalid -> the last valid menu this device saw,
//                                         else the built-in menu
// A till at a market with flaky signal must keep selling at the prices it last
// knew, not silently jump back to the prices the app shipped with.
import { DEFAULT_MENU_CONFIG } from './defaultMenu.js';
import { parseMenuConfig } from './menuConfig.js';

export const MENU_SOURCES = Object.freeze({
    saved: 'saved',
    cached: 'cached',
    builtIn: 'builtIn',
});

function readValidCache(cache) {
    try {
        return parseMenuConfig(cache.read()).config;
    } catch (error) {
        console.error('menu cache read failed:', error);
        return null;
    }
}

function writeCache(cache, config) {
    try {
        cache.write(config);
    } catch (error) {
        console.error('menu cache write failed:', error);
    }
}

/**
 * @param {{ fetchConfig: () => Promise<unknown|null>,
 *           cache: { read: () => unknown, write: (config: object) => void } }} deps
 *   `fetchConfig` resolves to the stored config, or null when none is saved.
 * @returns {Promise<{ config: object, source: string, error?: Error }>}
 */
export async function loadMenuConfig({ fetchConfig, cache }) {
    let error;
    try {
        const raw = await fetchConfig();
        if (raw === null || raw === undefined) {
            return { config: DEFAULT_MENU_CONFIG, source: MENU_SOURCES.builtIn };
        }

        const { config, errors } = parseMenuConfig(raw);
        if (config) {
            writeCache(cache, config);
            return { config, source: MENU_SOURCES.saved };
        }
        error = new Error(`Saved menu is invalid: ${errors.join(' ')}`);
    } catch (fetchError) {
        error = fetchError;
    }

    console.error('menu load failed, falling back:', error);
    const cached = readValidCache(cache);
    return cached
        ? { config: cached, source: MENU_SOURCES.cached, error }
        : { config: DEFAULT_MENU_CONFIG, source: MENU_SOURCES.builtIn, error };
}
