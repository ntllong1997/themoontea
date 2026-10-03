import 'server-only';
import { REWARDS_COOKIE, REWARDS_DAYS, createPhoneToken, verifyPhoneToken } from '@/lib/online/phoneToken';
import { rewardsSecret, twilioConfig } from '@/lib/online/twilio';

// Which phone number this browser has proven it owns (by text code), if any.

/** The verified 10 digits for this request, or null. */
export async function verifiedPhone(request) {
    const config = twilioConfig();
    if (!config.ready) return null;
    return verifyPhoneToken(request.cookies.get(REWARDS_COOKIE)?.value, rewardsSecret(config));
}

/** Remember on this browser that `digits` was verified. */
export async function rememberPhone(response, digits) {
    response.cookies.set(REWARDS_COOKIE, await createPhoneToken(digits, rewardsSecret()), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: REWARDS_DAYS * 24 * 60 * 60,
    });
    return response;
}

export function forgetPhone(response) {
    response.cookies.set(REWARDS_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    return response;
}
