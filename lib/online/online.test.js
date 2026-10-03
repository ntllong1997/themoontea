import test from 'node:test';
import assert from 'node:assert/strict';

import { checkNearby, distanceMeters, parseCoordinates, ORDER_RADIUS_METERS } from './geo.js';
import { formatPhone, normalizePhone, punchCard } from './loyalty.js';
import { REWARD_LABEL, buildOnlineMenu, priceOnlineOrder } from './onlineMenu.js';
import { REWARDS_DAYS, createPhoneToken, verifyPhoneToken } from './phoneToken.js';
import { onlineOrderingWindow } from './popupWindow.js';
import { shopDateKey, shopDayBounds, shopTimeOfDay, shopTimeZone, zonedTimeToUtc } from './shopTime.js';

const CHI = 'America/Chicago';

// ── shop time ───────────────────────────────────────────────────────────────
test('shop clock reads Chicago wall time, across DST', () => {
    const summer = new Date('2026-07-04T17:30:00Z'); // CDT, UTC-5
    assert.equal(shopDateKey(summer, CHI), '2026-07-04');
    assert.equal(shopTimeOfDay(summer, CHI), '12:30');
    const winter = new Date('2026-12-01T03:30:00Z'); // CST, UTC-6, still Nov 30 locally
    assert.equal(shopDateKey(winter, CHI), '2026-11-30');
    assert.equal(shopTimeOfDay(winter, CHI), '21:30');
});

test('local wall time -> UTC handles both offsets', () => {
    assert.equal(zonedTimeToUtc({ year: 2026, month: 7, day: 4, hour: 11 }, CHI).toISOString(), '2026-07-04T16:00:00.000Z');
    assert.equal(zonedTimeToUtc({ year: 2026, month: 12, day: 4, hour: 11 }, CHI).toISOString(), '2026-12-04T17:00:00.000Z');
});

test('shop day bounds are local midnight to local midnight, incl. a DST change day', () => {
    assert.deepEqual(shopDayBounds(new Date('2026-07-04T17:30:00Z'), CHI), {
        start: '2026-07-04T05:00:00.000Z', end: '2026-07-05T05:00:00.000Z',
    });
    // Nov 1 2026: clocks fall back, the day is 25 hours long.
    assert.deepEqual(shopDayBounds(new Date('2026-11-01T18:00:00Z'), CHI), {
        start: '2026-11-01T05:00:00.000Z', end: '2026-11-02T06:00:00.000Z',
    });
});

test('SHOP_TIME_ZONE overrides the default, and a bad one is ignored', () => {
    assert.equal(shopTimeZone({}), CHI);
    assert.equal(shopTimeZone({ SHOP_TIME_ZONE: 'America/Denver' }), 'America/Denver');
    assert.equal(shopTimeZone({ SHOP_TIME_ZONE: 'Mars/Olympus' }), CHI);
});

// ── distance ────────────────────────────────────────────────────────────────
const stall = { latitude: 26.2034, longitude: -98.23 };

test('distance between two nearby points', () => {
    const d = distanceMeters(stall, { latitude: 26.2124, longitude: -98.23 }); // ~0.009° north
    assert.ok(Math.abs(d - 1001) < 5, String(d));
});

test('within a mile is nearby; two miles is not; a fuzzy fix gets a capped allowance', () => {
    assert.equal(checkNearby({ ...stall, accuracy: 10 }, stall).nearby, true);
    const twoMiles = { latitude: stall.latitude + 0.029, longitude: stall.longitude, accuracy: 20 };
    assert.equal(checkNearby(twoMiles, stall).nearby, false);
    const justOutside = { latitude: stall.latitude + (ORDER_RADIUS_METERS + 300) / 111195, longitude: stall.longitude };
    assert.equal(checkNearby({ ...justOutside, accuracy: 0 }, stall).nearby, false);
    assert.equal(checkNearby({ ...justOutside, accuracy: 350 }, stall).nearby, true);
    assert.equal(checkNearby({ ...justOutside, accuracy: 5000 }, stall).nearby, true, 'capped at 400m, 300m still covered');
    const farOutside = { latitude: stall.latitude + (ORDER_RADIUS_METERS + 600) / 111195, longitude: stall.longitude, accuracy: 5000 };
    assert.equal(checkNearby(farOutside, stall).nearby, false, 'a huge accuracy radius is not a free pass');
});

