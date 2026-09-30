// What customers see on the public menu page (/menu).
//
// ── Adding an item ──────────────────────────────────────────────────────────
// 1. Drop a photo into public/menu/ (a tall ~3:4 photo suits drinks; any
//    shape works — it is shown whole, never cropped).
// 2. Copy one of the `{ name, description, image }` blocks below into the
//    right section and edit it. Leave `image` out and the card shows the
//    section's emoji instead, so an item can go up before its photo does.
// 3. Optional: `tags: ['New']`, `['Best seller']`, `['Caffeine-free']`…
//    any short words — each renders as a little pill on the card.
//
// A whole new section is one more entry in MENU_SECTIONS. `navLabel` is the
// short name on the phone tab bar (defaults to `title`).
//
// Prices are read from the till's catalog (lib/menu/catalog.js), so a price
// change made there shows up here automatically. An item with no catalog
// price can set `price: '$5'` directly instead.
//
// Relative imports so `node --test` can load this without the "@/" alias.
import { categoryFor, optionPrice, optionValue, priceLabelFor } from '../menu/catalog.js';

const money = (value) => `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;

/** A catalog category's price as shown to customers, e.g. "$8". */
const catalogPrice = (key) => priceLabelFor(categoryFor(key)).replace(/\.00/g, '');

/** The price of one priced option inside a catalog category (a Flan side). */
const catalogOptionPrice = (key, value) => {
    const option = categoryFor(key)
        .optionGroups.flatMap((group) => group.options)
        .find((o) => optionValue(o) === value);
    return money(optionPrice(option));
};

/** The option names the till offers for one of a category's option groups. */
export const catalogOptions = (key, groupKey) =>
    categoryFor(key).optionGroups.find((group) => group.key === groupKey).options.map(optionValue);

export const MENU_SECTIONS = [
    {
        id: 'corndogs',
        eyebrow: 'Korean',
        title: 'Corndogs',
        navLabel: 'Corndogs',
        emoji: '🌭',
        blurb: 'Fried to order, golden and crunchy outside, with a stretchy cheese pull inside. Build yours in two steps.',
        price: catalogPrice('Corndog'),
        items: [
            {
                name: 'Korean Corndog',
                description:
                    'A crispy Korean-style corndog on a stick, finished with a zig-zag of sauces. Pick what goes inside, then pick the coating.',
                image: '/menu/korean-corndog.jpg',
                tags: ['Made to order'],
            },
        ],
        // Checked against the till's corndog options in lib/site/menu.test.js,
        // so the site can never offer a filling the till cannot ring up.
        choices: [
            {
                step: 'Choose inside',
                options: [
                    { name: 'Cheese', description: 'All mozzarella. The famous cheese pull.' },
                    { name: 'Half-Half', description: 'Half mozzarella, half savory sausage.' },
                ],
            },
            {
                step: 'Choose outside',
                options: [
                    { name: 'Potato', description: 'Crunchy potato cubes. Add Hot Cheeto dust for +$1.' },
                    { name: 'Hot Cheeto', description: 'Crushed Hot Cheetos for spicy crunch.' },
                    { name: 'Original', description: 'The classic golden, crispy batter.' },
                ],
            },
        ],
    },
    {
        id: 'boba',
        eyebrow: 'Boba',
        title: 'Milk Tea & Fruit Tea',
        navLabel: 'Boba',
        emoji: '🧋',
        blurb: 'Every drink is handcrafted to order. Pick your drink, then pick your boba.',
        price: catalogPrice('Boba'),
        toppings: catalogOptions('Boba', 'boba'),
        items: [
            {
                name: 'Brown Sugar Boba Tea',
                description:
                    'Our signature. Creamy milk tiger-striped with caramelized brown sugar syrup, over warm, chewy tapioca pearls.',
                image: '/menu/brown-sugar-boba.webp',
                tags: ['Best seller'],
            },
            {
                name: 'Matcha Brown Sugar',
                description:
                    'Earthy green matcha layered over creamy milk and brown sugar pearls. Sweet, toasty and a little bit grassy.',
                image: '/menu/matcha-brown-sugar.jpg',
            },
            {
                name: 'Matcha Strawberry',
                description:
                    'Strawberry purée at the bottom, cold milk in the middle, matcha on top. Stir it up to turn it pink-green. Ask for it matcha-only if you like.',
                image: '/menu/matcha-strawberry.jpg',
            },
            {
                name: 'Korean Strawberry',
                description:
                    'Korean-style strawberry milk: chunky strawberry purée swirled into chilled fresh milk. Fruity and creamy.',
                image: '/menu/korean-strawberry.webp',
                tags: ['Caffeine-free'],
            },
            {
                name: 'Golden Taro',
                description:
                    'Velvety purple taro milk over a golden sweet base. Nutty, vanilla-like and smooth. Ask for it taro-only if you like.',
                image: '/menu/golden-taro.jpg',
            },
            {
                name: 'Tropical Fruit Tea',
                description:
                    'A bright, refreshing fruit tea loaded with sliced citrus and tropical fruit. Sunshine in a cup.',
                image: '/menu/tropical-fruit-tea.webp',
            },
            {
                name: 'Strawberry Fruit Tea',
                description:
                    'Light, fruity tea shaken with real strawberry pieces. Juicy and not too sweet.',
                image: '/menu/strawberry-fruit-tea.webp',
            },
            {
                name: 'Vietnamese Coffee',
                description:
                    'Bold Vietnamese-style coffee mellowed with sweet condensed milk, served iced. Strong, smooth and rich.',
                image: '/menu/vietnamese-coffee.webp',
            },
        ],
    },
    {
        id: 'bites',
        eyebrow: 'More',
        title: 'Bites & Sweets',
        navLabel: 'Bites',
        emoji: '🥠',
        blurb: 'Snacks to share, and something sweet for later.',
        items: [
            {
                name: 'Egg Rolls',
                description: 'Four golden, crackly egg rolls with a savory filling. Perfect for sharing.',
                price: catalogPrice('Egg Roll'),
                emoji: '🥢',
            },
            {
                name: 'Spiro Papa',
                description: 'A whole potato spiral-cut onto a skewer, fried crisp and seasoned.',
                price: catalogPrice('Spiro Papa'),
                emoji: '🥔',
            },
            {
                name: 'Cookies',
                description: 'Freshly baked cookies. Grab one, or a pack of 3 ($14) or 5 ($23) to share.',
                price: catalogPrice('Cookie'),
                emoji: '🍪',
            },
            {
                name: 'Flan',
                description: 'Silky caramel custard, cool and creamy.',
                price: catalogOptionPrice('Side', 'Flan'),
                emoji: '🍮',
            },
            {
                name: 'Lemonade',
                description: 'House lemonade, made with tea or topped with fizzy soda. Your pick.',
                price: catalogPrice('Lemonade'),
                emoji: '🍋',
            },
            {
                name: 'Water & Soda',
                description: `Water ${catalogOptionPrice('Side', 'Water')}, soda ${catalogOptionPrice('Side', 'Soda')}.`,
                price: catalogPrice('Side').split(' – ')[0],
                priceNote: 'from',
                emoji: '🥤',
            },
        ],
    },
];
