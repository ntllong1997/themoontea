import test from 'node:test';
import assert from 'node:assert/strict';

import {
    HISTORY_FILTERS,
    PAY_CHOICES,
    applyPaymentPatch,
    canChangePayment,
    isChargedOnReader,
    isInList,
    paymentPatch,
    paymentStateLabel,
} from './ticketPayments.js';

const NOW = new Date('2026-10-19T19:14:00.000Z');
const TILL = 'Website';

const ticket = (overrides = {}) => ({
    orderNumber: 12,
    orderUuid: '7d8a1c2e-0000-4000-8000-000000000001',
    status: 'pending',
    paymentMethod: '',
    paidAt: null,
    squarePaymentId: null,
    paymentLog: [],
    ...overrides,
});

// ── Labels ───────────────────────────────────────────────────────────────────

test('labels a ticket the way the app does', () => {
    assert.equal(paymentStateLabel(ticket()), 'Unpaid');
    assert.equal(paymentStateLabel(ticket({ status: 'cancelled' })), 'Cancelled');
    assert.equal(paymentStateLabel(ticket({ status: 'paid', paymentMethod: 'CashApp' })), 'Cash App');
    assert.equal(paymentStateLabel(ticket({ status: 'paid', paymentMethod: 'Card' })), 'Card');
});

test('a paid ticket with an unknown or missing method shows the raw value, then "Paid"', () => {
    assert.equal(paymentStateLabel(ticket({ status: 'paid', paymentMethod: 'online' })), 'online');
    assert.equal(paymentStateLabel(ticket({ status: 'paid', paymentMethod: '' })), 'Paid');
});

test('the website offers card (Square app), cash and Cash App, in the stored casing', () => {
    assert.deepEqual(PAY_CHOICES.map((c) => c.method), ['Card', 'Cash', 'CashApp']);
});

// ── Who can be changed ──────────────────────────────────────────────────────

test('only tickets with a hidden id can be changed', () => {
    assert.equal(canChangePayment(ticket()), true);
    assert.equal(canChangePayment(ticket({ orderUuid: null })), false);
});

test('a card charged on an iPhone reader is flagged', () => {
    assert.equal(isChargedOnReader(ticket({ status: 'paid', paymentMethod: 'Card', squarePaymentId: 'sq_1' })), true);
    assert.equal(isChargedOnReader(ticket({ status: 'paid', paymentMethod: 'Card' })), false);
    assert.equal(isChargedOnReader(ticket({ status: 'pending', squarePaymentId: 'sq_1' })), false);
});

// ── Patches ──────────────────────────────────────────────────────────────────

test('paying writes the method, paid time and a log line', () => {
    const patch = paymentPatch(ticket(), 'pay', { method: 'Cash', till: TILL, now: NOW });

    assert.deepEqual(patch, {
        status: 'paid',
        paymentMethod: 'Cash',
        paid_at: NOW.toISOString(),
        square_payment_id: null,
        payment_log: [{ at: NOW.toISOString(), till: TILL, from: 'Unpaid', to: 'Cash' }],
    });
});

test('paying clears an earlier reader charge id, like the app', () => {
    const patch = paymentPatch(ticket({ squarePaymentId: 'sq_old' }), 'pay', { method: 'Card', till: TILL, now: NOW });
    assert.equal(patch.square_payment_id, null);
});

test('cancelling keeps any charge id and logs Unpaid → Cancelled', () => {
    const patch = paymentPatch(ticket({ squarePaymentId: 'sq_1' }), 'cancel', { till: TILL, now: NOW });

    assert.equal(patch.status, 'cancelled');
    assert.equal(patch.paymentMethod, null);
    assert.equal(patch.paid_at, null);
    assert.equal(patch.square_payment_id, 'sq_1');
    assert.deepEqual(patch.payment_log.at(-1), { at: NOW.toISOString(), till: TILL, from: 'Unpaid', to: 'Cancelled' });
});

test('marking unpaid returns a paid ticket to pending and appends to its log', () => {
    const earlier = { at: '2026-10-19T18:00:00.000Z', till: 'Till B', from: 'Unpaid', to: 'Card' };
    const paid = ticket({ status: 'paid', paymentMethod: 'Card', paidAt: earlier.at, paymentLog: [earlier] });

    const patch = paymentPatch(paid, 'markUnpaid', { till: TILL, now: NOW });

    assert.equal(patch.status, 'pending');
    assert.equal(patch.paymentMethod, null);
    assert.equal(patch.paid_at, null);
    assert.deepEqual(patch.payment_log, [earlier, { at: NOW.toISOString(), till: TILL, from: 'Card', to: 'Unpaid' }]);
});