test('parseCoordinates rejects junk', () => {
    assert.equal(parseCoordinates(null), null);
    assert.equal(parseCoordinates({ latitude: 'x', longitude: 1 }), null);
    assert.equal(parseCoordinates({ latitude: 91, longitude: 1 }), null);
    assert.deepEqual(parseCoordinates({ latitude: '26.2', longitude: -98.2 }), { latitude: 26.2, longitude: -98.2, accuracy: 0 });
});

// ── loyalty ────────────────────────────────────────────────────────────────
test('phone numbers normalise to 10 digits', () => {
    for (const raw of ['(956) 624-5751', '956.624.5751', '+1 956 624 5751', '9566245751', 9566245751]) {
        assert.equal(normalizePhone(raw), '9566245751', String(raw));
    }
    for (const raw of ['', '12345', '0566245751', null, undefined, '95662457511']) {
        assert.equal(normalizePhone(raw), null, String(raw));
    }
    assert.equal(formatPhone('9566245751'), '(956) 624-5751');
});

test('punch card: 9 paid drinks earn one free drink', () => {
    assert.deepEqual(punchCard(0, 0), { stamps: 0, perReward: 9, rewardsAvailable: 0, totalDrinks: 0, rewardsUsed: 0 });
    assert.equal(punchCard(8, 0).stamps, 8);
    assert.deepEqual([punchCard(9, 0).stamps, punchCard(9, 0).rewardsAvailable], [0, 1]);
    assert.deepEqual([punchCard(20, 1).stamps, punchCard(20, 1).rewardsAvailable], [2, 1]);
    assert.equal(punchCard(9, 1).rewardsAvailable, 0);
    assert.equal(punchCard(9, 5).rewardsAvailable, 0, 'never negative');
});

// ── online menu & pricing ──────────────────────────────────────────────────
const site = [
    { name: 'Korean Corndog', status: 'available', image_url: '/menu/korean-corndog.webp', description: 'Crispy' },
    { name: 'Brown Sugar Boba Tea', status: 'available', image_url: '/menu/brown-sugar-boba.webp' },
    { name: 'Golden Taro', status: 'sold_out' },
    { name: 'Vietnamese Coffee', status: 'available' },
];
const corndog = (over = {}) => ({ category: 'Corndog', selection: { inside: 'Cheese', outside: 'Potato', addOns: {} }, quantity: 1, ...over });
const drink = (d = 'Brown Sugar', quantity = 1) => ({ category: 'Boba', selection: { drink: d, boba: 'Tapioca', addOns: {} }, quantity });

test('the online menu reflects Menu Items availability', () => {
    const [dogs, boba] = buildOnlineMenu(site);
    assert.equal(dogs.available, true);
    assert.equal(dogs.image, '/menu/korean-corndog.webp');
    const byOption = Object.fromEntries(boba.drinks.map((d) => [d.option, d]));
    assert.equal(byOption['Brown Sugar'].available, true);
    assert.equal(byOption['Golden Taro'].available, false, 'sold out');
    assert.equal(byOption['Tropical'].available, false, 'missing from the site = not orderable');
    assert.equal(byOption['Golden Taro'].customization, 'Only Taro');
    assert.ok(boba.toppings.includes('Tapioca'));
});

test('prices come from the catalog, with tax, in cents', () => {
    const order = priceOnlineOrder([corndog({ quantity: 2 }), drink()], site);
    assert.equal(order.error, undefined);
    assert.equal(order.subtotal, 24);
    assert.equal(order.tax, 1.98);
    assert.equal(order.total, 25.98);
    assert.equal(order.amountCents, 2598);
    assert.deepEqual(order.receipt.map((r) => [r.name, r.qty, r.price]), [
        ['Cheese Potato', 2, 8],
        ['Brown Sugar (Tapioca)', 1, 8],
    ]);
});

test('add-ons only charge when they apply', () => {
    const dusted = priceOnlineOrder([corndog({ selection: { inside: 'Cheese', outside: 'Potato', addOns: { dust: true } } })], site);
    assert.equal(dusted.subtotal, 9);
    const notPotato = priceOnlineOrder([corndog({ selection: { inside: 'Cheese', outside: 'Original', addOns: { dust: true } } })], site);
    assert.equal(notPotato.subtotal, 8);
});

