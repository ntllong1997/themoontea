// The punch card: every paid drink is a stamp, and STAMPS_PER_REWARD stamps
// earn the next drink free ("buy 9, get the 10th free"). Stamps aren't stored:
// they're counted from paid drinks in `orders` by phone, so the iPad, the web
// till and online orders all earn them without any change. No imports.

export const STAMPS_PER_REWARD = 9;

/** Which `orders.type` values earn a stamp, and can be the free drink. */
export const STAMP_TYPES = ['Boba'];

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

/**
 * Paid drinks and free drinks already given -> what the card shows.
 *   stamps:           filled boxes on the current card (0..8)
 *   rewardsAvailable: free drinks ready to claim now
 */
export function punchCard(paidDrinks, redeemed) {
    const paid = Math.max(0, Math.floor(Number(paidDrinks) || 0));
    const used = Math.max(0, Math.floor(Number(redeemed) || 0));
    const earned = Math.floor(paid / STAMPS_PER_REWARD);
    return {
        stamps: paid % STAMPS_PER_REWARD,
        perReward: STAMPS_PER_REWARD,
        rewardsAvailable: Math.max(0, earned - used),
        totalDrinks: paid,
        rewardsUsed: used,
    };
}
