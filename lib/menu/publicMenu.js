// The customer-facing menu shown at /menu, transcribed from the store's printed
// Canva menu ("MATCHA STRAWBERRY" design, two pages: drinks, then food).
//
// This is the STORE's full menu, which differs from the pop-up menu. It is
// display content only and deliberately separate from catalog.js, which is the
// pop-up till's menu and drives order rows (and has iPad side effects).
//
// `image` is a file in public/menu/, cropped from the printed menu. Items the
// printed menu lists without a photo have none and render as a text list.
// `signature` marks the hero item of a section.

const photo = (slug) => `/menu/${slug}.webp`;

export const TOPPING_PRICE = 0.75;

export const SUGAR_ICE_LEVELS = ['No Added', 'Less', 'Regular', 'Extra'];

export const DRINK_SECTIONS = [
    {
        id: 'milk-tea',
        title: 'Milk Tea',
        blurb: 'Creamy classics and house favourites.',
        items: [
            { name: 'The Moon Tea', image: photo('the-moon-tea'), signature: true, note: 'Our signature' },
            { name: 'Matcha Brown Sugar', image: photo('matcha-brown-sugar') },
            { name: 'Matcha Strawberry', image: photo('matcha-strawberry') },
            { name: 'Korean Strawberry', image: photo('korean-strawberry') },
            { name: 'Taro Island', image: photo('taro-island') },
            { name: 'Golden Taro', image: photo('golden-taro') },
            { name: 'Taro Ube', image: photo('taro-ube') },
            { name: 'Coco Taro', image: photo('coco-taro') },
            { name: 'Brown Sugar', image: photo('brown-sugar-milk-tea') },
            { name: 'Double Cheese', image: photo('double-cheese') },
            { name: 'Cheese Oreo', image: photo('cheese-oreo') },
            { name: 'Tiramisu', image: photo('tiramisu') },
            { name: 'Thai Green Tea', image: photo('thai-green-tea') },
            { name: 'Thai Red Tea', image: photo('thai-red-tea') },
            { name: 'Jasmine Milk Tea', image: photo('jasmine-milk-tea') },
        ],
    },
    {
        id: 'fruit-tea',
        title: 'Fruit Tea',
        blurb: 'Bright, fruity and refreshing.',
        items: [
            { name: 'Sunset Vibe', image: photo('sunset-vibe') },
            { name: 'Tropical Fruit Tea', image: photo('tropical-fruit-tea') },
            { name: 'Hawaii Aloha', image: photo('hawaii-aloha') },
            { name: 'Purple Rain', image: photo('purple-rain') },
            { name: 'Peachy Cloud', image: photo('peachy-cloud') },
            { name: 'Island Time', image: photo('island-time') },
            { name: 'Sunny Lychee', image: photo('sunny-lychee') },
            { name: 'Passion Chill', image: photo('passion-chill') },
            { name: 'Pink Rose', image: photo('pink-rose') },
            { name: 'Orange Guava', image: photo('orange-guava') },
            { name: 'Sweet Sunshine', image: photo('sweet-sunshine') },
            ...['Strawberry', 'Peach', 'Guava', 'Pineapple', 'Lychee', 'Passion Fruit', 'Grape', 'Mango'].map(
                (fruit) => ({ name: `${fruit} Fruit Tea` })
            ),
        ],
    },
    {
        id: 'smoothie',
        title: 'Smoothie',
        blurb: 'Blended thick and icy.',
        items: [
            { name: 'Nutella Banana', image: photo('nutella-banana') },
            { name: 'Pecona', image: photo('pecona'), note: 'Peanut butter with coconut and banana' },
            { name: 'Biscoff', image: photo('biscoff') },
            { name: 'Cookie & Cream', image: photo('cookie-cream') },
            { name: 'Cocomango', image: photo('cocomango') },
            { name: 'Mangonada', image: photo('mangonada') },
            { name: 'Brown Sugar', image: photo('brown-sugar-smoothie') },
            { name: 'Lychee Strawberry', image: photo('lychee-strawberry') },
            { name: 'Coconut Strawberry', image: photo('coconut-strawberry') },
            { name: 'Snow Strawberry', image: photo('snow-strawberry') },
            { name: 'Thai Coconut', image: photo('thai-coconut') },
            { name: 'Thai Oreo', image: photo('thai-oreo') },
            { name: 'Taro', image: photo('taro-smoothie') },
            { name: 'Honeydew', image: photo('honeydew') },
        ],
    },
    {
        id: 'coffee',
        title: 'Coffee',
        blurb: 'Strong, smooth, and a little sweet.',
        items: [
            { name: 'Crème Brûlée Coffee', image: photo('creme-brulee-coffee') },
            { name: 'Vietnamese Coffee', image: photo('vietnamese-coffee') },
            { name: 'Matcha Coffee' },
            { name: 'Ube Coffee' },
            { name: 'Vietnamese Egg Coffee' },
            { name: 'Coco Coffee' },
            { name: 'Peanut Butter Coffee' },
        ],
    },
    {
        id: 'matcha',
        title: 'Matcha',
        blurb: 'Stone-ground green tea, done many ways.',
        items: [
            { name: 'Matcha Cheese Foam', image: photo('matcha-cheese-foam') },
            { name: 'Floral Matcha', image: photo('floral-matcha') },
            { name: 'Double Matcha' },
            { name: 'Matcha Mango' },
            { name: 'Matcha Taro' },
            { name: 'Coco Matcha' },
            { name: 'Banana Matcha' },
        ],
    },
];

