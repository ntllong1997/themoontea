import test from 'node:test';
import assert from 'node:assert/strict';

import {
    MAX_PRINT_ATTEMPTS,
    PRINT_JOB_STATUS,
    STALE_CLAIM_MS,
    buildClaimPatch,
    buildFailurePatch,
    buildPrintJob,
    buildPrintedPatch,
    isStaleClaim,
} from './printQueue.js';

const AT = '2026-08-01T05:00:00.000Z';
const NOW = new Date('2026-08-01T05:00:30.000Z');

// ── buildPrintJob ────────────────────────────────────────────────────────────

test('a job carries the order number and the exact timestamp it was reserved against', () => {
    // Arrange / Act
    const job = buildPrintJob({ orderNumber: 42, timestamp: AT });

    // Assert — (order_number, order_timestamp) is the table's unique key, so
    // both must survive verbatim or the idempotency guarantee is lost.
    assert.deepEqual(job, { order_number: 42, order_timestamp: AT });
});

test('rejects an order number that could never identify an order', () => {
    for (const bad of [0, -1, 1.5, null, undefined, '7']) {
        assert.throws(
            () => buildPrintJob({ orderNumber: bad, timestamp: AT }),
            /order number/i,
            `expected ${String(bad)} to be rejected`,
        );
    }
});

test('rejects a missing timestamp rather than enqueueing an unroutable job', () => {
    // A job without the timestamp cannot be matched back to its line rows, and
    // would collide on the unique key with every other such job.
    for (const bad of ['', '   ', null, undefined]) {
        assert.throws(
            () => buildPrintJob({ orderNumber: 42, timestamp: bad }),
            /timestamp/i,
            `expected ${JSON.stringify(bad)} to be rejected`,
        );
    }
});

// ── Claiming ─────────────────────────────────────────────────────────────────

test('claiming records which device took the job', () => {
    const patch = buildClaimPatch({ deviceName: 'till-iphone', now: NOW });

    assert.equal(patch.status, PRINT_JOB_STATUS.CLAIMED);
    assert.equal(patch.claimed_by, 'till-iphone');
    assert.equal(patch.claimed_at, NOW.toISOString());
});

test('an unnamed device still claims, so a receipt is never stranded', () => {
    const patch = buildClaimPatch({ deviceName: '', now: NOW });

    assert.equal(patch.status, PRINT_JOB_STATUS.CLAIMED);
    assert.equal(patch.claimed_by, 'unknown');
});

// ── Completion ───────────────────────────────────────────────────────────────

test('marking printed stamps the time the printer actually confirmed', () => {
    const patch = buildPrintedPatch({ now: NOW });

    assert.equal(patch.status, PRINT_JOB_STATUS.PRINTED);
    assert.equal(patch.printed_at, NOW.toISOString());
    assert.equal(patch.last_error, null);
});

// ── Failure and retry ────────────────────────────────────────────────────────

test('an early failure returns the job to the queue for another device', () => {
    const patch = buildFailurePatch({ error: new Error('cover open'), attempts: 0 });

    assert.equal(patch.status, PRINT_JOB_STATUS.PENDING);
    assert.equal(patch.attempts, 1);
    assert.match(patch.last_error, /cover open/);
});

test('a job that has exhausted its attempts stops being retried forever', () => {
    // Otherwise one poisoned job blocks the queue head indefinitely.
    const patch = buildFailurePatch({
        error: new Error('bad payload'),
        attempts: MAX_PRINT_ATTEMPTS - 1,
    });

    assert.equal(patch.status, PRINT_JOB_STATUS.FAILED);
    assert.equal(patch.attempts, MAX_PRINT_ATTEMPTS);
});

test('a non-Error failure is still recorded rather than stringified to [object Object]', () => {
    const patch = buildFailurePatch({ error: { code: 7 }, attempts: 0 });

    assert.equal(typeof patch.last_error, 'string');
    assert.notEqual(patch.last_error, '[object Object]');
});

// ── Reaper ───────────────────────────────────────────────────────────────────

test('a claim held past the timeout is reclaimable — the device died mid-print', () => {
    const job = {
        status: PRINT_JOB_STATUS.CLAIMED,
        claimed_at: '2026-08-01T05:00:00.000Z',
    };
    const later = new Date(Date.parse(job.claimed_at) + STALE_CLAIM_MS + 1);

    assert.equal(isStaleClaim(job, { now: later }), true);
});

test('a claim still inside the timeout is left alone, so no receipt prints twice', () => {
    const job = {
        status: PRINT_JOB_STATUS.CLAIMED,
        claimed_at: '2026-08-01T05:00:00.000Z',
    };
    const soon = new Date(Date.parse(job.claimed_at) + STALE_CLAIM_MS - 1);

    assert.equal(isStaleClaim(job, { now: soon }), false);
});

test('only claimed jobs are reapable', () => {
    const old = '2026-07-01T00:00:00.000Z';

    for (const status of [
        PRINT_JOB_STATUS.PENDING,
        PRINT_JOB_STATUS.PRINTED,
        PRINT_JOB_STATUS.FAILED,
    ]) {
        assert.equal(
            isStaleClaim({ status, claimed_at: old }, { now: NOW }),
            false,
            `${status} must not be reaped`,
        );
    }
});

test('a claimed job with no claim time is reapable rather than stuck forever', () => {
    assert.equal(
        isStaleClaim({ status: PRINT_JOB_STATUS.CLAIMED, claimed_at: null }, { now: NOW }),
        true,
    );
});
