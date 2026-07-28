import test from 'node:test';
import assert from 'node:assert/strict';

import {
    PAYMENT_BUCKETS,
    UNRECORDED,
    normalizePaymentMethod,
    summarizeByCategoryAndPayment,
} from './paymentMethods.js';

const withTax = (price) => price * 1.0825;

// ── Normalising ──────────────────────────────────────────────────────────────

test('the iPad spellings map to their buckets', () => {
    // These are the values actually in the table: Card 188 rows, Cash 124,
    // CashApp 50.
    assert.equal(normalizePaymentMethod('Cash'), 'Cash');
    assert.equal(normalizePaymentMethod('Card'), 'Card');
    assert.equal(normalizePaymentMethod('CashApp'), 'CashApp');
});

test('the web till lowercase spelling folds into the same bucket as the iPad', () => {
    // Regression: "Cash" and "cash" are both in the table and must not show up
    // as two separate lines in a report.
    assert.equal(normalizePaymentMethod('cash'), normalizePaymentMethod('Cash'));
    assert.equal(normalizePaymentMethod('  CASH  '), 'Cash');
});

test('a missing method is attributed to Other rather than dropped', () => {
    for (const raw of [null, undefined, '', '   ']) {
        assert.equal(normalizePaymentMethod(raw), UNRECORDED.key);
    }
});

test('an online order is not counted as Cash App', () => {
    // The online page takes no payment, so folding it into Cash App would
    // overstate Cash App revenue.
    assert.equal(normalizePaymentMethod('online'), UNRECORDED.key);
});

test('an unrecognised method falls to Other instead of throwing', () => {
    assert.equal(normalizePaymentMethod('Venmo'), UNRECORDED.key);
});

// ── Summarising ──────────────────────────────────────────────────────────────

test('revenue is split by category and payment bucket', () => {
    const rows = summarizeByCategoryAndPayment(
        [
            { type: 'Boba', price: 8, paymentMethod: 'Cash' },
            { type: 'Boba', price: 8, paymentMethod: 'Card' },
            { type: 'Corndog', price: 8, paymentMethod: 'CashApp' },
        ],
        (price) => price
    );

    assert.deepEqual(rows.get('Boba').byMethod, { Cash: 8, Card: 8, CashApp: 0, Other: 0 });
    assert.deepEqual(rows.get('Corndog').byMethod, { Cash: 0, Card: 0, CashApp: 8, Other: 0 });
});

test('each category row totals its own buckets', () => {
    const rows = summarizeByCategoryAndPayment(
        [
            { type: 'Side', price: 1, paymentMethod: 'Cash' },
            { type: 'Side', price: 2, paymentMethod: 'cash' },
            { type: 'Side', price: 2, paymentMethod: null },
        ],
        (price) => price
    );

    const side = rows.get('Side');
    assert.equal(side.byMethod.Cash, 3, 'Cash and cash must land in one bucket');
    assert.equal(side.byMethod.Other, 2);
    assert.equal(side.total, 5);

    const summed = PAYMENT_BUCKETS.reduce((sum, b) => sum + side.byMethod[b.key], 0);
    assert.equal(summed, side.total, 'buckets must reconcile with the row total');
});

test('every unit is attributed, so the grand total is not understated', () => {
    const items = [
        { type: 'Boba', price: 8, paymentMethod: 'Cash' },
        { type: 'Cookie', price: 5, paymentMethod: 'online' },
        { type: 'Egg Roll', price: 7, paymentMethod: null },
        { type: 'Discount', price: -4, paymentMethod: 'Card' },
    ];

    const rows = summarizeByCategoryAndPayment(items, withTax);
    const grand = [...rows.values()].reduce((sum, row) => sum + row.total, 0);
    const expected = items.reduce((sum, item) => sum + withTax(item.price), 0);

    assert.ok(Math.abs(grand - expected) < 1e-9);
});

test('a discount reduces its own row rather than being ignored', () => {
    const rows = summarizeByCategoryAndPayment(
        [{ type: 'Discount', price: -4, paymentMethod: 'Card' }],
        (price) => price
    );

    assert.equal(rows.get('Discount').byMethod.Card, -4);
});

test('taxed revenue is used, not the bare unit price', () => {
    const rows = summarizeByCategoryAndPayment(
        [{ type: 'Boba', price: 8, paymentMethod: 'Cash' }],
        withTax
    );

    assert.equal(rows.get('Boba').byMethod.Cash, 8 * 1.0825);
});
