import { NextResponse } from 'next/server';
import {
    createSession,
    getSession,
    cancelActiveSession,
    markSessionUsed,
} from '@/lib/sessionsDb';

// GET /api/sessions?token=X  — validate a token (called by customer page on load)
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.json({ valid: false, reason: 'No token provided' }, { status: 400 });
    }

    const session = await getSession(token);

    if (!session) {
        return NextResponse.json({ valid: false, reason: 'Invalid token' });
    }

    if (session.status === 'used') {
        return NextResponse.json({ valid: false, reason: 'Order already placed' });
    }

    if (session.status === 'cancelled' || session.status === 'expired') {
        return NextResponse.json({ valid: false, reason: 'Token cancelled or expired' });
    }

    if (new Date(session.expires_at) < new Date()) {
        return NextResponse.json({ valid: false, reason: 'Token expired' });
    }

    return NextResponse.json({ valid: true, expiresAt: session.expires_at });
}

// POST /api/sessions  — create a new session (vendor taps "Next Customer")
export async function POST() {
    try {
        const token = await createSession();
        return NextResponse.json({ token });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/sessions  — cancel active session OR mark as used
// Body: { action: 'cancel' } | { action: 'use', token, orderNumber }
export async function PATCH(request) {
    try {
        const body = await request.json();

        if (body.action === 'cancel') {
            await cancelActiveSession();
            return NextResponse.json({ ok: true });
        }

        if (body.action === 'use') {
            const { token, orderNumber } = body;
            if (!token || !orderNumber) {
                return NextResponse.json({ error: 'token and orderNumber required' }, { status: 400 });
            }

            // Re-validate token before marking used (prevent race conditions)
            const session = await getSession(token);
            if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) {
                return NextResponse.json({ error: 'Token no longer valid' }, { status: 409 });
            }

            await markSessionUsed(token, orderNumber);
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
