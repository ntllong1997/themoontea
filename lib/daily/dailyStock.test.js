import test from 'node:test';
import assert from 'node:assert/strict';

import {
    amount,
    buildBoard,
    checkSnapshot,
    makeTaskRows,
    parseCheckInput,
    parseItemInput,
    parseTaskInput,
    planFromCheck,
    planFromCounts,
    shopDay,
    toCount,
} from './dailyStock.js';

const CHI = 'America/Chicago';

const boba = { id: 'boba', name: 'Boba pearls', kind: 'make', unit: 'tubs', target: 4 };
const jelly = { id: 'jelly', name: 'Lychee jelly', kind: 'make', unit: 'tubs', target: 2 };
const cups = { id: 'cups', name: 'Cups', kind: 'buy', unit: 'sleeves', target: 3 };
const milk = { id: 'milk', name: 'Whole milk', kind: 'buy', unit: 'gal', target: 2 };
const napkins = { id: 'napkins', name: 'Napkins', kind: 'buy', unit: null, target: 0 };
const ITEMS = [boba, jelly, cups, milk, napkins];

test('shopDay rolls over at 4am shop time, not midnight', () => {
    // 2026-10-07 is CDT (UTC-5).
    assert.equal(shopDay(new Date('2026-10-08T02:30:00Z'), CHI), '2026-10-07'); // 9:30pm Oct 7
    assert.equal(shopDay(new Date('2026-10-08T05:30:00Z'), CHI), '2026-10-07'); // 12:30am Oct 8
    assert.equal(shopDay(new Date('2026-10-08T08:59:00Z'), CHI), '2026-10-07'); // 3:59am Oct 8
    assert.equal(shopDay(new Date('2026-10-08T09:00:00Z'), CHI), '2026-10-08'); // 4:00am Oct 8
});

test('shopDay goes by the wall clock on the night the clocks change', () => {
    // Clocks fall back at 2am CDT on 2026-11-01, so 3:59am that morning is
    // 09:59Z, not 08:59Z. Still Oct 31's shop day until 4am on the clock.
    assert.equal(shopDay(new Date('2026-11-01T09:59:00Z'), CHI), '2026-10-31');
    assert.equal(shopDay(new Date('2026-11-01T10:00:00Z'), CHI), '2026-11-01');
    // Spring forward (2026-03-08): 4am CDT is 09:00Z.
    assert.equal(shopDay(new Date('2026-03-08T08:59:00Z'), CHI), '2026-03-07');
    assert.equal(shopDay(new Date('2026-03-08T09:00:00Z'), CHI), '2026-03-08');
});

test('toCount accepts whole numbers 0 or more, typed or not', () => {
    assert.equal(toCount(3), 3);
    assert.equal(toCount('12'), 12);
    assert.equal(toCount(' 0 '), 0);
    for (const bad of ['', '  ', 'two', '1.5', -1, 1.5, null, undefined, NaN, 1e9]) {
        assert.equal(toCount(bad), null, String(bad));
    }
});

test('amount reads naturally for one', () => {
    assert.equal(amount(3, 'tubs'), '3 tubs');
    assert.equal(amount(1, 'tubs'), '1 tub');
    assert.equal(amount(1, 'batches'), '1 batch');
    assert.equal(amount(1, 'boxes'), '1 box');
    assert.equal(amount(1, 'sleeves'), '1 sleeve');
    assert.equal(amount(1, 'gal'), '1 gal');
    assert.equal(amount(1, 'glass'), '1 glass');
    assert.equal(amount(0, 'tubs'), '0 tubs');
    assert.equal(amount(2, null), '2');
});

test('planFromCounts: make the difference, flag low supplies', () => {
    const plan = planFromCounts(ITEMS, { boba: 1, jelly: 2, cups: 0, milk: 1, napkins: 0 });
    assert.deepEqual(
        plan.make.map((i) => [i.id, i.count, i.quantity]),
        [['boba', 1, 3]]
    );
    assert.deepEqual(
        plan.low.map((i) => [i.id, i.count, i.out]),
        [
            ['cups', 0, true],
            ['milk', 1, false],
        ]
    );
});

test('planFromCounts: at or over target is fine; target 0 and blanks are never flagged', () => {
    const plan = planFromCounts(ITEMS, { boba: 4, jelly: 9, cups: 3, napkins: 0 });
    assert.deepEqual(plan, { make: [], low: [] });
});

test('planFromCheck reads a saved snapshot the same way', () => {
    const counts = { boba: 1, jelly: 2, cups: 0, milk: 5, napkins: 0 };
    const check = { counts: checkSnapshot(ITEMS, counts) };
    assert.deepEqual(planFromCheck(check), planFromCounts(ITEMS, counts));
});

test('makeTaskRows puts the make list on the next day', () => {
    const { make } = planFromCounts(ITEMS, { boba: 1, jelly: 0 });
    const rows = makeTaskRows(make, { checkId: 'c1', checkDate: '2026-10-31', by: 'Mai' });
    assert.deepEqual(rows, [
        { kind: 'make', title: 'Boba pearls', quantity: 3, unit: 'tubs', item_id: 'boba', check_id: 'c1', for_date: '2026-11-01', added_by: 'Mai' },
        { kind: 'make', title: 'Lychee jelly', quantity: 2, unit: 'tubs', item_id: 'jelly', check_id: 'c1', for_date: '2026-11-01', added_by: 'Mai' },
    ]);
});