test('a sent price is ignored; invented options and sold-out items are refused', () => {
    assert.equal(priceOnlineOrder([{ ...drink(), price: 0.01 }], site).subtotal, 8);
    assert.match(priceOnlineOrder([corndog({ selection: { inside: 'Gold', outside: 'Potato' } })], site).error, /options/);
    assert.match(priceOnlineOrder([drink('Golden Taro')], site).error, /sold out/);
    assert.match(priceOnlineOrder([{ category: 'Cookie', selection: {}, quantity: 1 }], site).error, /not sold online/);
    assert.match(priceOnlineOrder([corndog({ quantity: 0 })], site).error, /1 to 10/);
    assert.match(priceOnlineOrder([corndog({ quantity: 10 }), drink('Brown Sugar', 10), drink('Cafe', 1)], site).error, /limited/);
    assert.match(priceOnlineOrder([], site).error, /empty/);
});

test('the free drink makes the cheapest drink $0 and needs a reward', () => {
    const order = priceOnlineOrder([corndog(), drink('Brown Sugar', 2)], site, { useReward: true, rewardsAvailable: 1 });
    assert.equal(order.rewardApplied, true);
    assert.equal(order.subtotal, 16);
    const free = order.receipt.find((r) => r.price === 0);
    assert.equal(free.name, `Brown Sugar (Tapioca, ${REWARD_LABEL})`);
    assert.equal(free.qty, 1);
    assert.match(priceOnlineOrder([drink()], site, { useReward: true, rewardsAvailable: 0 }).error, /no free drink/);
    assert.match(priceOnlineOrder([corndog()], site, { useReward: true, rewardsAvailable: 1 }).error, /Add a drink/);
});

// ── when ordering is open ──────────────────────────────────────────────────
const pin = { latitude: 26.2, longitude: -98.2 };
test('ordering is open during a pinned pop-up, and closes 15 minutes before the end', () => {
    const popups = [
        { id: 'a', date: '2026-07-04', start: '11:00', end: '16:00', ...pin },
        { id: 'b', date: '2026-07-11', start: '11:00', end: '16:00', ...pin },
    ];
    const at = (iso) => onlineOrderingWindow(popups, new Date(iso), CHI);
    assert.equal(at('2026-07-04T15:59:00Z').reason, 'closed', '10:59 local');
    assert.equal(at('2026-07-04T16:00:00Z').open.id, 'a', '11:00 local');
    assert.equal(at('2026-07-04T20:44:00Z').open.id, 'a', '15:44 local');
    assert.equal(at('2026-07-04T20:45:00Z').reason, 'closed', '15:45 local');
    assert.equal(at('2026-07-04T21:00:00Z').next.id, 'b');
});

test('a pop-up without a location pin cannot take online orders', () => {
    const w = onlineOrderingWindow([{ date: '2026-07-04', start: '11:00', end: '16:00', latitude: null, longitude: null }], new Date('2026-07-04T17:00:00Z'), CHI);
    assert.equal(w.reason, 'no_location');
    assert.equal(w.open, null);
});

// ── verified-phone cookie ───────────────────────────────────────────────────

test('a verified phone token proves its own number and nothing else', async () => {
    const now = Date.UTC(2026, 9, 3);
    const token = await createPhoneToken('9565551234', 'secret-a', now);
    assert.equal(await verifyPhoneToken(token, 'secret-a', now + 1000), '9565551234');
    // someone edits the number in their cookie
    assert.equal(await verifyPhoneToken(token.replace('9565551234', '9565559999'), 'secret-a', now), null);
    // signed with another key (e.g. the Twilio token was rotated)
    assert.equal(await verifyPhoneToken(token, 'secret-b', now), null);
    // expired
    assert.equal(await verifyPhoneToken(token, 'secret-a', now + REWARDS_DAYS * 86400000 + 1), null);
    for (const junk of [undefined, '', 'abc', '9565551234', '9565551234.x.y', `9565551234.${now + 1e9}.`]) {
        assert.equal(await verifyPhoneToken(junk, 'secret-a', now), null, String(junk));
    }
    assert.equal(await verifyPhoneToken(token, '', now), null, 'no secret, no rewards');
});
