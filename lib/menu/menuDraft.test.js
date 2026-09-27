import test from 'node:test';
import assert from 'node:assert/strict';

import {
    addCategory,
    addGroup,
    addOption,
    moveCategory,
    removeCategory,
    removeGroup,
    removeOption,
    updateCategory,
    updateGroup,
    updateOption,
} from './menuDraft.js';

const draft = () => ({
    categories: [
        { key: 'A', label: 'A', price: 1, visible: true, optionGroups: [] },
        { key: 'B', label: 'B', price: 2, visible: true, optionGroups: [
            { key: 'g1', label: 'Size', role: 'modifier', options: [{ value: 'Small', price: 0 }] },
        ] },
    ],
});

test('edits return a new draft and never touch the original', () => {
    const original = draft();
    const snapshot = JSON.parse(JSON.stringify(original));

    const edited = updateCategory(original, 0, { price: 9 });

    assert.deepEqual(original, snapshot);
    assert.equal(edited.categories[0].price, 9);
    assert.notEqual(edited, original);
});

test('a new category goes at the end, visible, with a unique key', () => {
    const edited = addCategory(draft(), 'A');

    const added = edited.categories.at(-1);
    assert.equal(added.key, 'A 2');
    assert.equal(added.label, 'A');
    assert.equal(added.visible, true);
    assert.deepEqual(added.optionGroups, []);
});

test('a category moves up and down and stays put at the ends', () => {
    assert.deepEqual(moveCategory(draft(), 1, -1).categories.map((c) => c.key), ['B', 'A']);
    assert.deepEqual(moveCategory(draft(), 0, -1).categories.map((c) => c.key), ['A', 'B']);
    assert.deepEqual(moveCategory(draft(), 1, 1).categories.map((c) => c.key), ['A', 'B']);
});

test('a category can be removed', () => {
    assert.deepEqual(removeCategory(draft(), 0).categories.map((c) => c.key), ['B']);
});

test('a new choice group gets a key unique within its category', () => {
    const once = addGroup(draft(), 1);
    const twice = addGroup(once, 1);

    const keys = twice.categories[1].optionGroups.map((g) => g.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(twice.categories[1].optionGroups.at(-1).role, 'modifier');
});

test('groups and options can be edited and removed', () => {
    let edited = updateGroup(draft(), 1, 0, { label: 'Cup' });
    edited = addOption(edited, 1, 0);
    edited = updateOption(edited, 1, 0, 1, { value: 'Large', price: 1.5 });

    assert.equal(edited.categories[1].optionGroups[0].label, 'Cup');
    assert.deepEqual(edited.categories[1].optionGroups[0].options[1], { value: 'Large', price: 1.5 });

    edited = removeOption(edited, 1, 0, 0);
    assert.deepEqual(edited.categories[1].optionGroups[0].options.map((o) => o.value), ['Large']);

    edited = removeGroup(edited, 1, 0);
    assert.deepEqual(edited.categories[1].optionGroups, []);
});
