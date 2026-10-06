import test from 'node:test';
import assert from 'node:assert/strict';

import { CALENDAR_NAME, buildPopupCalendar } from './ical.js';

const CHI = 'America/Chicago';
const NOW = new Date('2026-10-06T12:00:00Z');
const popup = (overrides) => ({
    id: 'a1',
    date: '2026-10-11',
    start: '11:00',
    end: '16:00',
    name: 'Sunday Farmers Market',
    place: 'Riverside Park',
    address: '123 Main St, McAllen',
    note: 'Look for the moon flag!',
    ...overrides,
});
const unfold = (ics) => ics.replace(/\r\n /g, '');

test('a pop-up becomes one event at the right UTC time', () => {
    const ics = buildPopupCalendar([popup()], { timeZone: CHI, siteUrl: 'https://moontea.example', now: NOW });
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /END:VCALENDAR\r\n$/);
    assert.ok(ics.includes(`X-WR-CALNAME:${CALENDAR_NAME}\r\n`));
    // 11 AM in Chicago in October (CDT, UTC-5) is 16:00 UTC
    assert.ok(ics.includes('DTSTART:20261011T160000Z\r\n'));
    assert.ok(ics.includes('DTEND:20261011T210000Z\r\n'));
    assert.ok(ics.includes('UID:popup-a1@themoontea\r\n'), 'a stable id, so edits update the event instead of duplicating it');
    assert.ok(ics.includes('DTSTAMP:20261006T120000Z\r\n'));
    const text = unfold(ics);
    assert.ok(text.includes('SUMMARY:The Moon Tea: Sunday Farmers Market\r\n'));
    assert.ok(text.includes('LOCATION:Riverside Park\\, 123 Main St\\, McAllen\r\n'), 'commas escaped');
    assert.ok(text.includes('DESCRIPTION:Look for the moon flag!\\nMenu: https://moontea.example/menu\r\n'));
    assert.ok(text.includes('URL:https://moontea.example/menu\r\n'));
});

test('winter dates use standard time', () => {
    const ics = buildPopupCalendar([popup({ date: '2026-12-05', start: '17:30', end: '21:00' })], { timeZone: CHI, now: NOW });
    // 5:30 PM CST (UTC-6) is 23:30 UTC
    assert.ok(ics.includes('DTSTART:20261205T233000Z'));
    assert.ok(ics.includes('DTEND:20261206T030000Z'), 'an evening pop-up can end on the next UTC day');
});

test('optional fields are left out, and special characters are escaped', () => {
    const ics = buildPopupCalendar([popup({ address: null, note: null, name: 'Night Market; 2nd, \\ edition' })], { timeZone: CHI, now: NOW });
    assert.ok(ics.includes('LOCATION:Riverside Park\r\n'));
    assert.ok(!ics.includes('DESCRIPTION'), 'no note and no site link: no description');
    assert.ok(!ics.includes('URL:'));
    assert.ok(unfold(ics).includes('SUMMARY:The Moon Tea: Night Market\\; 2nd\\, \\\\ edition\r\n'));
});

test('long lines fold at 75 bytes without splitting a character', () => {
    const ics = buildPopupCalendar([popup({ note: 'Trà sữa 🧋 '.repeat(20) })], { timeZone: CHI, now: NOW });
    for (const line of ics.split('\r\n')) {
        assert.ok(new TextEncoder().encode(line).length <= 75, line);
    }
    assert.ok(unfold(ics).includes('Trà sữa 🧋 Trà sữa 🧋'), 'unfolds back to the original');
});

test('no pop-ups is still a valid, empty calendar', () => {
    const ics = buildPopupCalendar([], { timeZone: CHI, now: NOW });
    assert.ok(!ics.includes('BEGIN:VEVENT'));
    assert.match(ics, /BEGIN:VCALENDAR[\s\S]*END:VCALENDAR/);
});
