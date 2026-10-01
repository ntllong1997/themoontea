import { NextResponse } from 'next/server';
import {
    SESSION_COOKIE,
    SESSION_DAYS,
    constantTimeEqual,
    createSessionToken,
    staffPassword,
    verifySessionToken,
} from '@/lib/auth/session';

/**
 * Lets the sign-in page explain a failure: is a password set up on this
 * deployment at all, and is this browser already signed in? Reveals nothing
 * about the password itself.
 */
export async function GET(request) {
    const password = staffPassword();
    return NextResponse.json(
        {
            configured: Boolean(password),
            signedIn: await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, password),
        },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}

export async function POST(request) {
    const password = staffPassword();
    if (!password) {
        return NextResponse.json(
            {
                error:
                    'This deployment has no staff password. Add STAFF_PASSWORD in Vercel (tick Production AND Preview), then redeploy.',
            },
            { status: 503 }
        );
    }

    const body = await request.json().catch(() => ({}));
    if (!constantTimeEqual(String(body.password ?? '').trim(), password)) {
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