test('restoring a cancelled ticket makes it unpaid again', () => {
    const patch = paymentPatch(ticket({ status: 'cancelled' }), 'restore', { till: TILL, now: NOW });
    assert.equal(patch.status, 'pending');
    assert.equal(patch.payment_log.at(-1).from, 'Cancelled');
    assert.equal(patch.payment_log.at(-1).to, 'Unpaid');
});

test('changing the method keeps the original paid time', () => {
    const paid = ticket({ status: 'paid', paymentMethod: 'Cash', paidAt: '2026-10-19T18:00:00' });

    const patch = paymentPatch(paid, 'changeMethod', { method: 'CashApp', till: TILL, now: NOW });

    assert.equal(patch.status, 'paid');
    assert.equal(patch.paymentMethod, 'CashApp');
    assert.equal(patch.paid_at, '2026-10-19T18:00:00');
    assert.deepEqual(patch.payment_log.at(-1), { at: NOW.toISOString(), till: TILL, from: 'Cash', to: 'Cash App' });
});

test('an action that no longer fits the ticket returns null', () => {
    // Another phone already changed the ticket by the time this one acts.
    const paidCash = ticket({ status: 'paid', paymentMethod: 'Cash' });
    assert.equal(paymentPatch(paidCash, 'pay', { method: 'Cash', till: TILL, now: NOW }), null);
    assert.equal(paymentPatch(paidCash, 'cancel', { till: TILL, now: NOW }), null);
    assert.equal(paymentPatch(ticket(), 'markUnpaid', { till: TILL, now: NOW }), null);
    assert.equal(paymentPatch(ticket(), 'restore', { till: TILL, now: NOW }), null);
    assert.equal(paymentPatch(paidCash, 'changeMethod', { method: 'Cash', till: TILL, now: NOW }), null);
});

test('a ticket without a hidden id is never patched', () => {
    assert.equal(paymentPatch(ticket({ orderUuid: null }), 'pay', { method: 'Cash', till: TILL, now: NOW }), null);
});

test('bad input fails loudly', () => {
    assert.throws(() => paymentPatch(ticket(), 'refund', { till: TILL, now: NOW }), /Unknown payment action/);
    assert.throws(() => paymentPatch(ticket(), 'pay', { method: 'Bitcoin', till: TILL, now: NOW }), /Unknown payment method/);
    assert.throws(() => paymentPatch(ticket(), 'pay', { till: TILL, now: NOW }), /Unknown payment method/);
});

test('a log that arrives as something other than an array is treated as empty', () => {
    const patch = paymentPatch(ticket({ paymentLog: null }), 'cancel', { till: TILL, now: NOW });
    assert.equal(patch.payment_log.length, 1);
});

// ── Applying locally ─────────────────────────────────────────────────────────

test('applying a patch returns a new ticket in UI shape and leaves the old one alone', () => {
    const before = ticket();
    const patch = paymentPatch(before, 'pay', { method: 'CashApp', till: TILL, now: NOW });

    const after = applyPaymentPatch(before, patch);

    assert.notEqual(after, before);
    assert.equal(before.status, 'pending');
    assert.equal(after.status, 'paid');
    assert.equal(after.paymentMethod, 'CashApp');
    assert.equal(after.paidAt, NOW.toISOString());
    assert.equal(after.squarePaymentId, null);
    assert.equal(after.paymentLog.length, 1);
});

// ── Which list a ticket shows in ─────────────────────────────────────────────

test('Tickets shows only unpaid tickets', () => {
    assert.equal(isInList('pending', 'tickets'), true);
    assert.equal(isInList('paid', 'tickets'), false);
    assert.equal(isInList('cancelled', 'tickets'), false);
});

test('History never shows unpaid tickets and filters paid from cancelled', () => {
    assert.equal(isInList('pending', 'history', 'all'), false);
    assert.equal(isInList('paid', 'history', 'all'), true);
    assert.equal(isInList('cancelled', 'history', 'all'), true);
    assert.equal(isInList('cancelled', 'history', 'paid'), false);
    assert.equal(isInList('cancelled', 'history', 'cancelled'), true);
    assert.deepEqual(HISTORY_FILTERS.map((f) => f.key), ['all', 'paid', 'cancelled']);
});
