// Run with: npm test  (node --test, no extra dependencies)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    buildOrder,
    calculateTotalRevenue,
    calculateTotals,
    formatItemName,
    groupRowsToOrders,
    toOrderRows,
} from './orderModel.js';

const bobaLine = {
    name: 'Taro Milk Tea',
    modifiers: ['Tapioca'],
    price: 8,
    type: 'Boba',
    quantity: 2,
};

test('formatItemName appends modifiers in parentheses', () => {
    assert.equal(
        formatItemName({ name: 'Taro Milk Tea', modifiers: ['Tapioca'] }),
        'Taro Milk Tea (Tapioca)'
    );
});

test('formatItemName returns the bare name when there are no modifiers', () => {
    assert.equal(formatItemName({ name: 'Corndog' }), 'Corndog');
});

test('toOrderRows emits one row per physical unit', () => {
    const rows = toOrderRows({
        cartItems: [bobaLine],
        orderNumber: 7,
        timestamp: '2026-07-19T14:05:33.412Z',
        phone: '5550001111',
        paymentMethod: 'cash',
    });

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
        orderNumber: 7,
        name: 'Taro Milk Tea (Tapioca)',
        price: 8,
        type: 'Boba',
        timestamp: '2026-07-19T14:05:33.412Z',
        phone: '5550001111',
        paymentMethod: 'cash',
        quantity: null,
    });
    assert.deepEqual(rows[0], rows[1]);
});

test('toOrderRows flattens modifiers into the name, since there is no modifiers column', () => {
    const [row] = toOrderRows({
        cartItems: [{ ...bobaLine, quantity: 1 }],
        orderNumber: 1,
        timestamp: '2026-07-19T14:05:33.412Z',
    });
    assert.equal(row.name, 'Taro Milk Tea (Tapioca)');
});

test('toOrderRows treats a missing quantity as a single unit', () => {
    const rows = toOrderRows({
        cartItems: [{ name: 'Corndog', price: 8, type: 'Corndog' }],
        orderNumber: 1,
        timestamp: '2026-07-19T14:05:33.412Z',
    });
    assert.equal(rows.length, 1);
});

test('toOrderRows normalises a blank phone to null', () => {
    const [row] = toOrderRows({
        cartItems: [{ ...bobaLine, quantity: 1 }],
        orderNumber: 1,
        timestamp: '2026-07-19T14:05:33.412Z',
        phone: '',
    });
    assert.equal(row.phone, null);
});

test('calculateTotals sums one row per unit', () => {
    const rows = toOrderRows({
        cartItems: [bobaLine],
        orderNumber: 1,
        timestamp: '2026-07-19T14:05:33.412Z',
    });
    assert.deepEqual(calculateTotals(rows, 0.0825), { subtotal: 16, tax: 1.32, total: 17.32 });
});

test('calculateTotals rounds tax to cents', () => {
    assert.deepEqual(calculateTotals([{ price: 8.05 }], 0.0825), {
        subtotal: 8.05,
        tax: 0.66,
        total: 8.71,
    });
});

test('calculateTotals returns zeros for an empty row list', () => {
    assert.deepEqual(calculateTotals([], 0.0825), { subtotal: 0, tax: 0, total: 0 });
});

test('calculateTotals nets out negative discount rows', () => {
    const totals = calculateTotals([{ price: 8 }, { price: -4 }], 0.0825);
    assert.equal(totals.subtotal, 4);
});

test('buildOrder maps rows onto the UI order shape', () => {
    const order = buildOrder(7, [
        {
            id: 'row-1',
            orderNumber: 7,
            name: 'Taro Milk Tea (Tapioca)',
            price: 8,
            type: 'Boba',
            timestamp: '2026-07-19T14:05:33.412',
            phone: '5550001111',
            paymentMethod: 'cash',
        },
    ]);

    assert.equal(order.orderNumber, 7);
    assert.equal(order.createdAt, '2026-07-19T14:05:33.412');
    assert.equal(order.phone, '5550001111');
    assert.equal(order.paymentMethod, 'cash');
    assert.equal(order.subtotal, 8);
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].displayName, 'Taro Milk Tea (Tapioca)');
    assert.equal(order.items[0].type, 'Boba');
    assert.equal(order.items[0].price, 8);
});

test('groupRowsToOrders groups flat rows by orderNumber, newest first', () => {
    const rows = [
        { id: 'a', orderNumber: 1, name: 'Corndog', price: 8, type: 'Corndog', timestamp: '2026-07-19T10:00:00' },
        { id: 'b', orderNumber: 2, name: 'Taro Milk Tea', price: 8, type: 'Boba', timestamp: '2026-07-19T11:00:00' },
        { id: 'c', orderNumber: 2, name: 'Corndog', price: 8, type: 'Corndog', timestamp: '2026-07-19T11:00:00' },
    ];

    const orders = groupRowsToOrders(rows);

    assert.deepEqual(orders.map((o) => o.orderNumber), [2, 1]);
    assert.equal(orders[0].items.length, 2);
    assert.equal(orders[1].items.length, 1);
});

test('groupRowsToOrders returns an empty array when there are no rows', () => {
    assert.deepEqual(groupRowsToOrders([]), []);
    assert.deepEqual(groupRowsToOrders(undefined), []);
});

test('calculateTotalRevenue sums order totals', () => {
    assert.equal(calculateTotalRevenue([{ total: 8.66 }, { total: 17.32 }]), '25.98');
});
