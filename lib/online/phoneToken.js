// The "this phone is yours" cookie, set after a customer types the code we
// texted them. It holds `<digits>.<expiry>.<signature>`: the signature is an
// HMAC keyed by a server secret, so a customer can't edit the number in it.
//
// Web Crypto only, relative imports only, so `node --test` can load this file.
import { constantTimeEqual } from '../auth/session.js';

export const REWARDS_COOKIE = 'moontea_rewards';

/** How long a verified phone stays signed in on that device. */
export const REWARDS_DAYS = 30;

const encoder = new TextEncoder();

async function sign(secret, message) {
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(`moontea-rewards:${secret}`),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A token saying `digits` was verified just now. */
export async function createPhoneToken(digits, secret, now = Date.now()) {
    if (!secret) throw new Error('No secret to sign the rewards cookie with');
    const expiresAt = now + REWARDS_DAYS * 24 * 60 * 60 * 1000;
    return `${digits}.${expiresAt}.${await sign(secret, `${digits}.${expiresAt}`)}`;
}

/** The verified 10 digits in `token`, or null if it's forged, broken or expired. */
export async function verifyPhoneToken(token, secret, now = Date.now()) {
    if (!secret || typeof token !== 'string') return null;
    const [digits, expiresAt, signature] = token.split('.');
    if (!/^\d{10}$/.test(digits ?? '') || !/^\d+$/.test(expiresAt ?? '') || !signature) return null;
    if (Number(expiresAt) <= now) return null;
    return constantTimeEqual(signature, await sign(secret, `${digits}.${expiresAt}`)) ? digits : null;
}
