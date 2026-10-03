import 'server-only';

// Text-message codes for rewards, through Twilio Verify's REST API (no SDK
// dependency). Twilio makes the 6-digit code, texts it, checks it, expires it
// after 10 minutes and limits how often one number can be texted.
//
// Settings (Vercel → Environment Variables), all SECRET, never NEXT_PUBLIC_:
//   TWILIO_ACCOUNT_SID         Twilio Console → Account Info → Account SID (AC…)
//   TWILIO_AUTH_TOKEN          Twilio Console → Account Info → Auth Token
//   TWILIO_VERIFY_SERVICE_SID  Twilio Console → Verify → Services → your service (VA…)
//   TWILIO_API_BASE_URL        optional, only to point tests at a stand-in server
//
// Customer rewards (the /loyalty page, the punch card and free drinks online)
// stay hidden until all three are set.

export function twilioConfig(env = process.env) {
    const accountSid = (env.TWILIO_ACCOUNT_SID ?? '').trim();
    const authToken = (env.TWILIO_AUTH_TOKEN ?? '').trim();
    const serviceSid = (env.TWILIO_VERIFY_SERVICE_SID ?? '').trim();
    const apiBase = ((env.TWILIO_API_BASE_URL ?? '').trim() || 'https://verify.twilio.com').replace(/\/$/, '');
    return { ready: Boolean(accountSid && authToken && serviceSid), accountSid, authToken, serviceSid, apiBase };
}

/** Customer rewards are on once Twilio is set up. */
export const rewardsEnabled = (env = process.env) => twilioConfig(env).ready;

/**
 * The key the "verified phone" cookie is signed with. Derived from the auth
 * token, so there's no extra setting; rotating the token in Twilio signs every
 * customer out, which is harmless (they verify again).
 */
export const rewardsSecret = (config = twilioConfig()) => (config.ready ? `${config.accountSid}:${config.authToken}` : '');

async function verifyRequest(config, path, fields) {
    const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
    const response = await fetch(`${config.apiBase}/v2/Services/${encodeURIComponent(config.serviceSid)}${path}`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields),
        cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

/** Twilio's error codes -> what to tell the customer. */
const MESSAGES = {
    60200: 'That phone number doesn’t look right. Please check it.',
    60202: 'Too many wrong codes. Please wait 10 minutes and ask for a new one.',
    60203: 'We’ve sent too many codes to this number. Please wait 10 minutes and try again.',
    60205: 'That number can’t get text messages. Please use a mobile number.',
    60410: 'We can’t text this number right now. Ask at the stand and we’ll look up your rewards.',
    20404: 'That code has expired. Please ask for a new one.',
    20429: 'We’re busy right now. Please try again in a minute.',
};
const messageFor = (code, fallback) => MESSAGES[code] ?? fallback;

/** Text a code to a US number (10 digits). */
export async function sendCode(config, digits) {
    const { ok, data } = await verifyRequest(config, '/Verifications', { To: `+1${digits}`, Channel: 'sms' });
    if (ok) return { ok: true };
    return { ok: false, code: data?.code, message: messageFor(data?.code, 'We couldn’t send a code. Please try again.') };
}

/** Is `code` the one we texted to `digits`? */
export async function checkCode(config, digits, code) {
    const { ok, data } = await verifyRequest(config, '/VerificationCheck', { To: `+1${digits}`, Code: code });
    if (ok && data?.status === 'approved') return { ok: true };
    if (ok) return { ok: false, message: 'That code isn’t right. Please check it and try again.' };
    return { ok: false, code: data?.code, message: messageFor(data?.code, 'We couldn’t check the code. Please try again.') };
}
