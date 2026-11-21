import test from 'node:test';
import assert from 'node:assert/strict';

import { zelleQrUrl, zelleRecipient } from './zelle.js';

const decode = (url) => {
    const data = new URL(url).searchParams.get('data');
    return JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
};

test('an email recipient is trimmed and lowercased', () => {
    assert.equal(zelleRecipient('  Pay@TheMoonTea.com '), 'pay@themoontea.com');
});

test('a US phone recipient keeps just its 10 digits', () => {
    assert.equal(zelleRecipient('(714) 555-0123'), '7145550123');
    assert.equal(zelleRecipient('+1 714 555 0123'), '7145550123');
});

test('anything else is not a Zelle recipient', () => {
    assert.equal(zelleRecipient(''), null);
    assert.equal(zelleRecipient('themoontea'), null);
    assert.equal(zelleRecipient('555-0123'), null);
    assert.equal(zelleRecipient('a@b'), null);
});

test('the QR link is the Zelle QR format with name, recipient and the payment action', () => {
    const url = zelleQrUrl({ name: ' The Moon Tea ', recipient: 'Pay@TheMoonTea.com' });
    assert.ok(url.startsWith('https://enroll.zellepay.com/qr-codes?data='));
    assert.deepEqual(decode(url), { name: 'THE MOON TEA', token: 'pay@themoontea.com', action: 'payment' });
});

test('no QR link without a valid recipient or a name', () => {
    assert.equal(zelleQrUrl({ name: 'The Moon Tea', recipient: 'nope' }), null);
    assert.equal(zelleQrUrl({ name: '  ', recipient: '7145550123' }), null);
});
