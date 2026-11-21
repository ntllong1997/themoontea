// Zelle's payment QR code, like the one a bank app shows under "My QR code".
// Scanned from Zelle inside the customer's bank app, it fills in who to pay;
// Zelle has no way to fill in the amount. Same format as the iPhone app's
// ZelleQR.swift.

const ZELLE_QR_PREFIX = 'https://enroll.zellepay.com/qr-codes?data=';
const SETTINGS_KEY = 'zelleRecipient';
const US_PHONE_DIGITS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @typedef {{ name: string, recipient: string }} ZelleSettings */

/**
 * The email or US phone Zelle pays, normalized the way Zelle stores it, or
 * null when it's neither.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function zelleRecipient(raw) {
    const text = (raw ?? '').trim();
    if (EMAIL_PATTERN.test(text)) return text.toLowerCase();
    const digits = text.replace(/\D/g, '');
    const national = digits.length === US_PHONE_DIGITS + 1 && digits.startsWith('1') ? digits.slice(1) : digits;
    return national.length === US_PHONE_DIGITS && /^[\d\s()+.-]+$/.test(text) ? national : null;
}

/**
 * The link inside the Zelle QR, or null without a name and valid recipient.
 *
 * @param {ZelleSettings} settings
 * @returns {string|null}
 */
export function zelleQrUrl({ name, recipient }) {
    const token = zelleRecipient(recipient);
    const cleanName = (name ?? '').trim().toUpperCase();
    if (!token || !cleanName) return null;
    // Byte-for-byte what bank apps put in their own Zelle codes (sorted keys,
    // `"key" : value`, two-space indent); Bank of America rejected a compact one.
    const fields = [['action', 'payment'], ['name', cleanName], ['token', token]];
    const json = `{\n${fields.map(([key, value]) => `  ${JSON.stringify(key)} : ${JSON.stringify(value)}`).join(',\n')}\n}`;
    const bytes = new TextEncoder().encode(json);
    return ZELLE_QR_PREFIX + btoa(String.fromCharCode(...bytes));
}

/**
 * The shop's Zelle name and recipient saved in this browser, or null.
 *
 * @returns {ZelleSettings|null}
 */
export function getZelleSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
        return saved && zelleQrUrl(saved) ? saved : null;
    } catch {
        return null;
    }
}

/**
 * Saves the shop's Zelle details in this browser. Throws when they can't make
 * a QR code, so the form can say what's wrong.
 *
 * @param {ZelleSettings} settings
 * @returns {ZelleSettings}
 */
export function saveZelleSettings({ name, recipient }) {
    if (!(name ?? '').trim()) throw new Error('Enter the name Zelle shows for the shop.');
    const token = zelleRecipient(recipient);
    if (!token) throw new Error('Enter the email or US phone number the shop gets Zelle on.');
    const settings = { name: name.trim(), recipient: token };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return settings;
}
