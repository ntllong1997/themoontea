import test from 'node:test';
import assert from 'node:assert/strict';

import { checkServiceKey } from './serviceKey.js';

const jwt = (role) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref: 'x' })).toString('base64url')}.signature`;

test('a service_role JWT and an sb_secret key are accepted, trimmed', () => {
    assert.deepEqual(checkServiceKey(`  ${jwt('service_role')}\n`), { ok: true, key: jwt('service_role') });
    assert.equal(checkServiceKey('sb_secret_abc123').ok, true);
});

test('a missing key says so', () => {
    assert.equal(checkServiceKey(undefined).problem, 'missing');
    assert.equal(checkServiceKey('   ').problem, 'missing');
});

test('the public key pasted by mistake is caught', () => {
    assert.equal(checkServiceKey(jwt('anon')).problem, 'public_key');
    assert.equal(checkServiceKey('sb_publishable_abc').problem, 'public_key');
});

test('anything else is flagged as not a Supabase key', () => {
    assert.equal(checkServiceKey('my-password').problem, 'unrecognised');
});
