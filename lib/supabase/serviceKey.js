// Works out whether SUPABASE_SERVICE_ROLE_KEY holds a usable key, so staff
// get a clear "here's what's wrong" instead of a vague failure. Pure, so it
// is unit tested in serviceKey.test.js. No imports, for `node --test`.

const FIX_IN_VERCEL =
    'In Vercel → Settings → Environment Variables, check SUPABASE_SERVICE_ROLE_KEY is ticked for both Production and Preview, then Redeploy (changes only reach new deployments).';

/** The role inside a legacy JWT key ('anon', 'service_role'), or null. */
function jwtRole(key) {
    const parts = key.split('.');
    if (parts.length !== 3) return null;
    try {
        const json = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        return typeof json.role === 'string' ? json.role : null;
    } catch {
        return null;
    }
}

/**
 * @returns {{ ok: true, key: string } | { ok: false, problem: string, message: string }}
 */
export function checkServiceKey(raw) {
    // A value pasted into a dashboard easily picks up a stray space or line break.
    const key = (raw ?? '').trim();
    if (!key) {
        return {
            ok: false,
            problem: 'missing',
            message: `This deployment can't see SUPABASE_SERVICE_ROLE_KEY. ${FIX_IN_VERCEL}`,
        };
    }
    if (key.startsWith('sb_publishable_') || jwtRole(key) === 'anon') {
        return {
            ok: false,
            problem: 'public_key',
            message:
                "SUPABASE_SERVICE_ROLE_KEY holds the public (anon / publishable) key, which can't save anything. In Supabase → Project Settings → API Keys, copy the service_role key (or an sb_secret_ key) instead, update it in Vercel, then Redeploy.",
        };
    }
    if (!key.startsWith('sb_secret_') && jwtRole(key) !== 'service_role') {
        return {
            ok: false,
            problem: 'unrecognised',
            message:
                "SUPABASE_SERVICE_ROLE_KEY doesn't look like a Supabase service key (it should start with eyJ… or sb_secret_). Copy it again from Supabase → Project Settings → API Keys, update it in Vercel, then Redeploy.",
        };
    }
    return { ok: true, key };
}
