import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_MENU_CONFIG } from './defaultMenu.js';
import { MAX_PRICE, newCategoryKey, parseMenuConfig } from './menuConfig.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const withCategories = (...categories) => ({ categories });

const fixed = (key, price = 5, extra = {}) => ({
    key, label: key, price, visible: true, optionGroups: [], ...extra,
});

// ── Accepting ────────────────────────────────────────────────────────────────

test('the built-in menu is valid and survives a round trip unchanged', () => {
    const { config, errors } = parseMenuConfig(clone(DEFAULT_MENU_CONFIG));

    assert.deepEqual(errors, []);
    assert.deepEqual(config, clone(DEFAULT_MENU_CONFIG));
});

test('text is trimmed and prices are rounded to the cent', () => {
    const raw = withCategories({
        key: ' Mochi ', label: '  Mochi  ', price: 4.499999, visible: true,
        optionGroups: [{ key: 'f', label: ' Flavor ', role: 'modifier',
            options: [{ value: ' Ube ', price: 0.1 + 0.2 }] }],
    });

    const { config, errors } = parseMenuConfig(raw);

    assert.deepEqual(errors, []);
    const [mochi] = config.categories;
    assert.equal(mochi.key, 'Mochi');
    assert.equal(mochi.label, 'Mochi');
    assert.equal(mochi.price, 4.5);
    assert.equal(mochi.optionGroups[0].label, 'Flavor');
    assert.deepEqual(mochi.optionGroups[0].options, [{ value: 'Ube', price: 0.3 }]);
});

test('a missing visible flag means visible, and a plain string option is free', () => {
    const raw = withCategories({
        key: 'Mochi', label: 'Mochi', price: 4, optionGroups: [
            { key: 'f', label: 'Flavor', role: 'modifier', options: ['Ube'] },
        ],
    });

    const { config } = parseMenuConfig(raw);

    assert.equal(config.categories[0].visible, true);
    assert.deepEqual(config.categories[0].optionGroups[0].options, [{ value: 'Ube', price: 0 }]);
});

test('unknown fields are dropped rather than stored', () => {
    const { config } = parseMenuConfig(withCategories(fixed('Mochi', 4, { flow: 'x', color: 'red' })));

    assert.deepEqual(Object.keys(config.categories[0]).sort(),
        ['key', 'label', 'optionGroups', 'price', 'visible']);
});

// ── Rejecting ────────────────────────────────────────────────────────────────

test('anything without a categories list is rejected', () => {
    for (const raw of [null, undefined, 'menu', 42, {}, { categories: 'nope' }]) {
        const { config, errors } = parseMenuConfig(raw);
        assert.equal(config, null);
        assert.ok(errors.length > 0, `accepted ${JSON.stringify(raw)}`);
    }
});

test('an empty menu is rejected, so a bad save cannot wipe the till', () => {
    const { config, errors } = parseMenuConfig(withCategories());

    assert.equal(config, null);
    assert.match(errors[0], /at least one item/i);
});

test('two categories may not share a key or a name', () => {
    assert.match(parseMenuConfig(withCategories(fixed('Mochi'), fixed('Mochi'))).errors.join(), /Mochi/);

    const sameLabel = withCategories(fixed('Mochi'), { ...fixed('Mochi 2'), label: 'Mochi' });
    assert.ok(parseMenuConfig(sameLabel).errors.length > 0);
});

test('a category may not take a key the code owns', () => {
    const { errors } = parseMenuConfig(withCategories(fixed('Discount')));

    assert.match(errors.join(), /Discount/);
});

test('a price must be a number from 0 up to the maximum', () => {
    for (const price of [-1, NaN, Infinity, '5', null, MAX_PRICE + 1]) {
        const { errors } = parseMenuConfig(withCategories(fixed('Mochi', price)));
        assert.ok(errors.length > 0, `accepted price ${String(price)}`);
    }
});

test('an option group needs a valid role, at least one option and unique values', () => {
    const group = (overrides) => withCategories({
        ...fixed('Mochi'),
        optionGroups: [{ key: 'f', label: 'Flavor', role: 'modifier', options: ['Ube'], ...overrides }],
    });

    assert.ok(parseMenuConfig(group({ role: 'garnish' })).errors.length > 0);
    assert.ok(parseMenuConfig(group({ options: [] })).errors.length > 0);
    assert.ok(parseMenuConfig(group({ options: ['Ube', ' Ube '] })).errors.length > 0);
    assert.ok(parseMenuConfig(group({ options: [''] })).errors.length > 0);
});

test('two groups in one category may not share a key', () => {
    const raw = withCategories({
        ...fixed('Mochi'),
        optionGroups: [
            { key: 'f', label: 'Flavor', role: 'modifier', options: ['Ube'] },
            { key: 'f', label: 'Size', role: 'modifier', options: ['Big'] },
        ],
    });

    assert.ok(parseMenuConfig(raw).errors.length > 0);
});

test('an item whose receipt name collides with another category is rejected', () => {
    // The sales summary groups by the printed name, so a "Cheese Potato" mochi
    // would be merged into the Cheese Potato corndog's count and revenue.
    const raw = clone(DEFAULT_MENU_CONFIG);
    raw.categories.push({
        ...fixed('Mochi'),
        optionGroups: [{ key: 'f', label: 'Flavor', role: 'name', options: ['Cheese Potato'] }],
    });

    const { config, errors } = parseMenuConfig(raw);

    assert.equal(config, null);
    assert.match(errors.join(), /Cheese Potato/);
});

// ── New category keys ────────────────────────────────────────────────────────

test('a new category is keyed by its trimmed name', () => {
    assert.equal(newCategoryKey('  Mochi Donut ', []), 'Mochi Donut');
});

test('a new category never reuses an existing or reserved key', () => {
    // Reusing a hidden category's key would relabel its old orders.
    assert.equal(newCategoryKey('Mochi', ['Mochi']), 'Mochi 2');
    assert.equal(newCategoryKey('Mochi', ['Mochi', 'Mochi 2']), 'Mochi 3');
    assert.equal(newCategoryKey('Discount', []), 'Discount 2');
});
