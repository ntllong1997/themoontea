import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { drinkCount, groupItems, shopSections } from './menu.js';

const menu = JSON.parse(readFileSync(new URL('./menu.json', import.meta.url), 'utf8'));
const publicDir = fileURLToPath(new URL('../../public', import.meta.url));
const allItems = menu.categories.flatMap((c) => c.items);

test('menu.json is well formed', () => {
    const categoryIds = menu.categories.map((c) => c.id);
    assert.equal(new Set(categoryIds).size, categoryIds.length, 'category ids are unique');
    const itemIds = allItems.map((i) => i.id);
    assert.equal(new Set(itemIds).size, itemIds.length, 'item ids are unique across the menu');
    for (const category of menu.categories) {
        assert.ok(category.name, category.id);
        assert.ok(['drink', 'topping', 'food'].includes(category.kind), category.id);
        assert.ok(category.items.length > 0, `${category.id} has items`);
    }
    for (const item of allItems) {
        assert.match(item.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, item.id);
        assert.ok(item.name, item.id);
        assert.ok(item.price === null || (typeof item.price === 'number' && item.price >= 0), item.id);
        assert.ok(item.description === null || typeof item.description === 'string', item.id);
        for (const option of item.options ?? []) assert.ok(option.name && option.choices.length > 0, item.id);
    }
    for (const option of menu.drinkOptions) assert.ok(option.name && option.choices.length > 0);
});

test('every photo exists, and every photo in public/shop is used', () => {
    const images = allItems.map((i) => i.image).filter(Boolean);
    for (const image of images) assert.ok(existsSync(publicDir + image), `missing ${image}`);
    const used = new Set(images);
    for (const file of readdirSync(`${publicDir}/shop`)) {
        assert.ok(used.has(`/shop/${file}`), `public/shop/${file} is not on the menu`);
    }
});

test('the corndog is built from an inside and an outside', () => {
    const corndog = shopSections(menu).find((s) => s.id === 'korean-corndog');
    assert.deepEqual(
        corndog.groups.map((g) => [g.name, g.items.map((i) => i.name)]),
        [
            ['Inside', ['Sausage', 'Half & Half', 'Cheese']],
            ['Outside', ['Hot Cheeto', 'Potato', 'Original', 'Corn Flakes', 'Fruity Cereal', 'Ramen']],
        ]
    );
});

test('a price every item shares shows once on the section', () => {
    const toppings = shopSections(menu).find((s) => s.id === 'toppings');
    assert.equal(toppings.price, '$0.75');
    assert.ok(toppings.items.every((i) => i.price === null));

    const [mixed] = shopSections({
        categories: [{ id: 'x', name: 'X', kind: 'food', items: [{ id: 'a', price: 5 }, { id: 'b', price: 6 }] }],
    });
    assert.equal(mixed.price, null);
    assert.deepEqual(mixed.items.map((i) => i.price), ['$5', '$6']);

    const [unpriced] = shopSections({
        categories: [{ id: 'x', name: 'X', kind: 'food', items: [{ id: 'a', price: null }, { id: 'b', price: null }] }],
    });
    assert.equal(unpriced.price, null);

    const [alone] = shopSections({ categories: [{ id: 'x', name: 'X', kind: 'food', items: [{ id: 'a', price: 9 }] }] });
    assert.equal(alone.price, null);
    assert.equal(alone.items[0].price, '$9');
});

test('groupItems keeps menu order and bunches by group', () => {
    const groups = groupItems([
        { id: 'a', group: 'X' },
        { id: 'b' },
        { id: 'c', group: 'X' },
    ]);
    assert.deepEqual(
        groups.map((g) => [g.name, g.items.map((i) => i.id)]),
        [
            ['X', ['a', 'c']],
            [null, ['b']],
        ]
    );
});

test('drinkCount counts only drinks', () => {
    const drinks = menu.categories.filter((c) => c.kind === 'drink').flatMap((c) => c.items);
    assert.equal(drinkCount(menu), drinks.length);
    assert.equal(drinkCount(menu), 62);
});
