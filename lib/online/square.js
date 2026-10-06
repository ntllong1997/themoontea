import 'server-only';

// Square card payments for online orders, through Square's REST API (no SDK
// dependency). The browser turns the card into a one-time token with Square's
// Web Payments SDK; only that token reaches this server, never card numbers.
//
// Settings (Vercel → Environment Variables):
//   SQUARE_ENVIRONMENT     'sandbox' (test cards, no real money) or 'production'
//   SQUARE_APPLICATION_ID  Square Developer → your app → Credentials
//   SQUARE_LOCATION_ID     Square Developer → your app → Locations
//   SQUARE_ACCESS_TOKEN    Credentials → Access token. SECRET: never NEXT_PUBLIC_.
//   SQUARE_API_BASE_URL    optional, only to point tests at a stand-in server

const SQUARE_VERSION = '2025-01-23';

export function squareConfig(env = process.env) {
    const environment = (env.SQUARE_ENVIRONMENT ?? '').trim() === 'production' ? 'production' : 'sandbox';
    const applicationId = (env.SQUARE_APPLICATION_ID ?? '').trim();
    const locationId = (env.SQUARE_LOCATION_ID ?? '').trim();
    const accessToken = (env.SQUARE_ACCESS_TOKEN ?? '').trim();
    const apiBase =
        (env.SQUARE_API_BASE_URL ?? '').trim() ||
        (environment === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com');
    return {
        ready: Boolean(applicationId && locationId && accessToken),
        environment,
        applicationId,
        locationId,
        accessToken,
        apiBase: apiBase.replace(/\/$/, ''),
        sdkUrl:
            environment === 'production'
                ? 'https://web.squarecdn.com/v1/square.js'
                : 'https://sandbox.web.squarecdn.com/v1/square.js',
    };
}

async function squareRequest(config, path, body) {
    const response = await fetch(`${config.apiBase}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Square-Version': SQUARE_VERSION,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

/** Square's error codes -> what to tell the customer. */
const CARD_MESSAGES = {
    CARD_DECLINED: 'Your card was declined. Please try another card.',
    INSUFFICIENT_FUNDS: 'Your card was declined for insufficient funds.',
    CVV_FAILURE: 'The security code (CVV) did not match. Please check it.',
    ADDRESS_VERIFICATION_FAILURE: 'The ZIP code did not match your card. Please check it.',
    INVALID_EXPIRATION: 'The expiration date looks wrong. Please check it.',
    GENERIC_DECLINE: 'Your card was declined. Please try another card.',
    TRANSACTION_LIMIT: 'Your card was declined (over its limit). Please try another card.',
    VERIFY_CVV_FAILURE: 'The security code (CVV) did not match. Please check it.',
};

/**
 * Charge a card token. Succeeds only for a COMPLETED payment.
 * @returns {Promise<{ ok: true, payment: object } | { ok: false, message: string }>}
 */
export async function chargeCard(config, { sourceId, amountCents, idempotencyKey, note, referenceId }) {
    const { ok, data } = await squareRequest(config, '/v2/payments', {
        source_id: sourceId,
        idempotency_key: idempotencyKey,
        amount_money: { amount: amountCents, currency: 'USD' },
        location_id: config.locationId,
        autocomplete: true,
        reference_id: referenceId,
        note,
    });
    const payment = data?.payment;
    if (ok && payment?.status === 'COMPLETED') return { ok: true, payment };
    const code = data?.errors?.[0]?.code;
    return {
        ok: false,
        message: CARD_MESSAGES[code] ?? 'The payment did not go through. Please check your card and try again.',
        code: code ?? payment?.status ?? 'UNKNOWN',
    };
}

/** Give a payment's money back in full (used if saving the order fails after charging). */
export async function refundPayment(config, { paymentId, amountCents, idempotencyKey }) {
    const { ok, data } = await squareRequest(config, '/v2/refunds', {
        idempotency_key: idempotencyKey,
        payment_id: paymentId,
        amount_money: { amount: amountCents, currency: 'USD' },
        reason: 'Order could not be saved',
    });
    return { ok, refund: data?.refund ?? null, errors: data?.errors ?? null };
}