test('parseItemInput tidies an item and rejects bad ones', () => {
    assert.deepEqual(parseItemInput({ name: '  Boba   pearls ', kind: 'make', unit: ' tubs ', target: '4' }), {
        values: { name: 'Boba pearls', kind: 'make', unit: 'tubs', target: 4 },
    });
    assert.deepEqual(parseItemInput({ name: 'Cups', kind: 'buy', unit: '', target: '' }), {
        values: { name: 'Cups', kind: 'buy', unit: null, target: 0 },
    });
    assert.ok(parseItemInput(null).error);
    assert.ok(parseItemInput({ name: ' ', kind: 'make' }).error);
    assert.ok(parseItemInput({ name: 'Boba', kind: 'other' }).error);
    assert.ok(parseItemInput({ name: 'Boba', kind: 'make', target: '-1' }).error);
    assert.ok(parseItemInput({ name: 'Boba', kind: 'make', target: '2.5' }).error);
});

test('parseCheckInput needs a count for every item', () => {
    const id = '3f2b8a52-1c1e-4f7a-9d3e-6b1a2c3d4e5f';
    const all = { boba: '1', jelly: 2, cups: 0, milk: 1, napkins: 5 };
    assert.deepEqual(parseCheckInput({ employeeId: id, employeeName: ' Mai ', counts: all, note: '' }, ITEMS), {
        values: { employeeId: id, employeeName: 'Mai', note: null, counts: { boba: 1, jelly: 2, cups: 0, milk: 1, napkins: 5 } },
    });
    // Not a real id: still saves, without linking the employee.
    assert.equal(parseCheckInput({ employeeId: 'x', employeeName: 'Mai', counts: all }, ITEMS).values.employeeId, null);

    assert.equal(
        parseCheckInput({ employeeName: 'Mai', counts: { boba: 1, cups: '' } }, ITEMS).error,
        'Count every item first: Lychee jelly, Cups, Whole milk and 1 more'
    );
    assert.ok(parseCheckInput({ employeeName: '', counts: all }, ITEMS).error);
    assert.ok(parseCheckInput({ employeeName: 'Mai', counts: {} }, []).error);
    assert.ok(parseCheckInput({ employeeName: 'Mai', counts: { ...all, boba: -2 } }, ITEMS).error);
});

test('parseTaskInput defaults to today and refuses past days', () => {
    const today = '2026-10-07';
    assert.deepEqual(parseTaskInput({ title: ' Clean the  freezer ', addedBy: 'Owner' }, today), {
        values: { kind: 'task', title: 'Clean the freezer', for_date: today, note: null, added_by: 'Owner' },
    });
    assert.equal(parseTaskInput({ title: 'Prep pop-up', forDate: '2026-10-10', note: 'Bring 2 coolers', addedBy: 'Owner' }, today).values.for_date, '2026-10-10');
    assert.ok(parseTaskInput({ title: 'Late', forDate: '2026-10-06', addedBy: 'Owner' }, today).error);
    assert.ok(parseTaskInput({ title: 'Bad', forDate: '2026-02-30', addedBy: 'Owner' }, today).error);
    assert.ok(parseTaskInput({ title: '  ', addedBy: 'Owner' }, today).error);
    assert.ok(parseTaskInput({ title: 'No name' }, today).error);
});

test('buildBoard: carried-over and today to do, later ones upcoming, only today\'s done', () => {
    const today = '2026-10-07';
    let added = 0; // creation order
    const task = (id, overrides) => ({ id, kind: 'task', forDate: today, doneAt: null, createdAt: `2026-10-01T12:0${added++}:00+00:00`, ...overrides });
    const tasks = [
        task('a', { title: 'Wipe fridge' }),
        task('b', { kind: 'make', title: 'Boba' }),
        task('c', { title: 'Old ask', forDate: '2026-10-05' }),
        task('d', { title: 'Pop-up prep', forDate: '2026-10-10' }),
        task('e', { kind: 'make', title: 'Jelly', forDate: '2026-10-08' }),
        // Ticked off at 9pm Oct 7 and at 1am Oct 8 (still the Oct 7 shop day).
        task('f', { title: 'Mop', doneAt: '2026-10-08T02:00:00+00:00' }),
        task('g', { title: 'Restock straws', doneAt: '2026-10-08T06:00:00+00:00' }),
        // Ticked off yesterday: gone.
        task('h', { title: 'Yesterday', forDate: '2026-10-06', doneAt: '2026-10-06T20:00:00+00:00' }),
    ];
    const board = buildBoard(tasks, { today, timeZone: CHI });
    assert.deepEqual(
        board.todo.map((t) => [t.title, t.carriedFrom]),
        [
            ['Boba', null],
            ['Old ask', '2026-10-05'],
            ['Wipe fridge', null],
        ]
    );
    assert.deepEqual(
        board.upcoming.map((t) => t.title),
        ['Jelly', 'Pop-up prep']
    );
    assert.deepEqual(
        board.done.map((t) => t.title),
        ['Restock straws', 'Mop']
    );
});
