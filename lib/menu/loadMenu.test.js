import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_MENU_CONFIG } from './defaultMenu.js';
import { MENU_SOURCES, loadMenuConfig } from './loadMenu.js';

const savedMenu = {
    categories: [{ key: 'Mochi', label: 'Mochi', price: 4, visible: true, optionGroups: [] }],
};
const cachedMenu = {
    categories: [{ key: 'Cached', label: 'Cached', price: 3, visible: true, optionGroups: [] }],
};

/** A cache double that records what was written. */
function memoryCache(initial = null) {
    const written = [];
    return {
        written,
        read: () => initial,
        write: (config) => written.push(config),
    };
}

test('a saved menu is used and cached for when the network drops', async () => {
    const cache = memoryCache();

    const result = await loadMenuConfig({ fetchConfig: async () => savedMenu, cache });

    assert.equal(result.source, MENU_SOURCES.saved);
    assert.deepEqual(result.config, savedMenu);
    assert.deepEqual(cache.written, [savedMenu]);
});

test('with no saved menu yet, the built-in menu is used', async () => {
    const result = await loadMenuConfig({ fetchConfig: async () => null, cache: memoryCache(cachedMenu) });

    assert.equal(result.source, MENU_SOURCES.builtIn);
    assert.deepEqual(result.config, DEFAULT_MENU_CONFIG);
});

test('when the fetch fails, the last menu this device saw is used', async () => {
    const fetchConfig = async () => { throw new Error('offline'); };

    const result = await loadMenuConfig({ fetchConfig, cache: memoryCache(cachedMenu) });

    assert.equal(result.source, MENU_SOURCES.cached);
    assert.deepEqual(result.config, cachedMenu);
});

test('when the fetch fails and nothing is cached, the built-in menu is used', async () => {
    const fetchConfig = async () => { throw new Error('offline'); };

    const result = await loadMenuConfig({ fetchConfig, cache: memoryCache(null) });

    assert.equal(result.source, MENU_SOURCES.builtIn);
    assert.ok(result.error instanceof Error);
});

test('an invalid saved menu is never used or cached', async () => {
    const cache = memoryCache(cachedMenu);

    const result = await loadMenuConfig({ fetchConfig: async () => ({ categories: [] }), cache });

    assert.equal(result.source, MENU_SOURCES.cached);
    assert.deepEqual(cache.written, []);
});

test('an invalid cached menu is ignored in favour of the built-in one', async () => {
    const fetchConfig = async () => { throw new Error('offline'); };

    const result = await loadMenuConfig({ fetchConfig, cache: memoryCache({ categories: 'junk' }) });

    assert.equal(result.source, MENU_SOURCES.builtIn);
});

test('a cache that throws never breaks loading', async () => {
    const cache = {
        read: () => { throw new Error('private mode'); },
        write: () => { throw new Error('quota'); },
    };

    const result = await loadMenuConfig({ fetchConfig: async () => savedMenu, cache });

    assert.equal(result.source, MENU_SOURCES.saved);
});
