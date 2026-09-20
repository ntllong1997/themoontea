// Run with: npm test (node --test, no extra dependencies)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    estimateQueueDelayMinutes,
    estimateReadyAt,
    estimateReadyMinutes,
    stationMinutesFor,
} from './estimate.js';

test('stationMinutesFor sums minutes per category, scaled by quantity', () => {
    const minutes = stationMinutesFor([
        { type: 'Boba', quantity: 2 }, // 4 * 2 = 8
        { type: 'Corndog', quantity: 1 }, // 6
    ]);
    assert.equal(minutes.get('Boba'), 8);
    assert.equal(minutes.get('Corndog'), 6);
});

test('stationMinutesFor falls back to DEFAULT_PREP_MINUTES for an unknown type', () => {
    const minutes = stationMinutesFor([{ type: 'Mystery Item', quantity: 1 }]);
    assert.equal(minutes.get('Mystery Item'), 4);
});

test('stationMinutesFor treats a missing quantity as one unit', () => {
    const minutes = stationMinutesFor([{ type: 'Boba' }]);
    assert.equal(minutes.get('Boba'), 4);
});

test('estimateQueueDelayMinutes is capped', () => {
    assert.equal(estimateQueueDelayMinutes(0), 0);
    assert.equal(estimateQueueDelayMinutes(2), 3);
    assert.equal(estimateQueueDelayMinutes(100), 15);
});

test('estimateReadyMinutes is driven by the busiest station, not the sum of every station', () => {
    // Boba: 4*1 = 4, Corndog: 6*1 = 6 -> busiest is 6, not 10.
    const minutes = estimateReadyMinutes(
        [{ type: 'Boba', quantity: 1 }, { type: 'Corndog', quantity: 1 }],
        0
    );
    assert.equal(minutes, 3 + 6);
});

test('estimateReadyMinutes adds queue delay on top of prep time', () => {
    const minutes = estimateReadyMinutes([{ type: 'Boba', quantity: 1 }], 4);
    assert.equal(minutes, 3 + 4 + 6);
});

test('estimateReadyMinutes is zero for an empty cart', () => {
    assert.equal(estimateReadyMinutes([], 5), 0);
});

test('estimateReadyAt resolves the minutes to a clock time', () => {
    const now = new Date('2026-09-20T12:00:00.000Z');
    const { minutes, readyAt } = estimateReadyAt([{ type: 'Boba', quantity: 1 }], 0, now);
    assert.equal(minutes, 7);
    assert.equal(readyAt.toISOString(), '2026-09-20T12:07:00.000Z');
});
