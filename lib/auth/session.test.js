import test from 'node:test';
import assert from 'node:assert/strict';

import { constantTimeEqual, createSessionToken, isPublicPath, verifySessionToken } from './session.js';

test('a session token verifies with the password that made it', async () => {
    const token = await createSessionToken('moon');
    assert.equal(await verifySessionToken(token, 'moon'), true);
});

test('changing the password signs everyone out', async () => {
    const token = await createSessionToken('moon');
    assert.equal(await verifySessionToken(token, 'sun'), false);
});

test('expired, tampered and missing tokens are refused', async () => {
    const now = Date.now();
    const token = await createSessionToken('moon', now);
    const [expiry, signature] = token.split('.');
    assert.equal(await verifySessionToken(token, 'moon', now + 31 * 24 * 3600 * 1000), false);
    assert.equal(await verifySessionToken(`${Number(expiry) + 1}.${signature}`, 'moon', now), false);
    assert.equal(await verifySessionToken(undefined, 'moon'), false);
    assert.equal(await verifySessionToken('garbage', 'moon'), false);
});

test('no password configured means nobody gets in', async () => {
    const token = await createSessionToken('');
    assert.equal(await verifySessionToken(token, ''), false);
});

test('constantTimeEqual', () => {
    assert.equal(constantTimeEqual('abc', 'abc'), true);
    assert.equal(constantTimeEqual('abc', 'abd'), false);
    assert.equal(constantTimeEqual('abc', 'abcd'), false);
    assert.equal(constantTimeEqual('abc', undefined), false);
});

test('only customer pages are public', () => {
    for (const path of ['/menu', '/menu/golden-taro.webp', '/order/online', '/login', '/api/login']) {
        assert.equal(isPublicPath(path), true, path);
    }
    for (const path of ['/', '/vendor', '/order', '/order/drink', '/summary', '/inventory', '/cashapp', '/admin/menu', '/api/admin/menu', '/menus', '/order/online2']) {
        assert.equal(isPublicPath(path), false, path);
    }
});

test('a stray space around STAFF_PASSWORD is ignored', async () => {
    const { staffPassword } = await import('./session.js');
    const saved = process.env.STAFF_PASSWORD;
    process.env.STAFF_PASSWORD = '  moon\n';
    try {
        assert.equal(staffPassword(), 'moon');
    } finally {
        if (saved === undefined) delete process.env.STAFF_PASSWORD;
        else process.env.STAFF_PASSWORD = saved;
    }
});
