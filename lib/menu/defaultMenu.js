// The menu built into the app — the editable half of the catalog, as plain
// data. It is used until a saved menu loads, and whenever none can be loaded.
//
// This is exactly the shape stored in Supabase `menu_config.config` and edited
// on /menu, so it must stay JSON: no functions, no class names. Behaviour that
// is code (colours, prep flows, station screens, conditional add-ons) lives in
// CATEGORY_BEHAVIOURS in catalog.js, keyed by the same `key`.
//
// `key` is persisted as an order row's `type` and never changes once created;
// `label` is only what staff see. The iPad's built-in copy is
// MoonTea/MoonTea/Config/DefaultMenu.swift — keep the two in sync.

/**
 * @typedef {{ value: string, price: number }} MenuOption
 * @typedef {{ key: string, label: string, role: 'name'|'modifier', options: MenuOption[] }} MenuOptionGroup
 * @typedef {{ key: string, label: string, price: number, visible: boolean,
 *             optionGroups: MenuOptionGroup[] }} MenuCategoryConfig
 * @typedef {{ categories: MenuCategoryConfig[] }} MenuConfig
 */

/** Flat-priced options: every choice adds nothing to the category price. */
const free = (...values) => values.map((value) => ({ value, price: 0 }));

/** @type {MenuConfig} */
export const DEFAULT_MENU_CONFIG = Object.freeze({
    categories: [
        {
            key: 'Corndog',
            label: 'Corndog',
            price: 8.0,
            visible: true,
            optionGroups: [
                { key: 'inside', label: 'Inside', role: 'name', options: free('Cheese', 'Half-Half') },
                { key: 'outside', label: 'Outside', role: 'name', options: free('Potato', 'Hot Cheeto', 'Original') },
            ],
        },
        {
            key: 'Boba',
            label: 'Boba',
            price: 8.0,
            visible: true,
            optionGroups: [
                {
                    key: 'drink',
                    label: 'Drink',
                    role: 'name',
                    options: free(
                        'Brown Sugar',
                        'Matcha Brown Sugar',
                        'Golden Taro',
                        'Korean Strawberry',
                        'Tropical',
                        'Strawberry',
                        'Cafe',
                        'Matcha Strawberry',
                    ),
                },
                {
                    key: 'boba',
                    label: 'Boba',
                    role: 'modifier',
                    options: free('Tapioca', 'Mango Popping', 'Strawberry Popping', 'Nothing'),
                },
            ],
        },
        // Cookie and Lemonade put their choice in a MODIFIER group, not a name
        // group, so a line reads "Cookie (3 for $14)". Naming a line after the
        // choice alone would collide with a same-named item in another
        // category, and the sales summary groups by name.
        //
        // Every cookie is the same, so the only choice is how many, and the
        // pack carries the price rather than the category.
        {
            key: 'Cookie',
            label: 'Cookie',
            price: 0,
            visible: true,
            optionGroups: [
                {
                    key: 'pack',
                    label: 'Pack',
                    role: 'modifier',
                    options: [
                        { value: '1 for $5', price: 5.0 },
                        { value: '3 for $14', price: 14.0 },
                        { value: '5 for $23', price: 23.0 },
                    ],
                },
            ],
        },
        {
            key: 'Lemonade',
            label: 'Lemonade',
            price: 7.0,
            visible: true,
            optionGroups: [
                { key: 'base', label: 'Flavor', role: 'modifier', options: free('Tea', 'Soda') },
            ],
        },
        // No option groups at all: a fixed 4-piece portion, added straight
        // away and named after the category.
        { key: 'Egg Roll', label: 'Egg Roll', price: 7.0, visible: true, optionGroups: [] },
        { key: 'Spiro Papa', label: 'Spiro Papa', price: 6.0, visible: true, optionGroups: [] },
        // The price lives on the options: a water is $1, a soda $2, a flan $5.
        // "Side (Soda)" stays distinct from the Lemonade flavour "Lemonade (Soda)".
        {
            key: 'Side',
            label: 'Side',
            price: 0,
            visible: true,
            optionGroups: [
                {
                    key: 'item',
                    label: 'Side',
                    role: 'modifier',
                    options: [
                        { value: 'Water', price: 1.0 },
                        { value: 'Soda', price: 2.0 },
                        { value: 'Flan', price: 5.0 },
                    ],
                },
            ],
        },
    ],
});
