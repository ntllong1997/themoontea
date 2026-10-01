import 'server-only';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, staffPassword, verifySessionToken } from '@/lib/auth/session';

/**
 * Re-checks the staff session inside an API route. middleware.js already
 * guards these paths; this keeps a route safe even if the matcher changes.
 * Returns a 401 response to send back, or null when the caller is staff.
 */
export async function requireStaff(request) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (await verifySessionToken(token, staffPassword())) return null;
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
}
