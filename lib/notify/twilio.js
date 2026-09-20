// Server-only: texts (or WhatsApp-messages) a customer that their order is on
// the way, through Twilio's REST API directly — no `twilio` npm SDK, same
// reasoning as lib/payments/square.js.
//
// Never import this from a 'use client' file: TWILIO_AUTH_TOKEN is a secret.
//
// ── WhatsApp caveat ──────────────────────────────────────────────────────
// A plain-text WhatsApp message only delivers inside a 24-hour window the
// CUSTOMER opened by messaging your WhatsApp number first. A customer who
// placed an order on the website has never done that, so this is a
// "business-initiated" message — WhatsApp requires those to use a
// pre-approved message template (Twilio's Content API), or they're rejected
// outright. Configure `TWILIO_WHATSAPP_CONTENT_SID` (the ContentSid of an
// approved template with two variables — order number, then ETA minutes) to
// use that path; without it, this falls back to a freeform body, which only
// actually delivers in Twilio's WhatsApp Sandbox for numbers that joined it.

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

function channel() {
    return process.env.NOTIFY_CHANNEL === 'whatsapp' ? 'whatsapp' : 'sms';
}

/** 10-digit US numbers assumed local; anything else is trusted to already be E.164-ish. */
function toE164(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
}

/**
 * Sends one message. Silently no-ops (rather than throwing) when Twilio
 * credentials aren't configured, so a shop that hasn't set up notifications
 * yet doesn't have order placement itself fail — the caller treats this as
 * best-effort.
 *
 * @param {{ to: string, body: string, contentSid?: string, contentVariables?: Record<string, string> }} params
 */
export async function sendCustomerMessage({ to, body, contentSid, contentVariables }) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const ch = channel();
    const fromNumber = ch === 'whatsapp'
        ? process.env.TWILIO_WHATSAPP_FROM
        : process.env.TWILIO_SMS_FROM;

    if (!accountSid || !authToken || !fromNumber) {
        console.warn('[notify] Twilio is not configured — skipping message:', body);
        return { skipped: true };
    }

    const e164 = toE164(to);
    const params = new URLSearchParams({
        To: ch === 'whatsapp' ? `whatsapp:${e164}` : e164,
        From: ch === 'whatsapp' ? `whatsapp:${fromNumber}` : fromNumber,
    });

    if (ch === 'whatsapp' && contentSid) {
        params.set('ContentSid', contentSid);
        if (contentVariables) params.set('ContentVariables', JSON.stringify(contentVariables));
    } else {
        params.set('Body', body);
    }

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Failed to send the order notification.');
    }
    return { sid: data.sid };
}

/**
 * The one message this app actually sends: "your order will be ready soon".
 * Composes a freeform body for SMS/sandbox-WhatsApp, or the approved
 * template's variables when `TWILIO_WHATSAPP_CONTENT_SID` is set.
 *
 * @param {{ to: string, orderNumber: number, etaMinutes: number }} params
 */
export async function sendOrderPlacedMessage({ to, orderNumber, etaMinutes }) {
    const body = `🌙 The Moon Tea: Order #${orderNumber} received! We'll have it ready in about ${etaMinutes} minutes. See you soon 🧋`;
    const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID;
    return sendCustomerMessage({
        to,
        body,
        contentSid,
        contentVariables: contentSid ? { 1: String(orderNumber), 2: String(etaMinutes) } : undefined,
    });
}
