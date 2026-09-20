// Server-only: charges a tokenized card through Square's Payments API.
//
// This is a separate concern from the in-person Square reader the iPad app
// drives (MoonTea/MoonTea/Services/SquareService.swift, which talks to a
// physical reader through the Mobile Payments SDK). This is Square's web
// Payments API instead, called with a plain `fetch` rather than Square's node
// SDK — the rest of this app has no server SDK dependencies at all, and one
// REST call doesn't justify starting.
//
// Never import this from a 'use client' file: SQUARE_ACCESS_TOKEN is a
// secret that must only ever live on the server.

const SQUARE_BASE_URL = {
    production: 'https://connect.squareup.com',
    sandbox: 'https://connect.squareupsandbox.com',
};

function squareEnvironment() {
    return process.env.SQUARE_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production';
}

/**
 * Charges a card the browser already tokenized with the Square Web Payments
 * SDK (`components/SquareCardForm.jsx`). The card is charged before any order
 * row is written — a failed or declined charge must never leave a
 * kitchen-visible order behind, so the caller creates the order only after
 * this resolves.
 *
 * @param {{ sourceId: string, amountCents: number, idempotencyKey: string, note?: string }} params
 * @returns {Promise<{ paymentId: string, status: string }>}
 */
export async function chargeSquareCard({ sourceId, amountCents, idempotencyKey, note }) {
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId = process.env.SQUARE_LOCATION_ID;

    if (!accessToken || !locationId) {
        throw new Error('Square is not configured on the server yet.');
    }
    if (!sourceId || !idempotencyKey) {
        throw new Error('Missing payment token.');
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new Error('Invalid payment amount.');
    }

    const response = await fetch(`${SQUARE_BASE_URL[squareEnvironment()]}/v2/payments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            source_id: sourceId,
            idempotency_key: idempotencyKey,
            amount_money: { amount: amountCents, currency: 'USD' },
            location_id: locationId,
            autocomplete: true,
            note,
        }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const detail = data?.errors?.[0]?.detail || 'Card payment failed.';
        throw new Error(detail);
    }

    return { paymentId: data.payment?.id, status: data.payment?.status };
}
