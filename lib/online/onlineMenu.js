// What customers can order online, and what it costs.
//
// The price of everything comes from the till's catalog (lib/menu/catalog.js),
// recomputed on the server from the customer's *choices* — never from a price
// the browser sends — so a tampered page can't change what is charged.
//
// What is available comes from the Menu Items page (site_menu_items): a drink
// marked Sold out or Hidden there can't be ordered online either. SITE_ITEMS
// ties each catalog choice to the menu item it appears as on the site.
//
// Relative imports so `node --test` can load this file.
import { TAX_RATE, buildCartLine, categoryFor, optionValue } from '../menu/catalog.js';
import { calculateTotals, formatItemName } from '../orders/orderModel.js';
import { STAMP_TYPES } from './loyalty.js';

/** Catalog categories sold online, in page order. */
export const ONLINE_CATEGORIES = ['Corndog', 'Boba'];

/** Catalog choice -> the site menu item whose status gates it. */
export const SITE_ITEMS = {
    Corndog: { '*': 'Korean Corndog' },
    Boba: {
        'Brown Sugar': 'Brown Sugar Boba Tea',
        'Matcha Brown Sugar': 'Matcha Brown Sugar',
        'Matcha Strawberry': 'Matcha Strawberry',
        'Korean Strawberry': 'Korean Strawberry',
        'Golden Taro': 'Golden Taro',
        Tropical: 'Tropical Fruit Tea',
        Strawberry: 'Strawberry Fruit Tea',
        Cafe: 'Vietnamese Coffee',
    },
};

export const MAX_UNITS_PER_LINE = 10;
export const MAX_UNITS_PER_ORDER = 20;
export const REWARD_LABEL = 'Free reward';

const siteItemFor = (categoryKey, selection) => {
    const map = SITE_ITEMS[categoryKey] ?? {};
    return map['*'] ?? map[selection?.drink];
};

/** Site rows -> Map(name -> row) for quick status lookups. */
const bySiteName = (siteRows) => new Map((siteRows ?? []).map((row) => [row.name, row]));

/**
 * The online menu for the order page: every catalog choice with its photo,
 * description and whether it can be ordered right now.
 */
export function buildOnlineMenu(siteRows) {
    const site = bySiteName(siteRows);
    const status = (name) => site.get(name)?.status ?? 'hidden';

    return ONLINE_CATEGORIES.map((key) => {
        const category = categoryFor(key);
        if (key === 'Corndog') {
            const item = site.get(SITE_ITEMS.Corndog['*']);
            return {
                key,
                label: 'Korean Corndog',
                price: category.price,
                available: status(SITE_ITEMS.Corndog['*']) === 'available',
                image: item?.image_url ?? null,
                description: item?.description ?? '',
                groups: category.optionGroups.map((g) => ({ key: g.key, label: g.label, options: g.options.map(optionValue) })),
                addOns: [{ key: 'dust', label: 'Hot Cheeto Dust', price: 1, when: { outside: 'Potato' } }],
            };
        }
        const drinkGroup = category.optionGroups.find((g) => g.key === 'drink');
        const bobaGroup = category.optionGroups.find((g) => g.key === 'boba');
        return {
            key,
            label: 'Boba',
            price: category.price,
            toppings: bobaGroup.options.map(optionValue),
            drinks: drinkGroup.options.map(optionValue).map((option) => {
                const name = SITE_ITEMS.Boba[option] ?? option;
                const item = site.get(name);
                return {
                    option,
                    name,
                    image: item?.image_url ?? null,
                    description: item?.description ?? '',
                    available: status(name) === 'available',
                    customization: category.addOns
                        .map((addOn) => addOn.label({ drink: option }))
                        .find(Boolean) ?? null,
                };
            }),
        };
    });
}

/**
 * Checks one line's choices against the catalog. Every value must be one the
 * till offers — buildCartLine alone would happily price "Cheese" for a drink.
 */
function validSelection(category, selection) {
    if (!selection || typeof selection !== 'object') return null;
    const clean = { addOns: {} };
    for (const group of category.optionGroups) {
        const value = selection[group.key];
        if (!group.options.map(optionValue).includes(value)) return null;
        clean[group.key] = value;
    }
    for (const addOn of category.addOns) clean.addOns[addOn.key] = selection.addOns?.[addOn.key] === true;
    return clean;
}

/**
 * Customer's cart -> priced order, or { error } in words they can act on.
 *
 * @param {Array<{ category: string, selection: object, quantity: number }>} lines
 * @param {Array<{ name: string, status: string }>} siteRows the Menu Items table
 * @param {{ useReward?: boolean, rewardsAvailable?: number }} options
 */
export function priceOnlineOrder(lines, siteRows, { useReward = false, rewardsAvailable = 0 } = {}) {
    if (!Array.isArray(lines) || lines.length === 0) return { error: 'Your order is empty' };
    const site = bySiteName(siteRows);

    const priced = [];
    let units = 0;
    for (const line of lines) {
        if (!ONLINE_CATEGORIES.includes(line?.category)) return { error: 'Something in your order is not sold online' };
        const category = categoryFor(line.category);
        const selection = validSelection(category, line.selection);
        if (!selection) return { error: 'Please finish choosing your options' };

        const siteName = siteItemFor(line.category, selection);
        if (site.get(siteName)?.status !== 'available') {
            return { error: `Sorry, ${siteName ?? 'that item'} just sold out. Please remove it and try again.` };
        }

        const quantity = Number(line.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_UNITS_PER_LINE) {
            return { error: `You can order 1 to ${MAX_UNITS_PER_LINE} of each item` };
        }
        units += quantity;
        if (units > MAX_UNITS_PER_ORDER) return { error: `Online orders are limited to ${MAX_UNITS_PER_ORDER} items` };

        const cartLine = buildCartLine(category, selection);
        if (!cartLine) return { error: 'Please finish choosing your options' };
        priced.push({ ...cartLine, quantity });
    }

    // The free drink: the cheapest stamp-earning unit, split onto its own line.
    let rewardApplied = false;
    if (useReward) {
        if (rewardsAvailable < 1) return { error: 'There is no free drink on this phone number yet' };
        const candidates = priced.filter((l) => STAMP_TYPES.includes(l.type));
        if (candidates.length === 0) return { error: 'Add a drink to use your free drink' };
        const cheapest = candidates.reduce((a, b) => (b.price < a.price ? b : a));
        cheapest.quantity -= 1;
        priced.push({ ...cheapest, quantity: 1, price: 0, modifiers: [...cheapest.modifiers, REWARD_LABEL] });
        rewardApplied = true;
    }
    const finalLines = priced.filter((l) => l.quantity > 0);

    const unitPrices = finalLines.flatMap((l) => Array.from({ length: l.quantity }, () => ({ price: l.price })));
    const { subtotal, tax, total } = calculateTotals(unitPrices, TAX_RATE);

    return {
        lines: finalLines,
        receipt: finalLines.map((l) => ({ name: formatItemName(l), qty: l.quantity, price: l.price, type: l.type })),
        subtotal,
        tax,
        total,
        amountCents: Math.round(total * 100),
        rewardApplied,
    };
}
