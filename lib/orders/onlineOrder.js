// What a customer's browser sends to /api/online-order, checked before it
// becomes an order. Names, modifiers and prices come from the menu
// (catalogLine), never from the request, so a tampered request can't order
// something off the menu or set its own price.
//
// Relative imports only, so `node --test` can load this file.

import { catalogLine } from '../menu/catalog.js';

const PHONE_DIGITS = 10;
const MAX_LINES = 30;
const MAX_UNITS_PER_LINE = 20;
const MAX_UNITS = 60;

/**
 * @param {unknown} body
 * @returns {{ values: { cartItems: Array<{name: string, modifiers: string[], price: number, type: string, quantity: number}>, phone: string } } | { error: string }}
 */
export function parseOnlineOrder(body) {
    const lines = body?.cartItems;
    if (!Array.isArray(lines) || lines.length === 0) return { error: 'Your order is empty.' };
    if (lines.length > MAX_LINES) return { error: 'That order has too many lines.' };

    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (phone.replace(/\D/g, '').length !== PHONE_DIGITS) return { error: 'Enter a 10-digit phone number.' };

    const cartItems = [];
    for (const line of lines) {
        const quantity = line?.quantity;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_UNITS_PER_LINE) {
            return { error: 'Each item can be ordered 1 to 20 times.' };
        }
        const menuLine = catalogLine({ type: line.type, name: line.name, modifiers: line.modifiers });
        if (!menuLine) return { error: `"${String(line?.name ?? '')}" isn't on the menu.` };
        cartItems.push({ ...menuLine, quantity });
    }
    if (cartItems.reduce((sum, item) => sum + item.quantity, 0) > MAX_UNITS) {
        return { error: 'That order is too large to place online.' };
    }
    return { values: { cartItems, phone } };
}
