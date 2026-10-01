// Checks what the admin page sends before it reaches the database. Pure, so
// it is unit tested in site.test.js. Relative imports for `node --test`.
import { STATUSES } from './menu.js';

const STATUS_VALUES = new Set(STATUSES.map((s) => s.value));

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * Where an item's photo may come from: the site's own /menu/ photos, or the
 * public "menu-photos" bucket of this project's Supabase. Anything else would
 * fail next/image anyway, and refusing it keeps arbitrary URLs off the page.
 */
export function isAllowedImageUrl(url, supabaseUrl) {
    if (url.startsWith('/menu/')) return true;
    return Boolean(supabaseUrl) && url.startsWith(`${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/menu-photos/`);
}

/**
 * Body -> { values } with only the fields that were sent (when `partial`),
 * or { error } describing the first problem.
 */
export function parseItemInput(body, { partial = false, supabaseUrl = '' } = {}) {
    if (!body || typeof body !== 'object') return { error: 'Nothing to save' };
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    const values = {};

    if (!partial || has('name')) {
        values.name = text(body.name, 80);
        if (!values.name) return { error: 'Give the item a name' };
    }
    if (!partial || has('category')) {
        values.category = text(body.category, 40);
        if (!values.category) return { error: 'Pick a category' };
    }
    if (!partial || has('description')) values.description = text(body.description, 500);
    if (!partial || has('price')) {
        if (body.price === null || body.price === '' || body.price === undefined) {
            values.price = null;
        } else {
            const price = Number(body.price);
            if (!Number.isFinite(price) || price < 0 || price > 999) return { error: 'Price must be a number like 8 or 4.50' };
            values.price = Math.round(price * 100) / 100;
        }
    }
    if (!partial || has('price_note')) values.price_note = body.price_note === 'from' ? 'from' : null;
    if (!partial || has('image_url')) {
        const url = text(body.image_url, 500);
        if (url && !isAllowedImageUrl(url, supabaseUrl)) return { error: 'That photo address is not allowed' };
        values.image_url = url || null;
    }
    if (!partial || has('status')) {
        values.status = has('status') ? body.status : 'available';
        if (!STATUS_VALUES.has(values.status)) return { error: 'Unknown status' };
    }
    if (!partial || has('tags')) {
        const tags = Array.isArray(body.tags) ? body.tags : [];
        values.tags = [...new Set(tags.map((tag) => text(tag, 24)).filter(Boolean))].slice(0, 5);
    }
    if (has('sort_order')) {
        const order = Number(body.sort_order);
        if (!Number.isInteger(order)) return { error: 'Bad position' };
        values.sort_order = order;
    }
    if (partial && Object.keys(values).length === 0) return { error: 'Nothing to save' };
    return { values };
}
