import test from 'node:test';
import assert from 'node:assert/strict';

import { isWithinWindow, windowFor, formatRangeLabel } from './dateRange.js';

// A fixed "now" so the relative windows are testable: 2026-07-27 14:30 local.
const NOW = new Date(2026, 6, 27, 14, 30);
// Local-time helper — never `new Date('2026-07-27')`, which is parsed as UTC.
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

// ── Today ────────────────────────────────────────────────────────────────────

test('today spans the whole of the current day', () => {
    const window = windowFor('today', {}, NOW);

    assert.ok(isWithinWindow(at(2026, 7, 27, 0), window), 'midnight is in');
    assert.ok(isWithinWindow(at(2026, 7, 27, 23), window), 'late evening is in');
    assert.ok(!isWithinWindow(at(2026, 7, 26, 23), window), 'yesterday is out');
    assert.ok(!isWithinWindow(at(2026, 7, 28, 0), window), 'tomorrow is out');
});

// ── Week ─────────────────────────────────────────────────────────────────────

test('this week reaches back six full days', () => {
    const window = windowFor('week', {}, NOW);

    assert.ok(isWithinWindow(at(2026, 7, 21, 0), window), 'six days ago is in');
    assert.ok(!isWithinWindow(at(2026, 7, 20, 23), window), 'seven days ago is out');
});

// ── All ──────────────────────────────────────────────────────────────────────

test('all time is unbounded in both directions', () => {
    const window = windowFor('all', {}, NOW);

    assert.ok(isWithinWindow(at(2019, 1, 1), window));
    assert.ok(isWithinWindow(at(2099, 1, 1), window));
});

// ── Custom range ─────────────────────────────────────────────────────────────

test('a custom range covers the whole of its last day', () => {
    // Regression: an exclusive end would silently drop the busiest hours of
    // the final day of a festival weekend.
    const window = windowFor('custom', { start: '2026-07-10', end: '2026-07-12' }, NOW);

    assert.ok(isWithinWindow(at(2026, 7, 10, 0), window), 'start midnight is in');
    assert.ok(isWithinWindow(at(2026, 7, 12, 23), window), '11pm on the end day is in');
    assert.ok(!isWithinWindow(at(2026, 7, 13, 0), window), 'the day after is out');
    assert.ok(!isWithinWindow(at(2026, 7, 9, 23), window), 'the day before is out');
});

test('a single-day range keeps that day and nothing else', () => {
    const window = windowFor('custom', { start: '2026-07-04', end: '2026-07-04' }, NOW);

    assert.ok(isWithinWindow(at(2026, 7, 4, 9), window));
    assert.ok(!isWithinWindow(at(2026, 7, 3, 23), window));
    assert.ok(!isWithinWindow(at(2026, 7, 5, 0), window));
});

test('the picked dates are read in local time, not UTC', () => {
    // `new Date('2026-07-04')` is UTC midnight, which is 2026-07-03 in every
    // American time zone — that off-by-one would misattribute a whole day of
    // sales. An order at 8pm local on the 4th must count as the 4th.
    const window = windowFor('custom', { start: '2026-07-04', end: '2026-07-04' }, NOW);

    assert.ok(isWithinWindow(at(2026, 7, 4, 20), window));
    assert.ok(!isWithinWindow(at(2026, 7, 3, 20), window));
});

test('a backwards range is read as the range the user meant', () => {
    const backwards = windowFor('custom', { start: '2026-07-12', end: '2026-07-10' }, NOW);
    const forwards = windowFor('custom', { start: '2026-07-10', end: '2026-07-12' }, NOW);

    assert.deepEqual(backwards, forwards);
});

test('one open end leaves that side unbounded', () => {
    const fromOnly = windowFor('custom', { start: '2026-07-10', end: '' }, NOW);
    assert.ok(!isWithinWindow(at(2026, 7, 9), fromOnly));
    assert.ok(isWithinWindow(at(2030, 1, 1), fromOnly));

    const untilOnly = windowFor('custom', { start: '', end: '2026-07-10' }, NOW);
    assert.ok(isWithinWindow(at(2019, 1, 1), untilOnly));
    assert.ok(isWithinWindow(at(2026, 7, 10, 23), untilOnly));
    assert.ok(!isWithinWindow(at(2026, 7, 11), untilOnly));
});

test('an empty custom range shows everything rather than nothing', () => {
    // The state while the user is still picking — an empty table there reads
    // as "no sales", which is alarming and wrong.
    const window = windowFor('custom', { start: '', end: '' }, NOW);

    assert.ok(isWithinWindow(at(2019, 1, 1), window));
    assert.ok(isWithinWindow(at(2099, 1, 1), window));
});

test('a half-typed date is ignored instead of hiding every order', () => {
    for (const start of ['2026-07', '', 'not-a-date', null, undefined]) {
        const window = windowFor('custom', { start, end: '2026-07-12' }, NOW);
        assert.ok(isWithinWindow(at(2019, 1, 1), window), `start "${start}" must not bound`);
    }
});

// ── Timestamps ───────────────────────────────────────────────────────────────

test('an ISO timestamp string is accepted, not just a Date', () => {
    const window = windowFor('custom', { start: '2026-07-10', end: '2026-07-10' }, NOW);
    const noon = new Date(2026, 6, 10, 12).toISOString();

    assert.ok(isWithinWindow(noon, window));
});

test('an unreadable timestamp survives only under all time', () => {
    // Better to show suspicious data somewhere than to hide it silently —
    // this matches how the iPad treats the same rows.
    assert.ok(isWithinWindow('nonsense', windowFor('all', {}, NOW)));
    assert.ok(!isWithinWindow('nonsense', windowFor('today', {}, NOW)));
    assert.ok(!isWithinWindow(null, windowFor('today', {}, NOW)));
});

// ── Label ────────────────────────────────────────────────────────────────────

test('the label names the range the numbers actually cover', () => {
    assert.equal(
        formatRangeLabel(windowFor('custom', { start: '2026-07-10', end: '2026-07-12' }, NOW)),
        'Jul 10 – Jul 12, 2026'
    );
    assert.equal(
        formatRangeLabel(windowFor('custom', { start: '2026-07-04', end: '2026-07-04' }, NOW)),
        'Jul 4, 2026'
    );
    assert.equal(formatRangeLabel(windowFor('all', {}, NOW)), 'All time');
    assert.equal(
        formatRangeLabel(windowFor('custom', { start: '2026-07-10', end: '' }, NOW)),
        'From Jul 10, 2026'
    );
    assert.equal(
        formatRangeLabel(windowFor('custom', { start: '', end: '2026-07-10' }, NOW)),
        'Up to Jul 10, 2026'
    );
});
