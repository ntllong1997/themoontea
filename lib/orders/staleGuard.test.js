import test from 'node:test';
import assert from 'node:assert/strict';

import { createStaleGuard } from './staleGuard.js';

test('a read with no write since it started is current', () => {
    const guard = createStaleGuard();
    const read = guard.start();
    assert.equal(guard.isCurrent(read), true);
});

test('a read that started before a write finished is stale', () => {
    // The poll leaves, the payment saves, then the poll's answer arrives.
    const guard = createStaleGuard();
    const read = guard.start();
    guard.invalidate();
    assert.equal(guard.isCurrent(read), false);
});

test('a read that starts after the write is current again', () => {
    const guard = createStaleGuard();
    guard.invalidate();
    const read = guard.start();
    assert.equal(guard.isCurrent(read), true);
});

test('each guard keeps its own count', () => {
    const a = createStaleGuard();
    const b = createStaleGuard();
    const read = b.start();
    a.invalidate();
    assert.equal(b.isCurrent(read), true);
});