export const TOPPINGS = [
    'Tapioca', 'Crystal Boba', 'Egg Pudding', 'Egg Foam',
    'Kiwi Popping', 'Lychee Popping', 'Mango Popping', 'Strawberry Popping',
    'Blueberry Popping', 'Peach Popping',
    'Lychee Jelly', 'Rainbow Jelly', 'Coconut Jelly', 'Grass Jelly',
    'Cheese Foam', 'Taro Foam', 'Matcha Foam', 'House Foam',
];

export const CORNDOG = {
    inside: [
        { name: 'Sausage', image: photo('corndog-sausage') },
        { name: 'Half & Half', image: photo('corndog-half-half') },
        { name: 'Cheese', image: photo('corndog-cheese') },
    ],
    outside: [
        { name: 'Hot Cheeto', image: photo('corndog-hot-cheeto') },
        { name: 'Potato', image: photo('corndog-potato') },
        { name: 'Original', image: photo('corndog-original') },
        { name: 'Corn Flakes', image: photo('corndog-corn-flakes') },
        { name: 'Fruity Cereal', image: photo('corndog-fruity-cereal') },
        { name: 'Ramen', image: photo('corndog-ramen') },
    ],
};

export const BULDAK_ELOTE = {
    image: photo('buldak-elote'),
    toppings: ['Carbonara Buldak', 'Nacho Cheese', 'Corn', 'Cotija Cheese', 'Hot Cheeto'],
};

export const SNACKS = [
    { name: 'Popcorn Chicken', image: photo('popcorn-chicken'), seasonings: ['Salt & Pepper', 'Korean Spicy'] },
    { name: 'Onion Ring', image: photo('onion-ring'), seasonings: [] },
    { name: 'Tornado Fry', image: photo('tornado-fry'), seasonings: ['Parmesan', 'Cheddar', 'Cajun'] },
    { name: 'French Fry', image: photo('french-fry'), seasonings: ['Parmesan', 'Cheddar', 'Cajun'] },
];

/** Every section the page's jump-nav links to, in page order. */
export const NAV_SECTIONS = [
    ...DRINK_SECTIONS.map(({ id, title }) => ({ id, title })),
    { id: 'toppings', title: 'Toppings' },
    { id: 'corndog', title: 'Corndog' },
    { id: 'snacks', title: 'Snacks' },
];
