import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { FALLBACK_ITEMS, SECTIONS, STATUSES, buildSections, catalogOptions, formatPrice } from './menu.js';
import { isAllowedImageUrl, parseItemInput } from './menuAdmin.js';
import {
    formatTime,
    googleCalendarUrl,
    parseDate,
    parsePopupInput,
    popupFromRow,
    upcomingPopups,
} from './popups.js';

const publicDir = fileURLToPath(new URL('../../public', import.meta.url));
const SUPABASE = 'https://abc.supabase.co';

const row = (overrides) => ({
    category: 'boba', name: 'Tea', description: '', price: 8, price_note: null,
    image_url: null, status: 'available', tags: [], sort_order: 10, ...overrides,
});

test('every built-in photo exists in public/', () => {
    const optionImages = SECTIONS.flatMap((s) => (s.choices ?? []).flatMap((c) => c.options)).map((o) => o.image);
    for (const image of [...FALLBACK_ITEMS.map((i) => i.image_url), ...optionImages].filter(Boolean)) {
        assert.ok(existsSync(publicDir + image), `missing ${image}`);
    }
});

test('the built-in menu is well formed', () => {
    const statuses = new Set(STATUSES.map((s) => s.value));
    const names = FALLBACK_ITEMS.map((i) => i.name);
    assert.equal(new Set(names).size, names.length);
    for (const item of FALLBACK_ITEMS) {
        assert.ok(statuses.has(item.status), item.name);
        assert.deepEqual(parseItemInput(item, { supabaseUrl: SUPABASE }).error, undefined, item.name);
    }
});

test('the corndog choices on the site are exactly what the till sells', () => {
    const [inside, outside] = SECTIONS.find((s) => s.id === 'corndogs').choices;
    assert.deepEqual(inside.options.map((o) => o.name), catalogOptions('Corndog', 'inside'));
    assert.deepEqual(outside.options.map((o) => o.name), catalogOptions('Corndog', 'outside'));
});

test('formatPrice', () => {
    assert.equal(formatPrice(8, null), '$8');
    assert.equal(formatPrice('4.5', null), '$4.50');
    assert.equal(formatPrice(5, 'from'), 'from $5');
    assert.equal(formatPrice(null, null), null);
});

test('buildSections hides hidden items and orders sections like the page', () => {
    const sections = buildSections([
        row({ name: 'Secret', status: 'hidden' }),
        row({ name: 'B', sort_order: 20 }),
        row({ name: 'A', sort_order: 10, status: 'sold_out' }),
        row({ category: 'corndogs', name: 'Dog', sort_order: 99 }),
        row({ category: 'Smoothies', name: 'Mango', price: 6 }),
    ]);
    assert.deepEqual(sections.map((s) => s.id), ['corndogs', 'boba', 'smoothies']);
    const boba = sections[1];
    assert.deepEqual(boba.items.map((i) => i.name), ['A', 'B']);
    assert.equal(boba.items[0].soldOut, true);
    assert.equal(sections[2].title, 'Smoothies');
});

test('a shared plain price shows once on the section, mixed prices per item', () => {
    const [shared] = buildSections([row({ name: 'A' }), row({ name: 'B' })]);
    assert.equal(shared.price, '$8');
    assert.equal(shared.items[0].price, null);

    const [mixed] = buildSections([row({ name: 'A' }), row({ name: 'B', price: 9 })]);
    assert.equal(mixed.price, null);
    assert.deepEqual(mixed.items.map((i) => i.price), ['$8', '$9']);

    const [alone] = buildSections([row({ name: 'A' })]);
    assert.equal(alone.price, null);
    assert.equal(alone.items[0].price, '$8');

    const [corndog] = buildSections([row({ category: 'corndogs', name: 'Dog' })]);
    assert.equal(corndog.price, '$8');

    const [from] = buildSections([row({ name: 'A', price_note: 'from' })]);
    assert.equal(from.price, null);
    assert.equal(from.items[0].price, 'from $8');
});

test('a section with only hidden items disappears', () => {
    assert.deepEqual(buildSections([row({ status: 'hidden' })]), []);
});

test('parseItemInput cleans a new item', () => {
    const { values } = parseItemInput(
        { name: '  Taro  ', category: 'boba', price: '4.555', tags: ['New', 'New', ' ', 'Hot'], status: 'sold_out' },
        { supabaseUrl: SUPABASE }
    );
    assert.deepEqual(values, {
        name: 'Taro', category: 'boba', description: '', price: 4.56, price_note: null,
        image_url: null, status: 'sold_out', tags: ['New', 'Hot'],
    });
});

