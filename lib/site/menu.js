// The customer menu site (/menu): section layout, and how items are grouped
// and priced for display.
//
// The items themselves live in the Supabase table `site_menu_items` and are
// managed by staff at /admin/menu (add, edit, photo, sold out, hidden). This
// file only decides how a category LOOKS: its heading, blurb, emoji, and the
// extras a few categories carry (the corndog build steps, the boba choices).
// A category with no entry in SECTIONS still shows up, with plain defaults.
//
// Relative imports so `node --test` can load this without the "@/" alias.
import { categoryFor, optionValue } from '../menu/catalog.js';

/** The option names the till offers for one of a category's option groups. */
export const catalogOptions = (key, groupKey) =>
    categoryFor(key).optionGroups.find((group) => group.key === groupKey).options.map(optionValue);

/** Item statuses, in the order the admin page offers them. */
export const STATUSES = [
    { value: 'available', label: 'Available' },
    { value: 'sold_out', label: 'Sold out' },
    { value: 'hidden', label: 'Hidden' },
];

/**
 * Known categories, in page order. `id` is what an item's `category` column
 * holds; anything else an item names becomes its own section after these.
 */
export const SECTIONS = [
    {
        id: 'corndogs',
        eyebrow: 'Korean',
        title: 'Corndogs',
        navLabel: 'Corndogs',
        emoji: '🌭',
        blurb: 'Fried to order, golden and crunchy outside, with a stretchy cheese pull inside. Build yours in two steps.',
        // Checked against the till's corndog options in site.test.js, so the
        // site can never offer a filling the till cannot ring up.
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
                    { name: 'Potato', description: 'Crunchy potato cubes. Add Hot Cheeto dust for +$1.', image: '/menu/corndog-potato.webp' },
                    { name: 'Hot Cheeto', description: 'Crushed Hot Cheetos for spicy crunch.', image: '/menu/corndog-hot-cheeto.webp' },
                    { name: 'Original', description: 'The classic golden, crispy batter.', image: '/menu/corndog-original.webp' },
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
        toppings: catalogOptions('Boba', 'boba'),
    },
    {
        id: 'bites',
        eyebrow: 'More',
        title: 'Bites & Sweets',
        navLabel: 'Bites',
        emoji: '🥠',
        blurb: 'Snacks to share, and something sweet for later.',
    },
];

const SECTION_BY_ID = new Map(SECTIONS.map((section) => [section.id, section]));

/** What a category is called on the admin page and in headings. */
export const categoryTitle = (id) => SECTION_BY_ID.get(id)?.title ?? id;

