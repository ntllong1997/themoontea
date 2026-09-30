import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MENU_SECTIONS, catalogOptions } from './menu.js';
import {
    POPUPS,
    formatTime,
    googleCalendarUrl,
    parseDate,
    upcomingPopups,
} from './popups.js';

const publicDir = fileURLToPath(new URL('../../public', import.meta.url));

test('every menu item has a name, a description and a price', () => {
    for (const section of MENU_SECTIONS) {
        for (const item of section.items) {
            assert.ok(item.name, `${section.id}: an item has no name`);
            assert.ok(item.description, `${item.name} has no description`);
            assert.match(item.price ?? section.price ?? '', /^\$\d/, `${item.name} has no price`);
        }
    }
});

test('every menu photo exists in public/', () => {
    for (const item of MENU_SECTIONS.flatMap((section) => section.items)) {
        if (!item.image) continue;
        assert.ok(existsSync(publicDir + item.image), `${item.name}: missing ${item.image}`);
    }
});

test('section ids and item names are unique', () => {
    const ids = MENU_SECTIONS.map((section) => section.id);
    assert.equal(new Set(ids).size, ids.length);
    const names = MENU_SECTIONS.flatMap((section) => section.items.map((item) => item.name));
    assert.equal(new Set(names).size, names.length);
});

test('the corndog choices on the site are exactly what the till sells', () => {
    const [inside, outside] = MENU_SECTIONS.find((s) => s.id === 'corndogs').choices;
    assert.deepEqual(inside.options.map((o) => o.name), catalogOptions('Corndog', 'inside'));
    assert.deepEqual(outside.options.map((o) => o.name), catalogOptions('Corndog', 'outside'));
});

test('every scheduled pop-up is well formed', () => {
    for (const popup of POPUPS) {
        assert.match(popup.date, /^\d{4}-\d{2}-\d{2}$/, `bad date: ${popup.date}`);
        assert.ok(!Number.isNaN(parseDate(popup.date).getTime()), `bad date: ${popup.date}`);
        assert.match(popup.start, /^\d{2}:\d{2}$/, `${popup.date}: start must be HH:MM`);
        assert.match(popup.end, /^\d{2}:\d{2}$/, `${popup.date}: end must be HH:MM`);
        assert.ok(popup.end > popup.start, `${popup.date}: ends before it starts`);
        assert.ok(popup.name && popup.place, `${popup.date}: needs a name and a place`);
    }
});

test('upcomingPopups keeps today, drops yesterday, and sorts', () => {
    const popups = [
        { date: '2026-10-20', start: '10:00', end: '12:00' },
        { date: '2026-10-09', start: '10:00', end: '12:00' },
        { date: '2026-10-10', start: '15:00', end: '18:00' },
        { date: '2026-10-10', start: '09:00', end: '11:00' },
    ];
    const today = new Date(2026, 9, 10, 23, 30);
    assert.deepEqual(
        upcomingPopups(popups, today).map((p) => `${p.date} ${p.start}`),
        ['2026-10-10 09:00', '2026-10-10 15:00', '2026-10-20 10:00']
    );
});

test('parseDate reads a date as local midnight', () => {
    const date = parseDate('2026-01-05');
    assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2026, 0, 5]);
});

test('formatTime', () => {
    assert.equal(formatTime('00:00'), '12 AM');
    assert.equal(formatTime('11:00'), '11 AM');
    assert.equal(formatTime('12:00'), '12 PM');
    assert.equal(formatTime('16:30'), '4:30 PM');
});

test('googleCalendarUrl uses floating local times', () => {
    const url = new URL(googleCalendarUrl({
        date: '2026-10-18', start: '11:00', end: '16:30', name: 'Market', place: 'Park',
    }));
    assert.equal(url.searchParams.get('dates'), '20261018T110000/20261018T163000');
    assert.equal(url.searchParams.get('location'), 'Park');
});
