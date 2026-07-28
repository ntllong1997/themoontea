import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CATEGORIES,
    CATEGORY_KEYS,
    ORDERABLE_CATEGORIES,
    STATION_CATEGORIES,
    activeAddOns,
    buildCartLine,
    categoryFor,
    categoryForSlug,
    emptySelection,
    flowStateFor,
    initialStateFor,
    isSelectionComplete,
    nextStateFor,
    optionValue,
    priceLabelFor,
} from './catalog.js';
import { formatItemName } from '../orders/orderModel.js';

const corndog = categoryFor('Corndog');
const boba = categoryFor('Boba');

const select = (category, values) => ({
    ...emptySelection(category),
    ...values,
    addOns: { ...emptySelection(category).addOns, ...(values.addOns ?? {}) },
});

// ── Catalog shape ────────────────────────────────────────────────────────────

test('every category key is unique', () => {
    assert.equal(new Set(CATEGORY_KEYS).size, CATEGORY_KEYS.length);
});

/** Every combination of one choice per option group, as full selections. */
const allSelections = (category) =>
    category.optionGroups.reduce(
        (combos, group) =>
            combos.flatMap((combo) =>
                group.options.map((option) => ({ ...combo, [group.key]: optionValue(option) }))
            ),
        [emptySelection(category)]
    );

test('no two orderable products share a line name', () => {
    // The sales summary groups by the flattened name, so two categories that
    // can produce the same string would have their counts and revenue merged —
    // e.g. a $5 "Matcha Strawberry" cookie folded into the $8 boba of that name.
    const seen = new Map();

    for (const category of ORDERABLE_CATEGORIES) {
        for (const selection of allSelections(category)) {
            const name = formatItemName(buildCartLine(category, selection));
            const owner = seen.get(name);
            assert.equal(
                owner,
                undefined,
                `"${name}" is produced by both ${owner} and ${category.key}`
            );
            seen.set(name, category.key);
        }
    }
});

test('a non-orderable category is excluded from the order panel but kept in history', () => {
    // Coupon rows are written by the iPad till with type "Discount". They must
    // stay in CATEGORIES so history and the summary can render them, but they
    // are not something staff can add to a cart.
    const discount = categoryFor('Discount');

    assert.ok(discount, 'Discount is missing from the catalog');
    assert.equal(discount.orderable, false);
    assert.ok(CATEGORY_KEYS.includes('Discount'));
    assert.equal(ORDERABLE_CATEGORIES.includes(discount), false);
});

test('a non-orderable category never builds a cart line', () => {
    const discount = categoryFor('Discount');
    // Its option-group list is empty, so the completeness check alone would
    // pass — `orderable` is what actually holds the line back.
    assert.equal(isSelectionComplete(discount, emptySelection(discount)), true);
    assert.equal(buildCartLine(discount, emptySelection(discount)), null);
});

test('a discount row still resolves a flow state, so history can render it', () => {
    assert.equal(initialStateFor('Discount'), 'applied');
    assert.equal(flowStateFor('Discount', 'applied').badge, 'Coupon');
    assert.equal(flowStateFor('Discount', 'applied').className, 'bg-green-100 text-green-800');
});

test('every category flow is internally consistent', () => {
    for (const { key, flow } of CATEGORIES) {
        assert.ok(flow.states[flow.initial], `${key}: initial state is not defined`);
        for (const [name, state] of Object.entries(flow.states)) {
            assert.ok(flow.states[state.next], `${key}.${name}: next "${state.next}" is not defined`);
        }
    }
});

test('every state paints a background, so no unit renders as blank space', () => {
    // Regression: egg rolls showed a white background in history and were easy
    // to miss. Root cause was a missing Tailwind content glob, but a state with
    // no bg- class of its own would look identical, so pin the shape too.
    for (const { key, flow } of CATEGORIES) {
        for (const [name, state] of Object.entries(flow.states)) {
            assert.match(
                state.className,
                /(^|\s)bg-[a-z]+-\d{2,3}(\s|$)/,
                `${key}.${name} has no background colour: "${state.className}"`
            );
        }
    }
});

test('no two categories share an initial-state colour', () => {
    // Categories must stay distinguishable at a glance on the history screen.
    const seen = new Map();
    for (const { key, flow } of CATEGORIES) {
        const className = flow.states[flow.initial].className;
        const owner = seen.get(className);
        assert.equal(owner, undefined, `${owner} and ${key} both use "${className}"`);
        seen.set(className, key);
    }
});

test('station slugs are unique and resolve back to their category', () => {
    const slugs = STATION_CATEGORIES.map((c) => c.station.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const category of STATION_CATEGORIES) {
        assert.equal(categoryForSlug(category.station.slug), category);
    }
});

// ── Selection completeness ───────────────────────────────────────────────────

