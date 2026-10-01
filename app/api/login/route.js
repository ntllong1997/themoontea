import { NextResponse } from 'next/server';
import {
    SESSION_COOKIE,
    SESSION_DAYS,
    constantTimeEqual,
    createSessionToken,
    staffPassword,
} from '@/lib/auth/session';

export async function POST(request) {
    const password = staffPassword();
    if (!password) {
        return NextResponse.json(
            { error: 'No staff password is set up yet. Add STAFF_PASSWORD to the site settings.' },
            { status: 503 }
        );
    }

    const body = await request.json().catch(() => ({}));
    if (!constantTimeEqual(String(body.password ?? ''), password)) {
        // A small fixed delay makes guessing the password slower.
        await new Promise((resolve) => setTimeout(resolve, 600));
        return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(password), {
        httpOnly: true,
        // HTTPS-only when the site is on HTTPS; a till on plain http:// over
        // the local network still has to be able to sign in.
        secure: request.nextUrl.protocol === 'https:',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
    return response;
}
