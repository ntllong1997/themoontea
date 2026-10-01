// The customer-facing menu shown at /menu, transcribed from the shop's printed
// Canva menu ("MATCHA STRAWBERRY" design, two pages: drinks, then food).
//
// This is the STORE's full menu, which differs from the pop-up menu. It is
// display content only and deliberately separate from catalog.js, which is the
// pop-up till's menu and drives order rows (and has iPad side effects).
//
// `tint` is the drink's colour, used to paint its little cup on the page.
// `signature` marks the hero item of a section.

export const TOPPING_PRICE = 0.75;

export const SUGAR_ICE_LEVELS = ['No Added', 'Less', 'Regular', 'Extra'];

export const DRINK_SECTIONS = [
    {
        id: 'milk-tea',
        title: 'Milk Tea',
        blurb: 'Creamy classics and house favourites.',
        items: [
            { name: 'The Moon Tea', tint: '#8a5a3c', signature: true, note: 'Our signature' },
            { name: 'Brown Sugar', tint: '#a0673f' },
            { name: 'Matcha Brown Sugar', tint: '#7fa65a' },
            { name: 'Matcha Strawberry', tint: '#9cc46d' },
            { name: 'Korean Strawberry', tint: '#f08aa0' },
            { name: 'Taro Island', tint: '#a78bd4' },
            { name: 'Golden Taro', tint: '#b79be0' },
            { name: 'Taro Ube', tint: '#8e6cc9' },
            { name: 'Coco Taro', tint: '#c3b0e6' },
            { name: 'Double Cheese', tint: '#d9b38c' },
            { name: 'Cheese Oreo', tint: '#7d7470' },
            { name: 'Tiramisu', tint: '#9b7356' },
            { name: 'Thai Green Tea', tint: '#8fc79a' },
            { name: 'Thai Red Tea', tint: '#e98b4f' },
            { name: 'Jasmine Milk Tea', tint: '#e2cfae' },
        ],
    },
    {
        id: 'fruit-tea',
        title: 'Fruit Tea',
        blurb: 'Bright, fruity and refreshing.',
        items: [
            { name: 'Sunset Vibe', tint: '#f2994a', signature: true, note: 'Crowd favourite' },
            { name: 'Tropical Fruit Tea', tint: '#f7b733' },
            { name: 'Hawaii Aloha', tint: '#f4a259' },
            { name: 'Purple Rain', tint: '#8e5bd1' },
            { name: 'Peachy Cloud', tint: '#f7a8a0' },
            { name: 'Island Time', tint: '#f6c445' },
            { name: 'Sunny Lychee', tint: '#f3d36b' },
            { name: 'Passion Chill', tint: '#f0a830' },
            { name: 'Pink Rose', tint: '#f28db2' },
            { name: 'Orange Guava', tint: '#f58a4b' },
            { name: 'Sweet Sunshine', tint: '#f9c74f' },
        ],
        extras: {
            title: 'Classic fruit teas',
            items: [
                'Strawberry', 'Peach', 'Guava', 'Pineapple',
                'Lychee', 'Passion Fruit', 'Grape', 'Mango',
            ].map((fruit) => `${fruit} Fruit Tea`),
        },
    },
    {
        id: 'smoothie',
        title: 'Smoothie',
        blurb: 'Blended thick and icy.',
        items: [
            { name: 'Nutella Banana', tint: '#8b5e3c' },
            { name: 'Pecona', tint: '#c89f6a', note: 'Peanut butter with coconut and banana' },
            { name: 'Biscoff', tint: '#b9814f' },
            { name: 'Cookie & Cream', tint: '#6f6a68' },
            { name: 'Cocomango', tint: '#f6b93b' },
            { name: 'Mangonada', tint: '#ef7d39' },
            { name: 'Brown Sugar', tint: '#a0673f' },
            { name: 'Lychee Strawberry', tint: '#f49cb0' },
            { name: 'Coconut Strawberry', tint: '#f6b6c4' },
            { name: 'Snow Strawberry', tint: '#f7c5cf' },
            { name: 'Thai Coconut', tint: '#9fd3a5' },
            { name: 'Thai Oreo', tint: '#e9a272' },
            { name: 'Taro', tint: '#a78bd4' },
            { name: 'Honeydew', tint: '#a8dcc4' },
        ],
    },
    {
        id: 'coffee',
        title: 'Coffee',
        blurb: 'Strong, smooth, and a little sweet.',
        items: [
            { name: 'Crème Brûlée Coffee', tint: '#c48a4a', signature: true },
            { name: 'Vietnamese Coffee', tint: '#6b4430', signature: true },
            { name: 'Matcha Coffee', tint: '#7fa65a' },
            { name: 'Ube Coffee', tint: '#8e6cc9' },
            { name: 'Vietnamese Egg Coffee', tint: '#d8a55a' },
            { name: 'Coco Coffee', tint: '#b89a7a' },
            { name: 'Peanut Butter Coffee', tint: '#b07a45' },
        ],
    },
    {
        id: 'matcha',
        title: 'Matcha',
        blurb: 'Stone-ground green tea, done many ways.',
        items: [
            { name: 'Matcha Cheese Foam', tint: '#7fae5c', signature: true },
            { name: 'Floral Matcha', tint: '#9cc46d', signature: true },
            { name: 'Double Matcha', tint: '#5e8f3e' },
            { name: 'Matcha Mango', tint: '#c2c84a' },
            { name: 'Matcha Taro', tint: '#9a93c4' },
            { name: 'Coco Matcha', tint: '#a9c98f' },
            { name: 'Banana Matcha', tint: '#d5d06a' },
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
    inside: ['Sausage', 'Half & Half', 'Cheese'],
    outside: [
        { name: 'Original', tint: '#d99a4e' },
        { name: 'Potato', tint: '#e7b54a' },
        { name: 'Hot Cheeto', tint: '#d9412b' },
        { name: 'Corn Flakes', tint: '#e8b04f' },
        { name: 'Fruity Cereal', tint: '#e46fa8' },
        { name: 'Ramen', tint: '#d9a35a' },
    ],
};

export const BULDAK_ELOTE = ['Carbonara Buldak', 'Nacho Cheese', 'Corn', 'Cotija Cheese', 'Hot Cheeto'];

export const SNACKS = [
    { name: 'Popcorn Chicken', seasonings: ['Salt & Pepper', 'Korean Spicy'] },
    { name: 'Onion Ring', seasonings: [] },
    { name: 'Tornado Fry', seasonings: ['Parmesan', 'Cheddar', 'Cajun'] },
    { name: 'French Fry', seasonings: ['Parmesan', 'Cheddar', 'Cajun'] },
];

/** Every section the page's jump-nav links to, in page order. */
export const NAV_SECTIONS = [
    ...DRINK_SECTIONS.map(({ id, title }) => ({ id, title })),
    { id: 'toppings', title: 'Toppings' },
    { id: 'corndog', title: 'Corndog' },
    { id: 'snacks', title: 'Snacks' },
];