test('a fresh selection is incomplete and builds no line', () => {
    assert.equal(isSelectionComplete(corndog, emptySelection(corndog)), false);
    assert.equal(buildCartLine(corndog, emptySelection(corndog)), null);
});

test('a selection is complete only once every option group has a value', () => {
    const partial = select(corndog, { inside: 'Cheese' });
    assert.equal(isSelectionComplete(corndog, partial), false);

    const full = select(corndog, { inside: 'Cheese', outside: 'Original' });
    assert.equal(isSelectionComplete(corndog, full), true);
});

// ── Name and modifier building ───────────────────────────────────────────────

test('name-role groups join into the base name, modifier-role groups do not', () => {
    const line = buildCartLine(boba, select(boba, { drink: 'Brown Sugar', boba: 'Tapioca' }));

    assert.equal(line.name, 'Brown Sugar');
    assert.deepEqual(line.modifiers, ['Tapioca']);
    assert.equal(formatItemName(line), 'Brown Sugar (Tapioca)');
});

test('multiple name-role groups join with a space', () => {
    const line = buildCartLine(corndog, select(corndog, { inside: 'Cheese', outside: 'Potato' }));

    assert.equal(line.name, 'Cheese Potato');
    assert.deepEqual(line.modifiers, []);
});

test('the cart line carries the category key as its type', () => {
    const line = buildCartLine(corndog, select(corndog, { inside: 'Half-Half', outside: 'Original' }));
    assert.equal(line.type, 'Corndog');
});

// ── Add-ons ──────────────────────────────────────────────────────────────────

test('an add-on is offered only when its condition holds', () => {
    const potato = select(corndog, { inside: 'Cheese', outside: 'Potato' });
    assert.deepEqual(activeAddOns(corndog, potato).map((a) => a.key), ['dust']);

    const original = select(corndog, { inside: 'Cheese', outside: 'Original' });
    assert.deepEqual(activeAddOns(corndog, original), []);
});

test('a checked add-on becomes a modifier and adds its price', () => {
    const line = buildCartLine(
        corndog,
        select(corndog, { inside: 'Cheese', outside: 'Potato', addOns: { dust: true } })
    );

    assert.deepEqual(line.modifiers, ['Hot Cheeto Dust']);
    assert.equal(line.price, 9.0);
    assert.equal(formatItemName(line), 'Cheese Potato (Hot Cheeto Dust)');
});

test('a stale add-on is neither charged nor named once its condition lapses', () => {
    // Regression: the old useCart charged $1 whenever the dust flag was set,
    // even after the customer switched away from Potato.
    const line = buildCartLine(
        corndog,
        select(corndog, { inside: 'Cheese', outside: 'Original', addOns: { dust: true } })
    );

    assert.equal(line.price, 8.0);
    assert.deepEqual(line.modifiers, []);
});

test('a drink with a customization offers it, labelled for that drink', () => {
    const matcha = select(boba, { drink: 'Matcha Strawberry', boba: 'Tapioca' });
    assert.deepEqual(
        activeAddOns(boba, matcha).map((a) => a.resolvedLabel),
        ['Only Matcha']
    );

    const taro = select(boba, { drink: 'Golden Taro', boba: 'Tapioca' });
    assert.deepEqual(
        activeAddOns(boba, taro).map((a) => a.resolvedLabel),
        ['Only Taro']
    );
});

test('a drink with no customization offers none', () => {
    const plain = select(boba, { drink: 'Tropical', boba: 'Tapioca' });
    assert.deepEqual(activeAddOns(boba, plain), []);
});

test('a checked customization is appended after the option modifiers, free', () => {
    const line = buildCartLine(
        boba,
        select(boba, {
            drink: 'Matcha Strawberry',
            boba: 'Mango Popping',
            addOns: { customization: true },
        })
    );

    assert.deepEqual(line.modifiers, ['Mango Popping', 'Only Matcha']);
    assert.equal(line.price, 8.0);
    assert.equal(formatItemName(line), 'Matcha Strawberry (Mango Popping, Only Matcha)');
});

// ── Categories with no name-role group ───────────────────────────────────────

test('a flavour-only category is named after itself, with the flavour as a modifier', () => {
    const cookie = categoryFor('Cookie');
    const line = buildCartLine(cookie, select(cookie, { flavor: 'Biscoff' }));

    assert.equal(line.name, 'Cookie');
    assert.deepEqual(line.modifiers, ['Biscoff']);
    assert.equal(line.price, 5.0);
    assert.equal(formatItemName(line), 'Cookie (Biscoff)');
});

