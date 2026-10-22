// Run with: npm test  (node --test, no extra dependencies)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseOnlineOrder } from './onlineOrder.js';

const line = (extra = {}) => ({ type: 'Corndog', name: 'Cheese Potato', modifiers: ['Hot Cheeto Dust'], price: 9, quantity: 2, ...extra });

test('a menu order comes back priced by the menu', () => {
    const { values } = parseOnlineOrder({ cartItems: [line()], phone: '(555) 123-4567' });
    assert.deepEqual(values, {
        cartItems: [{ type: 'Corndog', name: 'Cheese Potato', modifiers: ['Hot Cheeto Dust'], price: 9, quantity: 2 }],
        phone: '(555) 123-4567',
    });
});

test("the browser's price is ignored", () => {
    const { values } = parseOnlineOrder({ cartItems: [line({ price: 0.01 })], phone: '5551234567' });
    assert.equal(values.cartItems[0].price, 9);
});

test('off-menu items and impossible add-ons are refused', () => {
    assert.match(parseOnlineOrder({ cartItems: [line({ name: 'Gold Potato' })], phone: '5551234567' }).error, /isn't on the menu/);
    assert.match(parseOnlineOrder({ cartItems: [line({ type: 'Discount', name: 'Discount', modifiers: [] })], phone: '5551234567' }).error, /isn't on the menu/);
});

test('quantities must be whole, positive and modest', () => {
    for (const quantity of [0, -1, 1.5, '2', 21]) {
        assert.ok(parseOnlineOrder({ cartItems: [line({ quantity })], phone: '5551234567' }).error, String(quantity));
    }
    const big = Array.from({ length: 4 }, () => line({ quantity: 20 }));
    assert.match(parseOnlineOrder({ cartItems: big, phone: '5551234567' }).error, /too large/);
});

test('an empty order or a bad phone is refused', () => {
    assert.ok(parseOnlineOrder({ cartItems: [], phone: '5551234567' }).error);
    assert.ok(parseOnlineOrder(null).error);
    assert.ok(parseOnlineOrder({ cartItems: [line()], phone: '555-1234' }).error);
});
