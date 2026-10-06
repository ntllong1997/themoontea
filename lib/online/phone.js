// US phone numbers as customers type them. No imports.

/**
 * Any way people type a US phone number -> its 10 digits, or null.
 * "(956) 624-5751", "956.624.5751", "+1 956 624 5751" all give "9566245751".
 */
export function normalizePhone(raw) {
    if (typeof raw !== 'string' && typeof raw !== 'number') return null;
    let digits = String(raw).replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    return /^[2-9]\d{9}$/.test(digits) ? digits : null;
}

/** "9566245751" -> "(956) 624-5751". */
export const formatPhone = (digits) => `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
