import test from 'node:test';
import assert from 'node:assert/strict';

import {
    LIVE_OVERLAP_MS,
    MAX_LIMIT,
    cleanSearch,
    dayBounds,
    deviceLabel,
    entryFromRow,
    formatDetails,
    latestReceivedAt,
    mergeEntries,
    parseLogQuery,
    searchFilter,
    toCsv,
} from './activityLog.js';

const TZ = 'America/Chicago';
const params = (query) => new URLSearchParams(query);

const entry = (overrides) => ({
    id: 'a',
    createdAt: '2026-10-14T15:00:00.000Z',
    receivedAt: '2026-10-14T15:00:01.000Z',
    source: 'ios',
    deviceId: 'abcd1234-0000',
    deviceName: 'iPad13,18',
    appVersion: '1.0 (7)',
    sessionId: 's1',
    location: 1,
    level: 'info',
    category: 'printer',
    message: 'Printer connected',
    details: {},
    ...overrides,
});

test('dayBounds covers one shop-local day, across DST', () => {
    assert.deepEqual(dayBounds('2026-10-14', TZ), {
        from: '2026-10-14T05:00:00.000Z',
        to: '2026-10-15T05:00:00.000Z',
    });
    // Nov 1 2026: clocks fall back, so the day is 25 hours long.
    assert.deepEqual(dayBounds('2026-11-01', TZ), {
        from: '2026-11-01T05:00:00.000Z',
        to: '2026-11-02T06:00:00.000Z',
    });
    assert.equal(dayBounds('2026-02-30', TZ), null);
    assert.equal(dayBounds('yesterday', TZ), null);
});

test('parseLogQuery defaults to today on the shop calendar', () => {
    // 03:00 UTC on the 15th is still the 14th in Chicago.
    const { query } = parseLogQuery(params(''), { timeZone: TZ, now: new Date('2026-10-15T03:00:00Z') });
    assert.equal(query.day, '2026-10-14');
    assert.equal(query.from, '2026-10-14T05:00:00.000Z');
    assert.equal(query.levels, null);
    assert.equal(query.since, null);
    assert.equal(query.format, 'json');
});

test('parseLogQuery reads filters and backs `since` off by the overlap', () => {
    const { query } = parseLogQuery(
        params('day=2026-10-14&level=issues&category=printer&device=abcd-12&q=paper&limit=5000&since=2026-10-14T15:00:00.000Z&format=csv'),
        { timeZone: TZ }
    );
    assert.deepEqual(query.levels, ['warning', 'error']);
    assert.equal(query.category, 'printer');
    assert.equal(query.device, 'abcd-12');
    assert.equal(query.search, 'paper');
    assert.equal(query.limit, MAX_LIMIT);
    assert.equal(query.format, 'csv');
    assert.equal(Date.parse('2026-10-14T15:00:00.000Z') - Date.parse(query.since), LIVE_OVERLAP_MS);
});

test('parseLogQuery rejects bad input', () => {
    for (const bad of ['day=2026-13-01', 'level=loud', 'category=dogs', 'device=a b', 'limit=0', 'limit=2.5', 'since=soon']) {
        assert.ok(parseLogQuery(params(bad), { timeZone: TZ }).error, bad);
    }
});

test('search text cannot break out of the PostgREST or-filter', () => {
    assert.equal(cleanSearch('  paper, (out)*: "now" '), 'paper out now');
    assert.equal(searchFilter('paper out'), 'message.ilike.*paper out*');
    // A number also finds entries about that order.
    assert.equal(searchFilter('42'), 'message.ilike.*42*,details->>order.eq.42');
});

test('entryFromRow fills in missing optional columns', () => {
    const e = entryFromRow({
        id: 'x', created_at: 'c', received_at: 'r', source: 'ios', device_id: 'd', level: 'info',
        category: 'app', message: 'm', device_name: null, details: null,
    });
    assert.equal(e.deviceName, '');
    assert.deepEqual(e.details, {});
});

test('mergeEntries drops repeats from overlapping polls and keeps newest first', () => {
    const older = entry({ id: 'a', createdAt: '2026-10-14T15:00:00.000Z' });
    const newer = entry({ id: 'b', createdAt: '2026-10-14T15:05:00.000Z' });
    // Recorded offline earlier, uploaded late: sorts by when it happened.
    const late = entry({ id: 'c', createdAt: '2026-10-14T14:00:00.000Z', receivedAt: '2026-10-14T15:06:00.000Z' });
    const merged = mergeEntries([older], [older, newer, late]);
    assert.deepEqual(merged.map((e) => e.id), ['b', 'a', 'c']);
    assert.deepEqual(mergeEntries(merged, [], 2).map((e) => e.id), ['b', 'a']);
    assert.equal(latestReceivedAt(merged), '2026-10-14T15:06:00.000Z');
    assert.equal(latestReceivedAt([]), null);
});

test('deviceLabel and formatDetails are short and stable', () => {
    assert.equal(deviceLabel(entry()), 'iPad13,18 · abcd');
    assert.equal(formatDetails({ target: 'BT:1', code: 'ERR_TIMEOUT (4)' }), 'code=ERR_TIMEOUT (4); target=BT:1');
});

test('toCsv quotes awkward cells and uses shop-local time', () => {
    const csv = toCsv([entry({ message: 'Said "hi", then left', details: { order: 7 } })], TZ);
    const [header, row] = csv.trim().split('\r\n');
    assert.equal(header, 'time,level,category,message,details,device,device_id,app_version,session_id');
    assert.equal(row, '2026-10-14 10:00:00,info,printer,"Said ""hi"", then left",order=7,"iPad13,18",abcd1234-0000,1.0 (7),s1');
});