test('parseItemInput rejects bad input', () => {
    const bad = (body, options) => parseItemInput(body, { supabaseUrl: SUPABASE, ...options }).error;
    assert.ok(bad({ category: 'boba' }));
    assert.ok(bad({ name: 'A', category: '' }));
    assert.ok(bad({ name: 'A', category: 'boba', price: 'eight' }));
    assert.ok(bad({ name: 'A', category: 'boba', price: -1 }));
    assert.ok(bad({ name: 'A', category: 'boba', status: 'gone' }));
    assert.ok(bad({ name: 'A', category: 'boba', image_url: 'https://evil.example/x.jpg' }));
    assert.ok(bad({}, { partial: true }));
});

test('parseItemInput partial updates only touch what was sent', () => {
    assert.deepEqual(parseItemInput({ status: 'sold_out' }, { partial: true }).values, { status: 'sold_out' });
    assert.deepEqual(parseItemInput({ sort_order: 30 }, { partial: true }).values, { sort_order: 30 });
});

test('photos may only come from /menu/ or our own bucket', () => {
    assert.ok(isAllowedImageUrl('/menu/golden-taro.webp', SUPABASE));
    assert.ok(isAllowedImageUrl(`${SUPABASE}/storage/v1/object/public/menu-photos/items/a.webp`, SUPABASE));
    assert.ok(!isAllowedImageUrl(`${SUPABASE}/storage/v1/object/public/receipt-photo/a.webp`, SUPABASE));
    assert.ok(!isAllowedImageUrl('https://other.supabase.co/storage/v1/object/public/menu-photos/a', SUPABASE));
});

test('parsePopupInput accepts a pop-up and tidies it', () => {
    const { values } = parsePopupInput({
        date: '2026-10-18', start: '11:00', end: '16:30', name: ' Night Market ', place: 'Park', address: '', note: ' Moon flag! ',
    });
    assert.deepEqual(values, {
        date: '2026-10-18', start_time: '11:00', end_time: '16:30', name: 'Night Market', place: 'Park', address: null, note: 'Moon flag!',
        latitude: null, longitude: null,
    });
});

test('parsePopupInput takes a location pin, both coordinates or neither', () => {
    const ok = { date: '2026-10-18', start: '11:00', end: '16:00', name: 'A', place: 'B' };
    assert.deepEqual(
        [parsePopupInput({ ...ok, latitude: '26.2', longitude: -98.23 }).values.latitude, parsePopupInput({ ...ok, latitude: '26.2', longitude: -98.23 }).values.longitude],
        [26.2, -98.23]
    );
    assert.ok(parsePopupInput({ ...ok, latitude: 26.2 }).error);
    assert.ok(parsePopupInput({ ...ok, latitude: 'x', longitude: 1 }).error);
    assert.ok(parsePopupInput({ ...ok, latitude: 95, longitude: 1 }).error);
});

test('parsePopupInput rejects what the database would', () => {
    const ok = { date: '2026-10-18', start: '11:00', end: '16:00', name: 'A', place: 'B' };
    assert.ok(parsePopupInput({ ...ok, date: '' }).error);
    assert.ok(parsePopupInput({ ...ok, date: '2026-02-30' }).error);
    assert.ok(parsePopupInput({ ...ok, start: '25:00' }).error);
    assert.ok(parsePopupInput({ ...ok, end: '10:00' }).error);
    assert.ok(parsePopupInput({ ...ok, end: '11:00', start: '11:00' }).error);
    assert.ok(parsePopupInput({ ...ok, name: ' ' }).error);
    assert.ok(parsePopupInput({ ...ok, place: '' }).error);
    assert.equal(parsePopupInput(ok).error, undefined);
});

test('popupFromRow maps database columns to the calendar shape', () => {
    assert.deepEqual(
        popupFromRow({ id: 'x', date: '2026-10-18', start_time: '11:00', end_time: '12:00', name: 'A', place: 'B', address: '', note: null }),
        { id: 'x', date: '2026-10-18', start: '11:00', end: '12:00', name: 'A', place: 'B', address: null, note: null, latitude: null, longitude: null }
    );
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
