// Run with: npm test  (node --test, no extra dependencies)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayKey, parseStages, serializeStages, withStage } from './prepProgress.js';

test('dayKey is the local calendar day', () => {
    assert.equal(dayKey(new Date(2026, 9, 17, 23, 59)), '2026-10-17');
    assert.equal(dayKey(new Date(2026, 0, 5, 0, 1)), '2026-01-05');
});

test('saved stages come back on the same day', () => {
    const saved = serializeStages({ 'row-1': 'frying' }, '2026-10-17');
    assert.deepEqual(parseStages(saved, '2026-10-17'), { 'row-1': 'frying' });
});

test('a new day starts fresh', () => {
    const saved = serializeStages({ 'row-1': 'frying' }, '2026-10-16');
    assert.deepEqual(parseStages(saved, '2026-10-17'), {});
});

test('missing or broken storage starts fresh instead of throwing', () => {
    assert.deepEqual(parseStages(null, '2026-10-17'), {});
    assert.deepEqual(parseStages('not json', '2026-10-17'), {});
    assert.deepEqual(parseStages('{"day":"2026-10-17","byRow":[1,2]}', '2026-10-17'), {});
});

test('withStage returns a new object and leaves the old one alone', () => {
    const before = { 'row-1': 'frying' };
    const after = withStage(before, 'row-2', 'done');
    assert.deepEqual(after, { 'row-1': 'frying', 'row-2': 'done' });
    assert.deepEqual(before, { 'row-1': 'frying' });
});