/** '$8', '$4.50', 'from $5', or null when there is no price. */
export function formatPrice(price, note) {
    if (price === null || price === undefined || price === '') return null;
    const value = Number(price);
    const money = `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
    return note ? `${note} ${money}` : money;
}

const sectionFor = (category) =>
    SECTION_BY_ID.get(category) ?? {
        id: category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'more',
        eyebrow: 'More',
        title: category,
        navLabel: category,
        emoji: '🌙',
        blurb: '',
    };

/**
 * Database rows -> the sections the page renders, in page order, each with
 * its visible items sorted. Hidden items never make it out of here.
 *
 * When every item in a section has the same plain price, the section shows
 * it once ("$8 each") and the cards don't repeat it. A lone item keeps its
 * price on its own card.
 */
export function buildSections(rows) {
    const visible = rows
        .filter((row) => row.status !== 'hidden')
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    const byCategory = new Map();
    for (const row of visible) {
        if (!byCategory.has(row.category)) byCategory.set(row.category, []);
        byCategory.get(row.category).push(row);
    }

    const known = SECTIONS.map((s) => s.id).filter((id) => byCategory.has(id));
    const extra = [...byCategory.keys()].filter((id) => !SECTION_BY_ID.has(id));

    return [...known, ...extra].map((category) => {
        const rowsInSection = byCategory.get(category);
        const prices = new Set(rowsInSection.map((row) => formatPrice(row.price, row.price_note)));
        const [onlyPrice] = prices;
        const section = sectionFor(category);
        // "$8 each" only reads right over several items (or a build-your-own).
        const sharable = rowsInSection.length > 1 || Boolean(section.choices);
        const shared = sharable && prices.size === 1 && onlyPrice && !onlyPrice.startsWith('from') ? onlyPrice : null;
        return {
            ...section,
            price: shared,
            items: rowsInSection.map((row) => ({
                id: row.id ?? `${category}-${row.name}`,
                name: row.name,
                description: row.description,
                image: row.image_url || null,
                tags: row.tags ?? [],
                soldOut: row.status === 'sold_out',
                price: shared ? null : formatPrice(row.price, row.price_note),
            })),
        };
    });
}

/**
 * The menu as it stood when items moved into the database. The page falls
 * back to this if Supabase can't be reached, so customers never see an empty
 * menu. It is NOT kept in sync with later admin edits.
 */
export const FALLBACK_ITEMS = [
    {
        category: 'corndogs',
        name: 'Korean Corndog',
        description: 'A crispy Korean-style corndog on a stick, finished with a zig-zag of sauces. Pick what goes inside, then pick the coating.',
        price: 8,
        price_note: null,
        image_url: '/menu/korean-corndog.webp',
        status: 'available',
        tags: ['Made to order'],
        sort_order: 10,
    },
    {
        category: 'boba',
        name: 'Brown Sugar Boba Tea',
        description: 'Our signature. Creamy milk tiger-striped with caramelized brown sugar syrup, over warm, chewy tapioca pearls.',
        price: 8,
        price_note: null,
        image_url: '/menu/brown-sugar-boba.webp',
        status: 'available',
        tags: ['Best seller'],
        sort_order: 20,
    },
    {
        category: 'boba',
        name: 'Matcha Brown Sugar',
        description: 'Earthy green matcha layered over creamy milk and brown sugar pearls. Sweet, toasty and a little bit grassy.',
        price: 8,
        price_note: null,
        image_url: '/menu/matcha-brown-sugar.webp',
        status: 'available',
        tags: [],
        sort_order: 30,
    },
    {
        category: 'boba',
        name: 'Matcha Strawberry',
        description: 'Strawberry purée at the bottom, cold milk in the middle, matcha on top. Stir it up to turn it pink-green. Ask for it matcha-only if you like.',
        price: 8,
        price_note: null,
        image_url: '/menu/matcha-strawberry.webp',
        status: 'available',
        tags: [],
        sort_order: 40,
    },
    {
        category: 'boba',
        name: 'Korean Strawberry',
        description: 'Korean-style strawberry milk: chunky strawberry purée swirled into chilled fresh milk. Fruity and creamy.',
        price: 8,
        price_note: null,
        image_url: '/menu/korean-strawberry.webp',
        status: 'available',
        tags: ['Caffeine-free'],
        sort_order: 50,
    },
    {
        category: 'boba',
        name: 'Golden Taro',
        description: 'Velvety purple taro milk over a golden sweet base. Nutty, vanilla-like and smooth. Ask for it taro-only if you like.',
        price: 8,
        price_note: null,
        image_url: '/menu/golden-taro.webp',
        status: 'available',
        tags: [],
        sort_order: 60,
    },
    {
        category: 'boba',
        name: 'Tropical Fruit Tea',
        description: 'A bright, refreshing fruit tea loaded with sliced citrus and tropical fruit. Sunshine in a cup.',
        price: 8,
        price_note: null,
        image_url: '/menu/tropical-fruit-tea.webp',
        status: 'available',
        tags: [],
        sort_order: 70,
    },
    {
        category: 'boba',
        name: 'Strawberry Fruit Tea',
        description: 'Light, fruity tea shaken with real strawberry pieces. Juicy and not too sweet.',
        price: 8,
        price_note: null,
        image_url: '/menu/strawberry-fruit-tea.webp',
        status: 'available',
        tags: [],
        sort_order: 80,
    },
    {
        category: 'boba',
        name: 'Vietnamese Coffee',
        description: 'Bold Vietnamese-style coffee mellowed with sweet condensed milk, served iced. Strong, smooth and rich.',
        price: 8,
        price_note: null,
        image_url: '/menu/vietnamese-coffee.webp',
        status: 'available',
        tags: [],
        sort_order: 90,
    },
    {
        category: 'bites',
        name: 'Egg Rolls',
        description: 'Four golden, crackly egg rolls with a savory filling. Perfect for sharing.',
        price: 7,
        price_note: null,
        image_url: null,
        status: 'hidden',
        tags: [],
        sort_order: 100,
    },
    {
        category: 'bites',
        name: 'Spiro Papa',
        description: 'A whole potato spiral-cut onto a skewer, fried crisp and seasoned.',
        price: 6,
        price_note: null,
        image_url: null,
        status: 'hidden',
        tags: [],
        sort_order: 110,
    },
    {
        category: 'bites',
        name: 'Cookies',
        description: 'Freshly baked cookies. Grab one, or a pack of 3 ($14) or 5 ($23) to share.',
        price: 5,
        price_note: 'from',
        image_url: null,
        status: 'hidden',
        tags: [],
        sort_order: 120,
    },
    {
        category: 'bites',
        name: 'Flan',
        description: 'Silky caramel custard, cool and creamy.',
        price: 5,
        price_note: null,
        image_url: null,
        status: 'hidden',
        tags: [],
        sort_order: 130,
    },
    {
        category: 'bites',
        name: 'Lemonade',
        description: 'House lemonade, made with tea or topped with fizzy soda. Your pick.',
        price: 7,
        price_note: null,
        image_url: null,
        status: 'hidden',
        tags: [],
        sort_order: 140,
    },
    {
        category: 'bites',
        name: 'Water & Soda',
        description: 'Water $1, soda $2.',
        price: 1,
        price_note: 'from',
        image_url: null,
        status: 'hidden',
        tags: [],
        sort_order: 150,
    },
];
