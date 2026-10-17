// Run with: npm test  (node --test, no extra dependencies)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FALLBACK_START, resolveTicketNumber, waitForNumber } from './ticketNumbering.js';

const never = () => { throw new Error('should not be called'); };

test('no main phone: the database counter numbers the order', async () => {
    const result = await resolveTicketNumber({
        hasMainPhone: false,
        nextFromCounter: async () => 12,
        askMainPhone: never,
        abandonRequest: never,
        nextFallback: never,
    });
    assert.deepEqual(result, { number: 12, source: 'counter' });
});

test('main phone answers: its number is used', async () => {
    const result = await resolveTicketNumber({
        hasMainPhone: true,
        nextFromCounter: never,
        askMainPhone: async () => 13,
        abandonRequest: never,
        nextFallback: never,
    });
    assert.deepEqual(result, { number: 13, source: 'mainPhone' });
});

test('main phone answers just as the website gives up: still its number', async () => {
    const result = await resolveTicketNumber({
        hasMainPhone: true,
        nextFromCounter: never,
        askMainPhone: async () => null,
        abandonRequest: async () => 14,
        nextFallback: never,
    });
    assert.deepEqual(result, { number: 14, source: 'mainPhone' });
});

test('main phone silent: the website numbers from its own 1000+ sequence', async () => {
    const result = await resolveTicketNumber({
        hasMainPhone: true,
        nextFromCounter: never,
        askMainPhone: async () => null,
        abandonRequest: async () => null,
        nextFallback: async () => FALLBACK_START,
    });
    assert.deepEqual(result, { number: 1000, source: 'fallback' });
});

test('waitForNumber returns the number as soon as it appears', async () => {
    let calls = 0;
    const number = await waitForNumber({
        fetchNumber: async () => (++calls === 3 ? 21 : null),
        timeoutMs: 1000,
        pollMs: 1,
    });
    assert.equal(number, 21);
    assert.equal(calls, 3);
});

test('waitForNumber gives up with null after the timeout', async () => {
    const number = await waitForNumber({ fetchNumber: async () => null, timeoutMs: 20, pollMs: 5 });
    assert.equal(number, null);
});

test('waitForNumber keeps waiting through a failed check', async () => {
    let calls = 0;
    const number = await waitForNumber({
        fetchNumber: async () => {
            calls += 1;
            if (calls === 1) throw new Error('network');
            return 7;
        },
        timeoutMs: 1000,
        pollMs: 1,
    });
    assert.equal(number, 7);
});
