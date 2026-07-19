// Run with: npm test  (node --test, no extra dependencies)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    ORDER_SOURCE,
    PRINT_STATUS,
    calculateTotalRevenue,
    calculateTotals,
    defaultPrintStatus,
    expandUnits,
    formatItemName,
    mapOrderRow,
    orderCodePrefix,
    toOrderItems,
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
    assert.equal(formatItemName({ name: 'Corndog', modifiers: [] }), 'Corndog');
});

test('toOrderItems maps a cart line onto the items jsonb shape', () => {
    assert.deepEqual(toOrderItems([bobaLine]), [
        {
            name: 'Taro Milk Tea',
            modifiers: ['Tapioca'],
            unit_price: 8,
            quantity: 2,
            type: 'Boba',
        },
    ]);
});

test('calculateTotals multiplies unit price by quantity', () => {
    const totals = calculateTotals(toOrderItems([bobaLine]), 0.0825);
    assert.deepEqual(totals, { subtotal: 16, tax: 1.32, total: 17.32 });
});

test('calculateTotals rounds tax to cents so it matches numeric(10,2)', () => {
    // 8.05 * 0.0825 = 0.664125 — must not reach Postgres unrounded.
    const totals = calculateTotals([{ unit_price: 8.05, quantity: 1 }], 0.0825);
    assert.deepEqual(totals, { subtotal: 8.05, tax: 0.66, total: 8.71 });
});

test('calculateTotals returns zeros for an empty item list', () => {
    assert.deepEqual(calculateTotals([], 0.0825), { subtotal: 0, tax: 0, total: 0 });
});

test('expandUnits produces one entry per physical unit', () => {
    const units = expandUnits(toOrderItems([bobaLine]));

    assert.equal(units.length, 2);
    assert.deepEqual(
        units.map((u) => [u.lineIndex, u.unitIndex]),
        [[0, 0], [0, 1]]
    );
    assert.equal(units[0].displayName, 'Taro Milk Tea (Tapioca)');
    assert.equal(units[0].price, 8);
    assert.equal(units[0].type, 'Boba');
});

test('expandUnits treats a missing quantity as a single unit', () => {
    assert.equal(expandUnits([{ name: 'Corndog', unit_price: 8 }]).length, 1);
});

test('expandUnits returns an empty array when items is missing', () => {
    assert.deepEqual(expandUnits(undefined), []);
});

test('mapOrderRow converts a DB row into the UI order shape', () => {
    const order = mapOrderRow({
        id: '00000000-0000-0000-0000-000000000001',
        source: 'pos',
        order_number: 'P-1043',
        created_at: '2026-07-18T14:23:07.000Z',
        customer_name: null,
        customer_phone: '5550000000',
        items: toOrderItems([bobaLine]),
        subtotal: '16.00', // numeric arrives from PostgREST as a string
        tax: '1.32',
        total: '17.32',
        payment_method: 'cash',
        notes: null,
        print_status: 'printed',
    });

    assert.equal(order.orderNumber, 'P-1043');
    assert.equal(order.phone, '5550000000');
    assert.equal(order.customerName, '');
    assert.equal(order.total, 17.32); // coerced to a number, not "17.32"
    assert.equal(order.items.length, 2);
});

test('order code prefix and print status follow the source', () => {
    assert.equal(orderCodePrefix(ORDER_SOURCE.online), 'W');
    assert.equal(orderCodePrefix(ORDER_SOURCE.pos), 'P');

    // In-store orders print at the till, so they must never re-enter the
    // iPad's pending auto-print queue.
    assert.equal(defaultPrintStatus(ORDER_SOURCE.pos), PRINT_STATUS.printed);
    assert.equal(defaultPrintStatus(ORDER_SOURCE.online), PRINT_STATUS.pending);
});

test('calculateTotalRevenue sums order totals', () => {
    assert.equal(calculateTotalRevenue([{ total: 17.32 }, { total: 8.66 }]), '25.98');
});
