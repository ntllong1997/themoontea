import test from 'node:test';
import assert from 'node:assert/strict';

import { dayLabel, defaultRangeId, rangeLabel, scheduleText, textRanges } from './scheduleText.js';

const anna = { id: 'a', name: 'Anna' };
const weekly = (overrides) => ({
    id: 's1', employeeId: 'a', repeat: 'weekly', weekday: 1, startDate: '2026-01-05', endDate: null,
    date: null, start: '11:30', end: '17:00', note: null, skipDates: [], ...overrides,
});
const once = (overrides) => ({
    id: 's2', employeeId: 'a', repeat: 'once', weekday: null, startDate: null, endDate: null,
    date: '2026-11-15', start: '15:00', end: '22:00', note: 'closing', skipDates: [], ...overrides,
});

test('dayLabel and rangeLabel', () => {
    assert.equal(dayLabel('2026-11-10'), 'Tue, Nov 10');
    assert.equal(rangeLabel('2026-11-09', '2026-11-15'), 'Nov 9 – 15');
    assert.equal(rangeLabel('2026-10-26', '2026-11-01'), 'Oct 26 – Nov 1');
    assert.equal(rangeLabel('2026-11-09', '2026-11-09'), 'Nov 9');
});

test('textRanges: rest of this week, next week, both (weeks start Monday)', () => {
    // 2026-11-11 is a Wednesday
    assert.deepEqual(
        textRanges('2026-11-11').map((r) => [r.id, r.from, r.to]),
        [
            ['this', '2026-11-11', '2026-11-15'],
            ['next', '2026-11-16', '2026-11-22'],
            ['both', '2026-11-11', '2026-11-22'],
        ]
    );
    // A Sunday is the last day of its week
    assert.deepEqual(textRanges('2026-11-15')[0], { id: 'this', label: 'This week', period: 'this week', from: '2026-11-15', to: '2026-11-15' });
    assert.equal(defaultRangeId('2026-11-11'), 'this'); // Wed
    assert.equal(defaultRangeId('2026-11-13'), 'next'); // Fri
    assert.equal(defaultRangeId('2026-11-15'), 'next'); // Sun
});

test('scheduleText lists shifts, notes, days off and the total', () => {
    const text = scheduleText({
        employee: anna,
        shifts: [weekly(), once(), weekly({ id: 's3', employeeId: 'b' })],
        timeOff: [{ id: 'o1', employeeId: 'a', startDate: '2026-11-13', endDate: '2026-11-14', note: 'doctor' }],
        from: '2026-11-09',
        to: '2026-11-15',
        period: 'next week',
    });
    assert.equal(
        text,
        [
            'Hi Anna! Your Moon Tea shifts next week (Nov 9 – 15):',
            '',
            'Mon, Nov 9 · 11:30 AM – 5 PM',
            'Sun, Nov 15 · 3 PM – 10 PM (closing)',
            '',
            'Off: Fri, Nov 13 – Sat, Nov 14',
            '',
            '2 shifts · 12.5 hours',
        ].join('\n')
    );
    assert.ok(!text.includes('doctor'), 'day-off notes stay private');
});

test('a day off hides the shift it covers, and is clipped to the range', () => {
    const text = scheduleText({
        employee: anna,
        shifts: [weekly()],
        timeOff: [{ id: 'o1', employeeId: 'a', startDate: '2026-11-01', endDate: '2026-11-09', note: null }],
        from: '2026-11-09',
        to: '2026-11-15',
        period: 'this week',
    });
    assert.equal(text, ['Hi Anna! Your Moon Tea shifts this week (Nov 9 – 15):', '', 'No shifts.', '', 'Off: Mon, Nov 9'].join('\n'));
});

test('nothing scheduled', () => {
    assert.equal(
        scheduleText({ employee: anna, shifts: [], timeOff: [], from: '2026-11-09', to: '2026-11-15', period: 'this week' }),
        'Hi Anna! You have no Moon Tea shifts this week (Nov 9 – 15).'
    );
});

test('one shift of one hour reads in the singular', () => {
    const text = scheduleText({
        employee: anna,
        shifts: [once({ start: '10:00', end: '11:00', note: null })],
        from: '2026-11-09',
        to: '2026-11-15',
        period: 'this week',
    });
    assert.ok(text.endsWith('1 shift · 1 hour'), text);
});
