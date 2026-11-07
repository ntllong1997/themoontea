// The main shop's customer site (/shop): how its menu is shaped for the page.
//
// The items themselves are in menu.json next to this file, transcribed from
// the shop's printed menu boards. Edit that file to add, rename or price an
// item; a `price` or `description` left null simply isn't shown.
//
// Relative imports so `node --test` can load this without the "@/" alias.
import { formatPrice } from '../site/menu.js';

/**
 * Items in menu order, bunched by their `group` (the corndog's Inside and
 * Outside, the classic fruit teas). Groups come in the order they first
 * appear; items with no group make a group named null.
 */
export function groupItems(items) {
    const groups = [];
    for (const item of items) {
        const name = item.group ?? null;
        const group = groups.find((g) => g.name === name);
        if (group) group.items.push(item);
        else groups.push({ name, items: [item] });
    }
    return groups;
}

/**
 * menu.json -> the sections the page renders, in menu order. Each item gets
 * a display price ('$0.75', or null). When several items share one price
 * (the toppings) the section shows it once and its items don't repeat it.
 */
export function shopSections(menu) {
    return menu.categories.map((category) => {
        const prices = new Set(category.items.map((item) => formatPrice(item.price)));
        const [onlyPrice] = prices;
        const shared = category.items.length > 1 && prices.size === 1 && onlyPrice ? onlyPrice : null;
        const items = category.items.map((item) => ({
            ...item,
            price: shared ? null : formatPrice(item.price),
        }));
        return { ...category, price: shared, items, groups: groupItems(items) };
    });
}

/** How many drinks the menu lists, for the hero line. */
export const drinkCount = (menu) =>
    menu.categories.filter((c) => c.kind === 'drink').reduce((sum, c) => sum + c.items.length, 0);
