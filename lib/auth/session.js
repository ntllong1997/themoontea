// The staff sign-in session: one shared password (STAFF_PASSWORD), exchanged
// at /login for a signed cookie that middleware.js checks on every staff page.
//
// The cookie holds `<expiry>.<signature>`, where the signature is an HMAC of
// the expiry keyed by the password itself. So there is no session store, and
// changing STAFF_PASSWORD signs every device out at once.
//
// Web Crypto only (no node:crypto), because middleware runs on the Edge
// runtime. Relative imports only, so `node --test` can load this file.

import { LOYALTY_PUBLIC } from '../online/loyalty.js';

export const SESSION_COOKIE = 'moontea_staff';

/** How long a device stays signed in. */
export const SESSION_DAYS = 30;

const encoder = new TextEncoder();

async function hmacHex(secret, message) {
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(`moontea-staff:${secret}`),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compare two strings without leaking where they first differ. */
export function constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const left = encoder.encode(a);
    const right = encoder.encode(b);
    let diff = left.length ^ right.length;
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
    }
    return diff === 0;
}

/** A fresh session token for a correct password. */
export async function createSessionToken(password, now = Date.now()) {
    const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
    return `${expiresAt}.${await hmacHex(password, String(expiresAt))}`;
}

/** True when `token` was signed with `password` and has not expired. */
export async function verifySessionToken(token, password, now = Date.now()) {
    if (!password || typeof token !== 'string') return false;
    const [expiresAt, signature] = token.split('.');
    if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
    if (Number(expiresAt) <= now) return false;
    return constantTimeEqual(signature, await hmacHex(password, expiresAt));
}

/**
 * The configured staff password, or '' when it has not been set. Trimmed,
 * because a value pasted into a hosting dashboard easily picks up a stray
 * space or line break that nobody can see.
 */
export const staffPassword = () => (process.env.STAFF_PASSWORD ?? '').trim();

/**
 * Pages anyone may open without signing in: the customer menu (and the
 * photos served under /menu/), online ordering and its APIs, the loyalty
 * card (while LOYALTY_PUBLIC is on), and the sign-in flow.
 */
export function isPublicPath(pathname, { loyaltyPublic = LOYALTY_PUBLIC } = {}) {
    return (
        pathname === '/menu' ||
        pathname.startsWith('/menu/') ||
        pathname === '/order/online' ||
        pathname === '/login' ||
        pathname === '/api/login' ||
        (loyaltyPublic && (pathname === '/loyalty' || pathname === '/api/loyalty')) ||
        pathname.startsWith('/api/order/')
    );
}