test('a cookie flavour that matches a drink name stays distinguishable', () => {
    const cookie = categoryFor('Cookie');
    const boba = categoryFor('Boba');

    const cookieLine = buildCartLine(cookie, select(cookie, { flavor: 'Matcha Strawberry' }));
    const bobaLine = buildCartLine(boba, select(boba, { drink: 'Matcha Strawberry', boba: 'Tapioca' }));

    assert.equal(formatItemName(cookieLine), 'Cookie (Matcha Strawberry)');
    assert.equal(formatItemName(bobaLine), 'Matcha Strawberry (Tapioca)');
    assert.notEqual(formatItemName(cookieLine), formatItemName(bobaLine));
});

test('lemonade carries its base as a modifier', () => {
    const lemonade = categoryFor('Lemonade');
    const line = buildCartLine(lemonade, select(lemonade, { base: 'Soda' }));

    assert.equal(formatItemName(line), 'Lemonade (Soda)');
    assert.equal(line.price, 7.0);
    assert.equal(line.type, 'Lemonade');
});

test('a category with no options at all is immediately addable', () => {
    const eggRoll = categoryFor('Egg Roll');
    const selection = emptySelection(eggRoll);

    // Vacuously complete — there is nothing left to choose.
    assert.equal(isSelectionComplete(eggRoll, selection), true);

    const line = buildCartLine(eggRoll, selection);
    assert.equal(line.name, 'Egg Roll');
    assert.deepEqual(line.modifiers, []);
    assert.equal(line.price, 7.0);
    assert.equal(formatItemName(line), 'Egg Roll');
});

// ── Per-option pricing ───────────────────────────────────────────────────────

test('an option can carry its own price, so one category can hold both', () => {
    const side = categoryFor('Side');

    const water = buildCartLine(side, select(side, { item: 'Water' }));
    const soda = buildCartLine(side, select(side, { item: 'Soda' }));

    assert.equal(water.price, 1.0);
    assert.equal(soda.price, 2.0);
    assert.equal(formatItemName(water), 'Side (Water)');
    assert.equal(formatItemName(soda), 'Side (Soda)');
});

test('a side soda stays distinct from the lemonade soda flavour', () => {
    const side = categoryFor('Side');
    const lemonade = categoryFor('Lemonade');

    const sideSoda = buildCartLine(side, select(side, { item: 'Soda' }));
    const lemonadeSoda = buildCartLine(lemonade, select(lemonade, { base: 'Soda' }));

    assert.notEqual(formatItemName(sideSoda), formatItemName(lemonadeSoda));
    assert.equal(sideSoda.price, 2.0);
    assert.equal(lemonadeSoda.price, 7.0);
});

test('a flat-priced category is unaffected by option pricing', () => {
    const boba = categoryFor('Boba');
    const line = buildCartLine(boba, select(boba, { drink: 'Tropical', boba: 'Tapioca' }));
    assert.equal(line.price, 8.0);
});

test('the panel shows a range when the options carry the price', () => {
    assert.equal(priceLabelFor(categoryFor('Side')), '$1.00 – $2.00');
    assert.equal(priceLabelFor(categoryFor('Boba')), '$8.00');
    assert.equal(priceLabelFor(categoryFor('Egg Roll')), '$7.00');
});

// ── Flow state ───────────────────────────────────────────────────────────────

test('each category starts in its own initial state', () => {
    assert.equal(initialStateFor('Corndog'), 'received');
    assert.equal(initialStateFor('Boba'), 'new');
});

test('clicking a unit advances it through its cycle and wraps', () => {
    assert.equal(nextStateFor('Corndog', 'received'), 'making');
    assert.equal(nextStateFor('Corndog', 'making'), 'ready');
    assert.equal(nextStateFor('Corndog', 'ready'), 'pickedup');
    assert.equal(nextStateFor('Corndog', 'pickedup'), 'received');

    assert.equal(nextStateFor('Boba', 'new'), 'ready');
    assert.equal(nextStateFor('Boba', 'pickedup'), 'new');
});

test('a unit renders its badge, tooltip and colour from the catalog', () => {
    const state = flowStateFor('Boba', 'ready');
    assert.equal(state.badge, 'Ready ✓');
    assert.equal(state.tooltip, 'Click to mark as Picked Up');
    assert.equal(state.className, 'bg-blue-300 text-blue-900');
});

test('an unknown type falls back to the neutral flow instead of throwing', () => {
    // An order placed by a newer client that knows a category this build does
    // not — history must still render rather than crash or silently look like
    // a corndog, which is what the old `type !== "Boba"` fallback did.
    assert.equal(categoryFor('Mochi'), undefined);
    assert.equal(initialStateFor('Mochi'), 'new');
    assert.equal(flowStateFor('Mochi', 'new').badge, 'New');
    assert.equal(nextStateFor('Mochi', 'new'), 'pickedup');
});

test('an unrecognised state falls back to the type initial state', () => {
    assert.equal(flowStateFor('Corndog', 'bogus').badge, 'New');
});
