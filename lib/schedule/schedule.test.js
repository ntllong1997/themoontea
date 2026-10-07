import test from 'node:test';
import assert from 'node:assert/strict';

import {
    addDays,
    datesBetween,
    expandShifts,
    isDateKey,
    parseEmployeeName,
    parseShiftInput,
    parseTimeOffInput,
    shiftEvents,
    shiftFromRow,
    weekStart,
    weekdayOf,
} from './schedule.js';
import { buildCalendar, localInstant } from '../site/ical.js';

const CHI = 'America/Chicago';
// 2026-10-05 is a Monday.
const weekly = (overrides) => ({
    id: 'w1',
    employeeId: 'linh',
    repeat: 'weekly',
    weekday: 6, // Saturday
    startDate: '2026-10-01',
    endDate: null,
    date: null,
    start: '10:00',
    end: '16:00',
    note: null,
    skipDates: [],
    ...overrides,
});
const once = (overrides) => ({ id: 'o1', employeeId: 'linh', repeat: 'once', date: '2026-10-08', start: '17:00', end: '21:00', note: 'Night market', skipDates: [], ...overrides });

test('date helpers work on plain dates, across months and DST', () => {
    assert.equal(weekdayOf('2026-10-05'), 1);
    assert.equal(weekStart('2026-10-11'), '2026-10-05', 'Sunday belongs to the week that started Monday');
    assert.equal(weekStart('2026-10-05'), '2026-10-05');
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-11-01', 1), '2026-11-02', 'the DST change does not skip or repeat a day');
    assert.deepEqual(datesBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    assert.equal(isDateKey('2026-02-30'), false);
});

test('a weekly shift repeats on its weekday from its start date', () => {
    const days = expandShifts({ shifts: [weekly()], from: '2026-09-01', to: '2026-10-31' }).map((s) => s.date);
    assert.deepEqual(days, ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31']);
});

test('a weekly shift stops after its end date and skips single days', () => {
    const shifts = [weekly({ endDate: '2026-10-24', skipDates: ['2026-10-10'] })];
    const days = expandShifts({ shifts, from: '2026-10-01', to: '2026-12-31' }).map((s) => s.date);
    assert.deepEqual(days, ['2026-10-03', '2026-10-17', '2026-10-24']);
});

test('a one-off shift appears only on its day', () => {
    assert.equal(expandShifts({ shifts: [once()], from: '2026-10-01', to: '2026-10-07' }).length, 0);
    const [shift] = expandShifts({ shifts: [once()], from: '2026-10-08', to: '2026-10-08' });
    assert.equal(shift.key, 'o1-2026-10-08');
    assert.equal(shift.note, 'Night market');
});

test('a day off hides every shift that person has on those days, and nobody else’s', () => {
    const shifts = [weekly(), once({ date: '2026-10-10' }), weekly({ id: 'w2', employeeId: 'minh' })];
    const timeOff = [{ employeeId: 'linh', startDate: '2026-10-09', endDate: '2026-10-11' }];
    const found = expandShifts({ shifts, timeOff, from: '2026-10-05', to: '2026-10-18' });
    assert.deepEqual(
        found.map((s) => `${s.employeeId} ${s.date}`),
        ['minh 2026-10-10', 'linh 2026-10-17', 'minh 2026-10-17']
    );
});

test('workdays come out in date and time order', () => {
    const shifts = [weekly({ id: 'late', start: '15:00', end: '20:00' }), weekly({ id: 'early', employeeId: 'minh', start: '09:00', end: '12:00' })];
    const found = expandShifts({ shifts, from: '2026-10-10', to: '2026-10-10' });
    assert.deepEqual(found.map((s) => s.shiftId), ['early', 'late']);
});

test('the add-shift form is checked', () => {
    const base = { employeeId: 'linh', date: '2026-10-10', start: '10:00', end: '16:00' };
    assert.deepEqual(parseShiftInput({ ...base, weekly: true }).values, {
        employee_id: 'linh', start_time: '10:00', end_time: '16:00', note: null,
        repeat: 'weekly', weekday: 6, start_date: '2026-10-10', end_date: null, date: null,
    });
    assert.equal(parseShiftInput({ ...base, note: '  Drink   station ' }).values.repeat, 'once');
    assert.equal(parseShiftInput({ ...base, note: '  Drink   station ' }).values.note, 'Drink station');
    assert.match(parseShiftInput({ ...base, employeeId: '' }).error, /who/);
    assert.match(parseShiftInput({ ...base, date: '2026-13-01' }).error, /date/);
    assert.match(parseShiftInput({ ...base, end: '09:00' }).error, /after/);
    assert.match(parseShiftInput(null).error, /Nothing/);
});

test('the day-off form is checked', () => {
    assert.deepEqual(parseTimeOffInput({ employeeId: 'linh', startDate: '2026-10-10' }).values, {
        employee_id: 'linh', start_date: '2026-10-10', end_date: '2026-10-10', note: null,
    });
    assert.match(parseTimeOffInput({ employeeId: 'linh', startDate: '2026-10-10', endDate: '2026-10-09' }).error, /on or after/);
    assert.match(parseTimeOffInput({ employeeId: 'linh', startDate: '2026-01-01', endDate: '2027-06-01' }).error, /year/);
    assert.match(parseEmployeeName('   ').error, /name/);
    assert.equal(parseEmployeeName('  Linh  Nguyen ').name, 'Linh Nguyen');
});

test('database rows map to shifts, with times trimmed to HH:MM', () => {
    const shift = shiftFromRow({ id: 'x', employee_id: 'e', repeat: 'weekly', weekday: 1, start_date: '2026-10-05', end_date: null, date: null, start_time: '10:00:00', end_time: '16:30:00', note: '', skip_dates: null });
    assert.equal(shift.start, '10:00');
    assert.equal(shift.end, '16:30');
    assert.equal(shift.note, null);
    assert.deepEqual(shift.skipDates, []);
});

test('the employee feed puts every shift at the store, with stable ids', () => {
    const found = expandShifts({ shifts: [weekly(), once()], from: '2026-10-08', to: '2026-10-10' });
    const events = shiftEvents(found, { location: '123 Main St, McAllen, TX' }, (date, time) => localInstant(date, time, CHI));
    assert.deepEqual(events.map((e) => e.summary), ['Work: The Moon Tea', 'Work: The Moon Tea']);
    assert.equal(events[0].description, 'Night market');
    assert.equal(events[1].location, '123 Main St, McAllen, TX');
    assert.equal(events[1].uid, 'shift-w1-2026-10-10@themoontea');
    const ics = buildCalendar({ name: 'Linh – The Moon Tea shifts', timeZone: CHI, events, now: new Date('2026-10-07T00:00:00Z') });
    assert.ok(ics.includes('DTSTART:20261010T150000Z'), '10 AM CDT');
    assert.ok(ics.includes('X-WR-CALNAME:Linh – The Moon Tea shifts'));
    const noAddress = shiftEvents(found, {}, (date, time) => localInstant(date, time, CHI));
    assert.ok(!buildCalendar({ name: 'x', timeZone: CHI, events: noAddress }).includes('LOCATION'), 'no address set: no location line');
});
