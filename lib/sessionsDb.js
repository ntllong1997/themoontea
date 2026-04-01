import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SESSION_TTL_MINUTES = 5;

/**
 * Cancels any currently active session, then creates a new one.
 * Returns the new token string.
 */
export async function createSession() {
    // Cancel any existing active session first
    await supabase
        .from('ordering_sessions')
        .update({ status: 'cancelled' })
        .eq('status', 'active');

    const token = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000);

    const { error } = await supabase.from('ordering_sessions').insert({
        token,
        status: 'active',
        expires_at: expiresAt.toISOString(),
    });

    if (error) {
        console.error('Failed to create session:', error);
        throw new Error(error.message);
    }

    return token;
}

/**
 * Fetches a session by token. Returns null if not found.
 */
export async function getSession(token) {
    const { data, error } = await supabase
        .from('ordering_sessions')
        .select('*')
        .eq('token', token)
        .single();

    if (error) return null;
    return data;
}

/**
 * Cancels the currently active session (if any).
 */
export async function cancelActiveSession() {
    const { error } = await supabase
        .from('ordering_sessions')
        .update({ status: 'cancelled' })
        .eq('status', 'active');

    if (error) {
        console.error('Failed to cancel session:', error);
        throw new Error(error.message);
    }
}

/**
 * Marks a session as used after an order is placed.
 */
export async function markSessionUsed(token, orderNumber) {
    const { error } = await supabase
        .from('ordering_sessions')
        .update({
            status: 'used',
            used_at: new Date().toISOString(),
            order_number: orderNumber,
        })
        .eq('token', token);

    if (error) {
        console.error('Failed to mark session as used:', error);
        throw new Error(error.message);
    }
}
