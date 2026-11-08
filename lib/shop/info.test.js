import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { zonedTimeToUtc } from '../online/shopTime.js';
import { WEEKDAYS, fullAddress, hoursRows, mapsUrl, openEveryDay, openStatus, structuredData, telHref } from './info.js';

const info = JSON.parse(readFileSync(new URL('./info.json', import.meta.url), 'utf8'));

// A wall-clock moment at the shop. 2026-11-08 is a Sunday.
const at = (date, time) => {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    return zonedTimeToUtc({ year, month, day, hour, minute }, info.timeZone);
};

test('info.json lists each day at most once, with valid times', () => {
    const days = info.hours.flatMap((row) => row.days);
    assert.equal(new Set(days).size, days.length, 'no day in two rows');
    for (const day of days) assert.ok(WEEKDAYS.includes(day), day);
    for (const row of info.hours) {
        assert.match(row.open, /^([01]\d|2[0-3]):[0-5]\d$/);
        assert.match(row.close, /^([01]\d|2[0-3]):[0-5]\d$/);
        assert.ok(row.close > row.open, 'closes after it opens');
    }
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: info.timeZone }));
});

test('the hours read the way the shop wrote them', () => {
    assert.deepEqual(hoursRows(info), [
        { days: 'Sunday – Thursday', time: '11:30 AM – 9 PM' },
        { days: 'Friday – Saturday', time: '11:30 AM – 10 PM' },
    ]);
});

test('openEveryDay', () => {
    assert.equal(openEveryDay(info), true);
    assert.equal(openEveryDay({ ...info, hours: [{ days: ['Mon'], open: '09:00', close: '17:00' }] }), false);
});

test('openStatus follows the shop clock', () => {
    assert.deepEqual(openStatus(info, at('2026-11-08', '12:00')), { open: true, label: 'Open now · until 9 PM' }); // Sun
    assert.deepEqual(openStatus(info, at('2026-11-13', '21:30')), { open: true, label: 'Open now · until 10 PM' }); // Fri
    assert.deepEqual(openStatus(info, at('2026-11-14', '10:00')), { open: false, label: 'Opens today at 11:30 AM' }); // Sat
    assert.deepEqual(openStatus(info, at('2026-11-12', '21:30')), { open: false, label: 'Opens tomorrow at 11:30 AM' }); // Thu
    // Closing time itself is closed; opening time itself is open.
    assert.equal(openStatus(info, at('2026-11-09', '21:00')).open, false);
    assert.equal(openStatus(info, at('2026-11-09', '11:30')).open, true);
    // Just after midnight is still "today" on the shop clock.
    assert.equal(openStatus(info, at('2026-11-14', '00:30')).label, 'Opens today at 11:30 AM');
});

test('openStatus names the next open day when tomorrow is closed', () => {
    const weekdaysOnly = { ...info, hours: [{ days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], open: '09:00', close: '17:00' }] };
    assert.equal(openStatus(weekdaysOnly, at('2026-11-13', '18:00')).label, 'Opens Monday at 9 AM'); // Fri evening
    assert.equal(openStatus({ ...info, hours: [] }, at('2026-11-13', '18:00')).label, 'Closed');
});

test('address, phone and map links', () => {
    assert.equal(fullAddress(info), '4423 N Conway Ave #210, Palmhurst, TX 78573');
    assert.equal(telHref(info.phone), 'tel:+19565985088');
    assert.equal(telHref('1-956-598-5088'), 'tel:+19565985088');
    assert.ok(mapsUrl(info).startsWith('https://www.google.com/maps/search/?api=1&query='));
    assert.ok(decodeURIComponent(mapsUrl(info)).includes('4423 N Conway Ave #210'));
});

test('structured data carries the address and hours', () => {
    const data = structuredData(info);
    assert.equal(data.address.postalCode, '78573');
    assert.deepEqual(data.openingHoursSpecification[1], {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['https://schema.org/Friday', 'https://schema.org/Saturday'],
        opens: '11:30',
        closes: '22:00',
    });
});
