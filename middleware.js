import { NextResponse } from 'next/server';
import { SESSION_COOKIE, isPublicPath, staffPassword, verifySessionToken } from '@/lib/auth/session';

// Every page except the customer-facing ones needs the staff password.
// See lib/auth/session.js for how the session cookie works.
export async function middleware(request) {
    const { pathname, search } = request.nextUrl;
    if (isPublicPath(pathname)) return NextResponse.next();

    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (await verifySessionToken(token, staffPassword())) return NextResponse.next();

    if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
}

export const config = {
    // Skip Next's own assets; everything else goes through the check above.
    matcher: ['/((?!_next/|favicon.ico).*)'],
};
