// Fetch helpers shared by the /admin/menu tabs.

/** Call a staff API route; a signed-out session goes back to sign-in. */
export async function api(path, options = {}) {
    const response = await fetch(path, options);
    if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        throw new Error('Signed out');
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Something went wrong (${response.status})`);
    return body;
}

export const jsonRequest = (method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});
