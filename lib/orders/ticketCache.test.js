// Run with: npm test  (node --test, no extra dependencies)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTicketCache, isInScope } from './ticketCache.js';

// Today, as lib/db.js's dayBounds() would send it for a UTC device.
const scope = { locationId: 1, start: '2026-10-22T00:00:00.000Z', end: '2026-10-23T00:00:00.000Z' };

// Rows come back from Supabase with no zone marker (see parseOrderTimestamp).
const row = (id, orderNumber, extra = {}) => ({
    id,
    orderNumber,
    location: 1,
    name: 'Original',
    price: 5,
    type: 'corndog',
    timestamp: '2026-10-22T15:00:00',
    status: 'pending',
    order_uuid: `uuid-${orderNumber}`,
    payment_log: [],
    ...extra,
});

const loaded = (rows) => {
    const cache = createTicketCache();
    cache.startRead();
    cache.finishRead(rows, scope);
    return cache;
};

test('a full read groups rows into orders, newest first', () => {
    const cache = loaded([row('a', 1), row('b', 2), row('c', 2)]);
    const orders = cache.orders(scope);
    assert.deepEqual(orders.map((o) => o.orderNumber), [2, 1]);
    assert.equal(orders[0].items.length, 2);
});

test("an order's items keep their order whatever order the rows arrive in", () => {
    const one = loaded([row('a', 1), row('b', 1), row('c', 1)]);
    const other = loaded([row('c', 1), row('a', 1), row('b', 1)]);
    const ids = (cache) => cache.orders(scope)[0].items.map((i) => i.id);
    assert.deepEqual(ids(one), ['a', 'b', 'c']);
    assert.deepEqual(ids(other), ['a', 'b', 'c']);
});

test('Realtime inserts, updates and deletes are applied by row id', () => {
    const cache = loaded([row('a', 1)]);
    cache.applyChange({ type: 'INSERT', record: row('b', 2) }, scope);
    cache.applyChange({ type: 'INSERT', record: row('b', 2) }, scope); // the echo is a no-op
    cache.applyChange({ type: 'UPDATE', record: row('a', 1, { status: 'paid' }) }, scope);
    assert.deepEqual(cache.orders(scope).map((o) => [o.orderNumber, o.items.length, o.status]), [
        [2, 1, 'pending'],
        [1, 1, 'paid'],
    ]);

    // A DELETE carries only the primary key.
    cache.applyChange({ type: 'DELETE', record: {}, oldRecord: { id: 'b' } }, scope);
    assert.deepEqual(cache.orders(scope).map((o) => o.orderNumber), [1]);
});

test("other locations' and other days' rows are left out", () => {
    const cache = loaded([]);
    cache.applyChange({ type: 'INSERT', record: row('x', 1, { location: 2 }) }, scope);
    cache.applyChange({ type: 'INSERT', record: row('y', 1, { timestamp: '2026-10-21T23:59:59' }) }, scope);
    assert.deepEqual(cache.orders(scope), []);
});

test('an update that moves a row to another location drops it', () => {
    const cache = loaded([row('a', 1)]);
    cache.applyChange({ type: 'UPDATE', record: row('a', 1, { location: 2 }) }, scope);
    assert.deepEqual(cache.orders(scope), []);
});

test("yesterday's tickets go once the day turns, without a full read", () => {
    const cache = loaded([row('a', 1, { timestamp: '2026-10-22T23:30:00' })]);
    const tomorrow = { ...scope, start: '2026-10-23T00:00:00.000Z', end: '2026-10-24T00:00:00.000Z' };
    assert.deepEqual(cache.orders(tomorrow), []);
});

test('a ticket saved without a location is Location 1', () => {
    assert.equal(isInScope(row('a', 1, { location: null }), scope), true);
    assert.equal(isInScope(row('a', 1, { location: null }), { ...scope, locationId: 2 }), false);
});

test("this page's payment shows at once on every row of the ticket", () => {
    const cache = loaded([row('a', 1), row('b', 1), row('c', 2)]);
    cache.patchOrder('uuid-1', { status: 'paid', paymentMethod: 'cash' }, scope);
    const byNumber = Object.fromEntries(cache.orders(scope).map((o) => [o.orderNumber, o]));
    assert.equal(byNumber[1].status, 'paid');
    assert.equal(byNumber[1].paymentMethod, 'cash');
    assert.equal(byNumber[2].status, 'pending');
});

test('a read that left before a payment does not show the ticket unpaid again', () => {
    // The read leaves, the payment saves, then the read's answer arrives.
    const cache = loaded([row('a', 1)]);
    cache.startRead();
    cache.patchOrder('uuid-1', { status: 'paid', paymentMethod: 'cash' }, scope);
    cache.finishRead([row('a', 1)], scope);
    assert.equal(cache.orders(scope)[0].status, 'paid');
});

test('a read that left before a new order does not remove it', () => {
    const cache = loaded([row('a', 1)]);
    cache.startRead();
    cache.addRows([row('b', 2)], scope);
    cache.finishRead([row('a', 1)], scope);
    assert.deepEqual(cache.orders(scope).map((o) => o.orderNumber), [2, 1]);
});

test('Realtime changes that land while a read is out survive its answer', () => {
    const cache = loaded([row('a', 1), row('b', 2)]);
    cache.startRead();
    cache.applyChange({ type: 'INSERT', record: row('c', 3) }, scope);
    cache.applyChange({ type: 'DELETE', oldRecord: { id: 'b' } }, scope);
    cache.finishRead([row('a', 1), row('b', 2)], scope);
    assert.deepEqual(cache.orders(scope).map((o) => o.orderNumber), [3, 1]);
});

test('a full read drops rows deleted while nothing was listening', () => {
    const cache = loaded([row('a', 1), row('b', 2)]);
    cache.startRead();
    cache.finishRead([row('a', 1)], scope);
    assert.deepEqual(cache.orders(scope).map((o) => o.orderNumber), [1]);
});

test('a failed read keeps what was there and stops noting changes', () => {
    const cache = loaded([row('a', 1)]);
    cache.startRead();
    cache.abandonRead();
    cache.applyChange({ type: 'INSERT', record: row('b', 2) }, scope);
    assert.deepEqual(cache.orders(scope).map((o) => o.orderNumber), [2, 1]);
    // Nothing replays onto the next read, so a later delete still holds.
    cache.startRead();
    cache.finishRead([row('a', 1)], scope);
    assert.deepEqual(cache.orders(scope).map((o) => o.orderNumber), [1]);
});
