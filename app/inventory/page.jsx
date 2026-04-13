'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    getInventoryGroups, saveInventoryGroups,
    getParLevels, saveParLevel,
    getRestockLevels, saveRestockLevel,
    getInventorySubmissions, saveInventorySubmission,
    deleteInventorySubmission, clearInventorySubmissions,
    getPrices, savePrice,
    getLocations, saveLocation,
    getCaseSizes, saveCaseSize,
    getDailyCheckItems, saveDailyCheckItem,
} from '@/lib/inventoryDb';
import {
    getEmployees, verifyPin,
    createEmployee, updateEmployeePin, deleteEmployee,
} from '@/lib/employeesDb';

// ─── Default data ────────────────────────────────────────────────────────────

const DEFAULT_ITEMS = [
    {
        category: 'Cleaning Supplies',
        items: [
            'Poly Bags', 'T-shirt Bags', 'Gloves (LG / MD)', 'Degreaser 1 Gal',
            'Dish Soap', 'Scrub Daddy', '33-Gallon Trash Bag',
            '13-Gallon Kitchen Trash Bag', 'Lysol Disinfecting Wipes', 'Hand Soap',
        ],
    },
    {
        category: 'Dairy & Creamers',
        items: [
            'Whole Milk', 'Eggs', 'Sweetened Condensed Milk 14oz',
            'Milk Evaporated 12oz', 'Heavy Cream (if purchased)',
            'Sweetened Condensed Milk', 'Almond Milk', 'Oat Milk',
        ],
    },
    {
        category: 'Drinks',
        items: ['Drinking Water', 'Coke', 'Diet Coke', 'Spirte', 'Sugar Free Dr Pepper'],
    },
    {
        category: 'Dry Ingredients',
        items: [
            'All purpose flour', 'KIKO Bread Crumbs', 'Yeast Instant Dry',
            'Cornstarch 3 lbs', 'Sugar Gran Nat 50#', 'Kosher Salt', 'Tajin',
            'Samyang Buldak Ramen Carbonara', 'Organic Brown Sugar',
        ],
    },
    {
        category: 'Fruits & Produce',
        items: [
            'Bananas', 'Strawberries', 'Pineapple', 'Lemons', 'Limes', 'Oranges',
            'Apples', 'Cantaloupe', 'Onions', 'Corn', 'Mango Chunk (IQF)',
            'Mango Dice (IQF)', 'Lemons 3 lb', 'Limes 3 lb', 'Garlic (bulk bag)',
            'Organic Coconut Water', 'Seedless Watermelon', 'Sliced Peaches',
            'Pure Vanilla Extract',
            'Lotus Biscoff Creamy Cookie Butter Spread Pail 6.6 lb.',
            'Lotus Biscoff Cookies 8.8 oz. - 10/Case',
        ],
    },
    {
        category: 'Meat & Cheese',
        items: [
            'Cotija cheese', 'Chicken breast (bulk)', 'Mascarpone 1 lb',
            'Mozzarella Bulk (~49lb)', 'Nacho Cheese Sauce', 'KS HOT DOGS',
            'Laughing Cow Light Wedges', 'Kraft Grated Parmesan Cheese',
        ],
    },
    {
        category: 'Packaging',
        items: [
            'Cup', 'PP Sealing Film – Good Time Printed', 'Gallon Plus Freezer Bags',
            '6 1/2" x 2 1/2" x 2 1/4" White Paper Hot Dog Clamshell Container - 500/Case',
            "Lavex 2-Ply White Center Pull Paper Towel 500' Roll - 6/Case",
            'Choice Clear PET Customizable Plastic Cold Cup - 24 oz. - 600/Case',
            'Choice 9 oz. 12 oz. 16 oz. 20 oz. 24 oz. Clear PET Dome Lid with 2" Hole - 1 000/Case',
            'Choice Black Plastic Souffle Cup / Portion Cup - 2 oz. - 2 500/Case',
            'Choice PET Plastic Lid for 1.5 to 2.5 oz. Souffle Cup / Portion Cup - 2 500/Case',
            'Fast Take Tamper-Evident Clear HDPE 2 Drink Beverage Carrier - 1 000/Case',
            'Choice 12" x 12" Natural Kraft Customizable Basket Liner / Deli Wrap - 5 000/Case',
            'Carnival King #200 2 lb. Cornerstone Paper Food Tray - 1 000/Case',
            'Choice Kraft Microwavable Folded Paper #8 Take-Out Customizable Container 6" x 4 3/4" x 2 1/2" - 300/Case',
            'Dixie Ultra White 2-Ply Interfold Paper Dispenser Napkin - 6 000/Case',
            '[1,600 ct] Boba Straws | Diagonal Cut | Individually Wrapped | Black (0.39" x 9")',
            '[1,000 ct] Plastic Dome Cup Lids | PET | 90 mm',
        ],
    },
    {
        category: 'Sauces & Condiments',
        items: [
            'Garlic Powder 5#', 'Onion Powder 5#', 'OIL CLEAR SOY', 'Honey Hot Sauce',
            'Sriracha', 'Heinz Ketchup (3/44oz)', "Hellmann's Mayo (1 gal)",
            'Nutella Tub 6.6#', 'Hershey Syrup (Jug)', 'Chamoy', 'Pink Salt',
        ],
    },
    {
        category: 'Snacks & Desserts',
        items: [
            'French Fry 3/8 Big C', 'Onion Ring', 'Oreo 2.5#', 'OREO',
            'Jif Creamy Peanut Butter', 'Shin Black', 'Shin Ramyun Noodles',
        ],
    },
    {
        category: 'Syrups',
        items: [
            'Strawberry Syrup', 'Mango Syrup', 'Rose Syrup', 'Passionfruit Syrup',
            'Peach Syrup', 'Lychee Syrup', 'Honeydew Syrup', 'Pineapple Syrup',
            'Lemon Syrup', 'Red Guava Syrup', 'Grape Syrup', 'Kumquat Syrup',
            'Kiwi Syrup', 'Banana Syrup', 'Strawberry Jam', 'Mango Jam',
            'Passion Fruit Jam', 'Torani Vanilla', 'Dark Brown Sugar',
            'Strawberry Syrup, 64oz', 'Tropical Syrup, 64oz',
        ],
    },
    {
        category: 'Tea & Powders',
        items: [
            'Thai Green Tea (Thumb up brand)', 'Premium Thai Tea Mix (Cha Tra Mue)',
            'Jade Leaf Culinary Matcha Powder 1 lb. (454g) - 6/Case',
            'Taro Powder | Made in USA | 2.2 lbs', 'Non-Dairy Creamer', 'Black Tea',
            'Jasmine Green Tea', 'Milk Tea', 'Honeydew', 'Coconut', 'Egg Pudding',
        ],
    },
    {
        category: 'Toppings (Boba / Jelly)',
        items: [
            'Rainbow Jelly – BT', 'Lychee Jelly', 'Coconut Jelly', 'Coffee Jelly',
            'Brown Sugar Agar Jelly', 'Crystal Boba', 'Strawberry', 'Mango',
            'Blueberry', 'Lychee', 'Kiwi', 'Peach', 'Tapioca Pearls (Chewy)',
        ],
    },
];

// ─── Constants ───────────────────────────────────────────────────────────────

const WEBHOOK_URL = process.env.NEXT_PUBLIC_INVENTORY_WEBHOOK_URL || '';
const DRAFT_KEY        = 'inventory_draft';
const UNITS_KEY        = 'inventory_units';
const UNIT_TYPES_KEY   = 'inventory_unit_types';
const LAST_COUNTS_KEY  = 'inventory_last_counts';
const DEFAULT_UNIT_TYPES = ['bottles', 'cans', 'bags', 'boxes', 'cases', 'kg', 'lbs', 'oz', 'liters', 'gallons', 'pcs', 'trays'];
const DEFAULT_STORE_NAMES = ['Bossen', 'HEB', 'Restaurant Depot', 'Costco', 'Webstaurant', 'Lollicup Store', "Sam's Club", 'Amazon'];

const DEFAULT_PRICES = {
    // Bossen
    'Strawberry Syrup': 12.50, 'Mango Syrup': 12.50, 'Rose Syrup': 14.75,
    'Passionfruit Syrup': 12.50, 'Peach Syrup': 12.50, 'Lychee Syrup': 12.50,
    'Honeydew Syrup': 12.50, 'Pineapple Syrup': 12.50, 'Lemon Syrup': 12.50,
    'Red Guava Syrup': 13.50, 'Grape Syrup': 13.50, 'Kumquat Syrup': 13.50,
    'Kiwi Syrup': 13.50, 'Banana Syrup': 12.50,
    'Strawberry Jam': 21.75, 'Mango Jam': 24.00, 'Passion Fruit Jam': 21.75,
    'Rainbow Jelly – BT': 16.25, 'Lychee Jelly': 16.25, 'Coconut Jelly': 16.25,
    'Coffee Jelly': 19.25, 'Brown Sugar Agar Jelly': 18.75,
    'Strawberry': 18.00, 'Mango': 18.00, 'Blueberry': 18.00,
    'Lychee': 18.00, 'Kiwi': 18.00, 'Peach': 18.00,
    'PP Sealing Film – Good Time Printed': 43.50,
    'Thai Green Tea (Thumb up brand)': 6.00, 'Premium Thai Tea Mix (Cha Tra Mue)': 6.50,
    // HEB
    'Whole Milk': 3.50, 'Eggs': 3.97, 'Bananas': 0.50, 'Strawberries': 4.00,
    'Pineapple': 5.00, 'Lemons': 5.00, 'Limes': 5.00, 'Oranges': 4.00,
    'Apples': 2.52, 'Cantaloupe': 2.97, 'Onions': 0.67, 'Corn': 1.48,
    'Cotija cheese': 3.89, 'Chicken breast (bulk)': 2.00, 'All purpose flour': 3.68,
    // Restaurant Depot
    'Mango Chunk (IQF)': 18.50, 'Mango Dice (IQF)': 23.00,
    'Sweetened Condensed Milk 14oz': 40.00, 'Milk Evaporated 12oz': 28.00,
    'Mascarpone 1 lb': 25.00, 'Mozzarella Bulk (~49lb)': 100.00,
    'French Fry 3/8 Big C': 32.00, 'Onion Ring': 26.00,
    'KIKO Bread Crumbs': 26.00, 'Nacho Cheese Sauce': 30.00,
    'Yeast Instant Dry': 5.27, 'Cornstarch 3 lbs': 31.00,
    'Garlic Powder 5#': 25.00, 'Onion Powder 5#': 25.00, 'OIL CLEAR SOY': 29.00,
    'Sugar Gran Nat 50#': 30.00, 'Kosher Salt': 6.00,
    'Honey Hot Sauce': 25.00, 'Sriracha': 37.00,
    'Heinz Ketchup (3/44oz)': 11.00, "Hellmann's Mayo (1 gal)": 20.00,
    'Nutella Tub 6.6#': 52.00, 'Oreo 2.5#': 14.50,
    'Hershey Syrup (Jug)': 15.00, 'Chamoy': 9.00, 'Tajin': 10.00,
    'Poly Bags': 18.00, 'T-shirt Bags': 22.00, 'Gloves (LG / MD)': 28.00,
    'Degreaser 1 Gal': 20.00,
    // Costco
    'Heavy Cream (if purchased)': 3.49, 'KS HOT DOGS': 19.99,
    // Webstaurant
    '6 1/2" x 2 1/2" x 2 1/4" White Paper Hot Dog Clamshell Container - 500/Case': 72.99,
    "Lavex 2-Ply White Center Pull Paper Towel 500' Roll - 6/Case": 32.99,
    'Choice Clear PET Customizable Plastic Cold Cup - 24 oz. - 600/Case': 43.49,
    'Choice 9 oz. 12 oz. 16 oz. 20 oz. 24 oz. Clear PET Dome Lid with 2" Hole - 1 000/Case': 33.99,
    'Choice Black Plastic Souffle Cup / Portion Cup - 2 oz. - 2 500/Case': 21.49,
    'Choice PET Plastic Lid for 1.5 to 2.5 oz. Souffle Cup / Portion Cup - 2 500/Case': 16.99,
    'Fast Take Tamper-Evident Clear HDPE 2 Drink Beverage Carrier - 1 000/Case': 122.49,
    'Choice 12" x 12" Natural Kraft Customizable Basket Liner / Deli Wrap - 5 000/Case': 79.99,
    'Carnival King #200 2 lb. Cornerstone Paper Food Tray - 1 000/Case': 36.79,
    'Choice Kraft Microwavable Folded Paper #8 Take-Out Customizable Container 6" x 4 3/4" x 2 1/2" - 300/Case': 49.49,
    'Dixie Ultra White 2-Ply Interfold Paper Dispenser Napkin - 6 000/Case': 74.49,
    'Lotus Biscoff Creamy Cookie Butter Spread Pail 6.6 lb.': 47.99,
    'Lotus Biscoff Cookies 8.8 oz. - 10/Case': 36.49,
    'Jade Leaf Culinary Matcha Powder 1 lb. (454g) - 6/Case': 60.00,
    'Torani Vanilla': 78.99,
    // Lollicup Store
    '[1,600 ct] Boba Straws | Diagonal Cut | Individually Wrapped | Black (0.39" x 9")': 39.75,
    '[1,000 ct] Plastic Dome Cup Lids | PET | 90 mm': 49.50,
    'Taro Powder | Made in USA | 2.2 lbs': 15.50,
    'Non-Dairy Creamer': 67.75, 'Tapioca Pearls (Chewy)': 45.25,
    'Strawberry Syrup, 64oz': 10.25,
};

const DEFAULT_LOCATIONS = {
    // Bossen
    'Strawberry Syrup': 'Bossen', 'Mango Syrup': 'Bossen', 'Rose Syrup': 'Bossen',
    'Passionfruit Syrup': 'Bossen', 'Peach Syrup': 'Bossen', 'Lychee Syrup': 'Bossen',
    'Honeydew Syrup': 'Bossen', 'Pineapple Syrup': 'Bossen', 'Lemon Syrup': 'Bossen',
    'Red Guava Syrup': 'Bossen', 'Grape Syrup': 'Bossen', 'Kumquat Syrup': 'Bossen',
    'Kiwi Syrup': 'Bossen', 'Banana Syrup': 'Bossen',
    'Strawberry Jam': 'Bossen', 'Mango Jam': 'Bossen', 'Passion Fruit Jam': 'Bossen',
    'Rainbow Jelly – BT': 'Bossen', 'Lychee Jelly': 'Bossen', 'Coconut Jelly': 'Bossen',
    'Coffee Jelly': 'Bossen', 'Brown Sugar Agar Jelly': 'Bossen',
    'Strawberry': 'Bossen', 'Mango': 'Bossen', 'Blueberry': 'Bossen',
    'Lychee': 'Bossen', 'Kiwi': 'Bossen', 'Peach': 'Bossen',
    'PP Sealing Film – Good Time Printed': 'Bossen',
    'Thai Green Tea (Thumb up brand)': 'Bossen', 'Premium Thai Tea Mix (Cha Tra Mue)': 'Bossen',
    // HEB
    'Whole Milk': 'HEB', 'Eggs': 'HEB', 'Bananas': 'HEB', 'Strawberries': 'HEB',
    'Pineapple': 'HEB', 'Lemons': 'HEB', 'Limes': 'HEB', 'Oranges': 'HEB',
    'Apples': 'HEB', 'Cantaloupe': 'HEB', 'Onions': 'HEB', 'Corn': 'HEB',
    'Cotija cheese': 'HEB', 'Chicken breast (bulk)': 'HEB', 'All purpose flour': 'HEB',
    // Restaurant Depot
    'Mango Chunk (IQF)': 'Restaurant Depot', 'Mango Dice (IQF)': 'Restaurant Depot',
    'Sweetened Condensed Milk 14oz': 'Restaurant Depot', 'Milk Evaporated 12oz': 'Restaurant Depot',
    'Mascarpone 1 lb': 'Restaurant Depot', 'Mozzarella Bulk (~49lb)': 'Restaurant Depot',
    'French Fry 3/8 Big C': 'Restaurant Depot', 'Onion Ring': 'Restaurant Depot',
    'KIKO Bread Crumbs': 'Restaurant Depot', 'Nacho Cheese Sauce': 'Restaurant Depot',
    'Yeast Instant Dry': 'Restaurant Depot', 'Cornstarch 3 lbs': 'Restaurant Depot',
    'Garlic Powder 5#': 'Restaurant Depot', 'Onion Powder 5#': 'Restaurant Depot',
    'OIL CLEAR SOY': 'Restaurant Depot', 'Sugar Gran Nat 50#': 'Restaurant Depot',
    'Kosher Salt': 'Restaurant Depot', 'Honey Hot Sauce': 'Restaurant Depot',
    'Sriracha': 'Restaurant Depot', 'Heinz Ketchup (3/44oz)': 'Restaurant Depot',
    "Hellmann's Mayo (1 gal)": 'Restaurant Depot', 'Nutella Tub 6.6#': 'Restaurant Depot',
    'Oreo 2.5#': 'Restaurant Depot', 'Hershey Syrup (Jug)': 'Restaurant Depot',
    'Chamoy': 'Restaurant Depot', 'Tajin': 'Restaurant Depot',
    'Poly Bags': 'Restaurant Depot', 'T-shirt Bags': 'Restaurant Depot',
    'Gloves (LG / MD)': 'Restaurant Depot', 'Degreaser 1 Gal': 'Restaurant Depot',
    // Costco
    'Heavy Cream (if purchased)': 'Costco', 'Lemons 3 lb': 'Costco', 'Limes 3 lb': 'Costco',
    'Garlic (bulk bag)': 'Costco', 'Pink Salt': 'Costco', 'KS HOT DOGS': 'Costco',
    'Samyang Buldak Ramen Carbonara': 'Costco', 'OREO': 'Costco',
    'Jif Creamy Peanut Butter': 'Costco', 'Sweetened Condensed Milk': 'Costco',
    'Organic Coconut Water': 'Costco', 'Dish Soap': 'Costco', 'Scrub Daddy': 'Costco',
    'Drinking Water': 'Costco', 'Seedless Watermelon': 'Costco',
    '33-Gallon Trash Bag': 'Costco', '13-Gallon Kitchen Trash Bag': 'Costco',
    'Sliced Peaches': 'Costco', 'Lysol Disinfecting Wipes': 'Costco',
    'Almond Milk': 'Costco', 'Oat Milk': 'Costco', 'Shin Black': 'Costco',
    'Shin Ramyun Noodles': 'Costco', 'Coke': 'Costco', 'Diet Coke': 'Costco',
    'Spirte': 'Costco', 'Sugar Free Dr Pepper': 'Costco', 'Hand Soap': 'Costco',
    'Gallon Plus Freezer Bags': 'Costco', 'Pure Vanilla Extract': 'Costco',
    'Organic Brown Sugar': 'Costco', 'Laughing Cow Light Wedges': 'Costco',
    'Kraft Grated Parmesan Cheese': 'Costco',
    // Webstaurant
    '6 1/2" x 2 1/2" x 2 1/4" White Paper Hot Dog Clamshell Container - 500/Case': 'Webstaurant',
    "Lavex 2-Ply White Center Pull Paper Towel 500' Roll - 6/Case": 'Webstaurant',
    'Choice Clear PET Customizable Plastic Cold Cup - 24 oz. - 600/Case': 'Webstaurant',
    'Choice 9 oz. 12 oz. 16 oz. 20 oz. 24 oz. Clear PET Dome Lid with 2" Hole - 1 000/Case': 'Webstaurant',
    'Choice Black Plastic Souffle Cup / Portion Cup - 2 oz. - 2 500/Case': 'Webstaurant',
    'Choice PET Plastic Lid for 1.5 to 2.5 oz. Souffle Cup / Portion Cup - 2 500/Case': 'Webstaurant',
    'Fast Take Tamper-Evident Clear HDPE 2 Drink Beverage Carrier - 1 000/Case': 'Webstaurant',
    'Choice 12" x 12" Natural Kraft Customizable Basket Liner / Deli Wrap - 5 000/Case': 'Webstaurant',
    'Carnival King #200 2 lb. Cornerstone Paper Food Tray - 1 000/Case': 'Webstaurant',
    'Choice Kraft Microwavable Folded Paper #8 Take-Out Customizable Container 6" x 4 3/4" x 2 1/2" - 300/Case': 'Webstaurant',
    'Dixie Ultra White 2-Ply Interfold Paper Dispenser Napkin - 6 000/Case': 'Webstaurant',
    'Lotus Biscoff Creamy Cookie Butter Spread Pail 6.6 lb.': 'Webstaurant',
    'Lotus Biscoff Cookies 8.8 oz. - 10/Case': 'Webstaurant',
    'Jade Leaf Culinary Matcha Powder 1 lb. (454g) - 6/Case': 'Webstaurant',
    'Torani Vanilla': 'Webstaurant',
    // Lollicup Store
    '[1,600 ct] Boba Straws | Diagonal Cut | Individually Wrapped | Black (0.39" x 9")': 'Lollicup Store',
    '[1,000 ct] Plastic Dome Cup Lids | PET | 90 mm': 'Lollicup Store',
    'Taro Powder | Made in USA | 2.2 lbs': 'Lollicup Store',
    'Non-Dairy Creamer': 'Lollicup Store', 'Tapioca Pearls (Chewy)': 'Lollicup Store',
    'Strawberry Syrup, 64oz': 'Lollicup Store', 'Tropical Syrup, 64oz': 'Lollicup Store',
    'Black Tea': 'Lollicup Store', 'Jasmine Green Tea': 'Lollicup Store',
    'Milk Tea': 'Lollicup Store', 'Honeydew': 'Lollicup Store',
    'Coconut': 'Lollicup Store', 'Egg Pudding': 'Lollicup Store',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildFlat(groups) {
    return groups.flatMap((g) => g.items.map((item) => ({ category: g.category, name: item })));
}

function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const rows  = lines.map((line) => {
        const cols = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { inQ = !inQ; }
            else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
            else { cur += c; }
        }
        cols.push(cur.trim());
        return cols;
    });

    if (rows.length === 0) return [];

    // Detect header
    const first = rows[0].map((c) => c.toLowerCase());
    const hasCategoryCol = first.includes('category') || first.includes('cat');
    const hasItemCol     = first.includes('item') || first.includes('name');
    const dataRows       = (hasCategoryCol || hasItemCol) ? rows.slice(1) : rows;

    let catIdx  = hasCategoryCol ? first.findIndex((c) => c === 'category' || c === 'cat') : -1;
    let itemIdx = hasItemCol     ? first.findIndex((c) => c === 'item' || c === 'name')    : -1;

    // Fallback: single column → items only; two columns → category,item
    if (catIdx === -1 && itemIdx === -1) {
        catIdx  = dataRows[0]?.length >= 2 ? 0 : -1;
        itemIdx = dataRows[0]?.length >= 2 ? 1 : 0;
    }

    const grouped = {};
    for (const row of dataRows) {
        const item = row[itemIdx]?.trim();
        if (!item) continue;
        const cat = catIdx >= 0 ? (row[catIdx]?.trim() || 'Imported') : 'Imported';
        if (!grouped[cat]) grouped[cat] = [];
        if (!grouped[cat].includes(item)) grouped[cat].push(item);
    }

    return Object.entries(grouped).map(([category, items]) => ({ category, items }));
}

function exportCSV(groups, counts, employeeName) {
    const rows = [['Category', 'Item', 'Amount']];
    groups.forEach((group) => {
        group.items.forEach((item) => {
            rows.push([group.category, item, counts[item] ?? 0]);
        });
    });
    const csv  = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `inventory_${(employeeName || 'export').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportTemplateCSV(groups) {
    const rows = [['Category', 'Item']];
    groups.forEach((g) => g.items.forEach((i) => rows.push([g.category, i])));
    const csv  = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'inventory_template.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function exportShoppingList(shoppingItems, lastCounts, pars) {
    const rows = [['Category', 'Item', 'Have', 'Need (Par)', 'Short']];
    shoppingItems.forEach((i) => {
        const have  = lastCounts[i.name] ?? 0;
        const need  = pars[i.name] ?? '';
        const short = need !== '' ? Math.max(0, need - have) : '';
        rows.push([i.category, i.name, have, need, short]);
    });
    const csv  = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `shopping_list_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function copyShoppingListText(shoppingItems, lastCounts, pars) {
    const date  = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const lines = [`SHOPPING LIST — ${date}`, ''];
    const cats  = [...new Set(shoppingItems.map((i) => i.category))];
    cats.forEach((cat) => {
        lines.push(cat);
        shoppingItems
            .filter((i) => i.category === cat)
            .forEach((i) => {
                const have   = lastCounts[i.name] ?? 0;
                const par    = pars[i.name];
                const detail = par ? `  — have ${have}, need ${par}` : '';
                lines.push(`  • ${i.name}${detail}`);
            });
        lines.push('');
    });
    navigator.clipboard.writeText(lines.join('\n'));
}

function formatDate(iso) {
    return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
}

// ─── StatusPill ──────────────────────────────────────────────────────────────

function StatusPill({ value, onChange }) {
    const options = [
        { key: 'ok',  label: 'OK',  bg: 'bg-green-100 text-green-700'  },
        { key: 'low', label: 'Low', bg: 'bg-yellow-100 text-yellow-700' },
        { key: 'out', label: 'Out', bg: 'bg-red-100 text-red-700'       },
    ];
    return (
        <div className='mt-1 flex gap-1'>
            {options.map((o) => (
                <button
                    key={o.key}
                    type='button'
                    onClick={() => onChange(o.key)}
                    className={`rounded px-3 py-1 text-xs font-medium transition-opacity ${o.bg} ${value === o.key ? 'opacity-100 ring-1 ring-current' : 'opacity-40'}`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

// ─── HistoryEntry ────────────────────────────────────────────────────────────

function HistoryEntry({ entry, onDelete }) {
    const [open, setOpen] = useState(false);
    const flagged = entry.items.filter((i) => i.status !== 'ok');
    const filled  = entry.items.filter((i) => i.amount > 0);

    // Group unique categories from this entry
    const categories = [...new Set(entry.items.map((i) => i.category))];

    return (
        <div className='rounded-lg border border-gray-200 bg-white'>
            <div
                className='flex cursor-pointer items-center justify-between px-4 py-3'
                onClick={() => setOpen((p) => !p)}
            >
                <div>
                    <p className='font-medium'>{entry.employeeName || 'Unknown'}</p>
                    <p className='text-xs text-gray-500'>{formatDate(entry.submittedAt)}</p>
                </div>
                <div className='flex items-center gap-2 text-xs'>
                    <span className='rounded-full bg-gray-100 px-2 py-0.5 text-gray-600'>{filled.length} filled</span>
                    {flagged.length > 0 && (
                        <span className='rounded-full bg-red-100 px-2 py-0.5 text-red-600'>{flagged.length} flagged</span>
                    )}
                    <span className='text-gray-400'>{open ? '▾' : '▸'}</span>
                </div>
            </div>

            {open && (
                <div className='border-t border-gray-100 px-4 py-3'>
                    {entry.notes && (
                        <p className='mb-3 text-sm text-gray-600'>
                            <span className='font-medium'>Notes:</span> {entry.notes}
                        </p>
                    )}
                    {flagged.length > 0 && (
                        <div className='mb-3'>
                            <p className='mb-1 text-xs font-semibold uppercase tracking-wide text-red-600'>Flagged</p>
                            <div className='grid gap-1 sm:grid-cols-2 md:grid-cols-3'>
                                {flagged.map((i) => (
                                    <div key={i.name} className='flex items-center justify-between rounded bg-red-50 px-2 py-1 text-sm'>
                                        <span className='truncate'>{i.name}</span>
                                        <span className={`ml-2 shrink-0 rounded px-1.5 text-xs font-medium ${i.status === 'low' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                            {i.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {categories.map((cat) => {
                        const catItems = entry.items.filter((i) => i.category === cat && (i.amount > 0 || i.status !== 'ok'));
                        if (!catItems.length) return null;
                        return (
                            <div key={cat} className='mb-2'>
                                <p className='mb-1 text-xs font-semibold text-gray-500'>{cat}</p>
                                <div className='grid gap-1 sm:grid-cols-2 md:grid-cols-3'>
                                    {catItems.map((i) => (
                                        <div key={i.name} className='flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-sm'>
                                            <span className='truncate'>{i.name}</span>
                                            <span className='ml-2 shrink-0 text-gray-500'>{i.amount ?? 0}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    <button type='button' onClick={() => onDelete(entry._id, entry.submittedAt)} className='mt-3 text-xs text-red-400 hover:text-red-600'>
                        Delete this entry
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── SummaryModal ────────────────────────────────────────────────────────────

function SummaryModal({ flatItems, counts, pars, employeeName, notes, onConfirm, onCancel, submitting }) {
    const filled    = flatItems.filter((i) => counts[i.name] > 0);
    const belowPar  = flatItems.filter((i) => pars[i.name] > 0 && (counts[i.name] ?? 0) < pars[i.name]);
    return (
        <div className='fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4'>
            <div className='w-full max-w-lg rounded-t-2xl bg-white shadow-xl sm:rounded-xl'>
                <div className='border-b border-gray-100 px-4 py-4 sm:px-6'>
                    <h2 className='text-lg font-bold'>Review & Submit</h2>
                    <p className='text-sm text-gray-500'>{employeeName} · {new Date().toLocaleDateString()}</p>
                </div>
                <div className='max-h-[60vh] overflow-y-auto space-y-4 px-4 py-4 sm:max-h-80 sm:px-6'>
                    {notes && <p className='text-sm text-gray-600'><span className='font-medium'>Notes:</span> {notes}</p>}
                    <div>
                        <p className='mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500'>Summary</p>
                        <div className='grid grid-cols-2 gap-2 text-center text-sm'>
                            <div className='rounded-lg bg-gray-50 p-2'>
                                <p className='text-xl font-bold'>{filled.length}</p>
                                <p className='text-gray-500'>items filled</p>
                            </div>
                            <div className='rounded-lg bg-orange-50 p-2'>
                                <p className='text-xl font-bold text-orange-700'>{belowPar.length}</p>
                                <p className='text-orange-600'>below par</p>
                            </div>
                        </div>
                    </div>
                    {belowPar.length > 0 && (
                        <div>
                            <p className='mb-1 text-xs font-semibold uppercase tracking-wide text-orange-500'>Below Par</p>
                            <div className='space-y-1'>
                                {belowPar.map((i) => (
                                    <div key={i.name} className='flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm'>
                                        <span className='min-w-0 truncate text-gray-700'>{i.name}</span>
                                        <span className='shrink-0 rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700'>
                                            have {counts[i.name] ?? 0} · need {pars[i.name]}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className='flex justify-end gap-2 border-t border-gray-100 px-4 py-4 sm:px-6'>
                    <button type='button' onClick={onCancel} disabled={submitting} className='rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50'>Back</button>
                    <button type='button' onClick={onConfirm} disabled={submitting} className='rounded-lg bg-black px-5 py-2 text-sm text-white disabled:opacity-50'>
                        {submitting ? 'Submitting…' : 'Confirm & Submit'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── CSVImportModal ──────────────────────────────────────────────────────────

function CSVImportModal({ parsed, onConfirm, onCancel }) {
    const [mode, setMode] = useState('merge'); // 'merge' | 'replace'
    const totalItems = parsed.reduce((s, g) => s + g.items.length, 0);
    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
            <div className='w-full max-w-lg rounded-xl bg-white shadow-xl'>
                <div className='border-b border-gray-100 px-6 py-4'>
                    <h2 className='text-lg font-bold'>Import CSV</h2>
                    <p className='text-sm text-gray-500'>{parsed.length} categories · {totalItems} items found</p>
                </div>
                <div className='max-h-72 overflow-y-auto px-6 py-4'>
                    <div className='space-y-2'>
                        {parsed.map((g) => (
                            <div key={g.category}>
                                <p className='text-xs font-semibold text-gray-500'>{g.category} ({g.items.length})</p>
                                <p className='truncate text-sm text-gray-700'>{g.items.slice(0, 4).join(', ')}{g.items.length > 4 ? ` +${g.items.length - 4} more` : ''}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className='border-t border-gray-100 px-6 py-3'>
                    <p className='mb-2 text-xs font-medium text-gray-600'>Import mode</p>
                    <div className='flex gap-3'>
                        {[
                            { key: 'merge',   label: 'Merge',   desc: 'Add new items, keep existing' },
                            { key: 'replace', label: 'Replace', desc: 'Remove all current items first' },
                        ].map((m) => (
                            <label key={m.key} className={`flex flex-1 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${mode === m.key ? 'border-black bg-gray-50' : 'border-gray-200'}`}>
                                <input type='radio' name='import-mode' value={m.key} checked={mode === m.key} onChange={() => setMode(m.key)} className='mt-0.5' />
                                <div>
                                    <p className='font-medium'>{m.label}</p>
                                    <p className='text-xs text-gray-500'>{m.desc}</p>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
                <div className='flex justify-end gap-2 border-t border-gray-100 px-6 py-4'>
                    <button type='button' onClick={onCancel} className='rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50'>Cancel</button>
                    <button type='button' onClick={() => onConfirm(mode)} className='rounded-lg bg-black px-5 py-2 text-sm text-white'>Import</button>
                </div>
            </div>
        </div>
    );
}

// ─── ManageTab ───────────────────────────────────────────────────────────────

function ManageTab({ groups, onChange, pars, onParChange, restocks, onRestockChange, units, onUnitChange, unitTypes, onAddUnitType, onDeleteUnitType, prices, onPriceChange, locations, onLocationChange, caseSizes, onCaseSizeChange, onSaveAll, dailyChecks, onDailyCheckToggle }) {
    const [editCat,        setEditCat]        = useState(null); // { catIdx, value }
    const [editItem,       setEditItem]       = useState(null); // { catIdx, itemIdx, value }
    const [newItem,        setNewItem]        = useState({});   // { [catIdx]: string }
    const [newCat,         setNewCat]         = useState('');
    const [pendingPars,      setPendingPars]      = useState({});
    const [pendingRestocks,  setPendingRestocks]  = useState({});
    const [pendingPrices,    setPendingPrices]    = useState({});
    const [pendingCaseSizes, setPendingCaseSizes] = useState({});
    const [pendingLocations, setPendingLocations] = useState({});
    const [saving,  setSaving]  = useState(false);
    const [saved,   setSaved]   = useState(false);
    const [csvModal,    setCsvModal]    = useState(null); // parsed groups | null
    const [collapsed,   setCollapsed]   = useState({});   // { [catIdx]: bool }
    const [showUnitMgr, setShowUnitMgr] = useState(false);
    const [newUnitType, setNewUnitType] = useState('');
    // item drag state
    const [dragItem, setDragItem] = useState(null); // { catIdx, itemIdx }
    const [overItem, setOverItem] = useState(null); // { catIdx, itemIdx }
    const fileRef = useRef(null);

    const update = (next) => onChange(next);

    const toggleCollapse = (catIdx) => setCollapsed((p) => ({ ...p, [catIdx]: !p[catIdx] }));

    // ── Reorder helpers ───────────────────────────────────────────────────

    const moveItem = (catIdx, fromIdx, toIdx) => {
        if (fromIdx === toIdx) return;
        const next = groups.map((g, ci) => {
            if (ci !== catIdx) return g;
            const items = [...g.items];
            const [removed] = items.splice(fromIdx, 1);
            items.splice(toIdx, 0, removed);
            return { ...g, items };
        });
        update(next);
    };

    // ── Item drag handlers ────────────────────────────────────────────────

    const onItemDragStart = (e, catIdx, itemIdx) => {
        setDragItem({ catIdx, itemIdx });
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
    };
    const onItemDragOver = (e, catIdx, itemIdx) => {
        if (!dragItem || dragItem.catIdx !== catIdx) return;
        e.preventDefault();
        e.stopPropagation();
        setOverItem({ catIdx, itemIdx });
    };
    const onItemDrop = (e, catIdx, itemIdx) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragItem && dragItem.catIdx === catIdx && dragItem.itemIdx !== itemIdx)
            moveItem(catIdx, dragItem.itemIdx, itemIdx);
        setDragItem(null); setOverItem(null);
    };
    const onItemDragEnd = () => { setDragItem(null); setOverItem(null); };

    // ── Category actions ──────────────────────────────────────────────────

    const saveCatName = (catIdx) => {
        const val = editCat.value.trim();
        if (!val) return setEditCat(null);
        const next = groups.map((g, i) => i === catIdx ? { ...g, category: val } : g);
        update(next);
        setEditCat(null);
    };

    const deleteCategory = (catIdx) => {
        if (!confirm(`Delete category "${groups[catIdx].category}" and all its items?`)) return;
        update(groups.filter((_, i) => i !== catIdx));
    };

    const addCategory = () => {
        const val = newCat.trim();
        if (!val) return;
        if (groups.some((g) => g.category.toLowerCase() === val.toLowerCase())) return;
        update([...groups, { category: val, items: [] }]);
        setNewCat('');
    };

    // ── Item actions ──────────────────────────────────────────────────────

    const saveItemName = (catIdx, itemIdx) => {
        const val = editItem.value.trim();
        if (!val) return setEditItem(null);
        const next = groups.map((g, ci) => {
            if (ci !== catIdx) return g;
            const items = g.items.map((it, ii) => ii === itemIdx ? val : it);
            return { ...g, items };
        });
        update(next);
        setEditItem(null);
    };

    const deleteItem = (catIdx, itemIdx) => {
        const next = groups.map((g, ci) => {
            if (ci !== catIdx) return g;
            return { ...g, items: g.items.filter((_, ii) => ii !== itemIdx) };
        });
        update(next);
    };

    const addItem = (catIdx) => {
        const val = (newItem[catIdx] || '').trim();
        if (!val) return;
        const next = groups.map((g, ci) => {
            if (ci !== catIdx) return g;
            if (g.items.includes(val)) return g;
            return { ...g, items: [...g.items, val] };
        });
        update(next);
        setNewItem((p) => ({ ...p, [catIdx]: '' }));
    };

    const hasPending = (
        Object.keys(pendingPars).length > 0 ||
        Object.keys(pendingRestocks).length > 0 ||
        Object.keys(pendingPrices).length > 0 ||
        Object.keys(pendingCaseSizes).length > 0 ||
        Object.keys(pendingLocations).length > 0
    );

    const handleSaveAll = async () => {
        if (!hasPending || saving) return;
        setSaving(true);
        // Apply pending changes to parent React state
        Object.entries(pendingPars).forEach(([name, val]) => onParChange(name, val));
        Object.entries(pendingRestocks).forEach(([name, val]) => onRestockChange(name, val));
        Object.entries(pendingPrices).forEach(([name, val]) => onPriceChange(name, val));
        Object.entries(pendingCaseSizes).forEach(([name, val]) => onCaseSizeChange(name, val));
        Object.entries(pendingLocations).forEach(([name, val]) => onLocationChange(name, val));
        // Persist to database
        await onSaveAll({ pars: pendingPars, restocks: pendingRestocks, prices: pendingPrices, caseSizes: pendingCaseSizes, locations: pendingLocations });
        // Clear pending
        setPendingPars({});
        setPendingRestocks({});
        setPendingPrices({});
        setPendingCaseSizes({});
        setPendingLocations({});
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    // ── CSV import ────────────────────────────────────────────────────────

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const parsed = parseCSV(ev.target.result);
            if (parsed.length === 0) { alert('No valid rows found. Expected columns: Category, Item'); return; }
            setCsvModal(parsed);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleCSVImport = (mode) => {
        if (!csvModal) return;
        let next;
        if (mode === 'replace') {
            next = csvModal;
        } else {
            // Merge: for each parsed group, merge into existing
            next = [...groups];
            for (const parsed of csvModal) {
                const existing = next.find((g) => g.category.toLowerCase() === parsed.category.toLowerCase());
                if (existing) {
                    const newItems = parsed.items.filter((it) => !existing.items.includes(it));
                    existing.items = [...existing.items, ...newItems];
                } else {
                    next.push({ ...parsed });
                }
            }
            next = next.map((g) => ({ ...g })); // shallow clone for state update
        }
        update(next);
        setCsvModal(null);
    };

    return (
        <div className='space-y-5'>
            {/* Toolbar */}
            <div className='flex flex-wrap items-center gap-2'>
                <input
                    ref={fileRef}
                    type='file'
                    accept='.csv,text/csv'
                    className='hidden'
                    onChange={handleFileChange}
                />
                <button
                    type='button'
                    onClick={() => fileRef.current?.click()}
                    className='rounded-lg bg-black px-4 py-2 text-sm text-white'
                >
                    Import CSV
                </button>
                <button
                    type='button'
                    onClick={() => exportTemplateCSV(groups)}
                    className='rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50'
                >
                    Download Template
                </button>
                <span className='text-xs text-gray-400'>CSV format: Category, Item (with header row)</span>
            </div>

            {/* Unit types manager */}
            <div className='rounded-xl bg-white shadow-sm'>
                <button
                    type='button'
                    onClick={() => setShowUnitMgr((v) => !v)}
                    className='flex w-full items-center gap-2 px-4 py-3 text-sm font-medium'
                >
                    <span>{showUnitMgr ? '▼' : '▶'}</span>
                    <span>Unit Types</span>
                    <span className='ml-auto text-xs font-normal text-gray-400'>{unitTypes.length} types</span>
                </button>
                {showUnitMgr && (
                    <div className='border-t border-gray-100 px-4 pb-4 pt-3'>
                        <div className='mb-3 flex flex-wrap gap-1.5'>
                            {unitTypes.map((t) => (
                                <span key={t} className='flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700'>
                                    {t}
                                    <button type='button' onClick={() => onDeleteUnitType(t)} className='text-gray-400 hover:text-red-500 leading-none'>×</button>
                                </span>
                            ))}
                        </div>
                        <div className='flex gap-2'>
                            <input
                                type='text'
                                value={newUnitType}
                                onChange={(e) => setNewUnitType(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { onAddUnitType(newUnitType); setNewUnitType(''); } }}
                                placeholder='New unit type…'
                                className='flex-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-black focus:bg-white'
                            />
                            <button
                                type='button'
                                onClick={() => { onAddUnitType(newUnitType); setNewUnitType(''); }}
                                disabled={!newUnitType.trim()}
                                className='rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40'
                            >
                                + Add
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Add category */}
            <div className='flex gap-2'>
                <input
                    type='text'
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                    placeholder='New category name…'
                    className='flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black'
                />
                <button
                    type='button'
                    onClick={addCategory}
                    disabled={!newCat.trim()}
                    className='rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-40'
                >
                    + Add Category
                </button>
            </div>

            {/* Reset to defaults + Save */}
            <div className='flex items-center justify-between'>
                <button
                    type='button'
                    onClick={() => { if (confirm('Reset to default items? This cannot be undone.')) onChange(DEFAULT_ITEMS); }}
                    className='text-xs text-red-400 hover:text-red-600'
                >
                    Reset to defaults
                </button>
                <button
                    type='button'
                    onClick={handleSaveAll}
                    disabled={!hasPending || saving}
                    className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all ${
                        saved ? 'bg-green-500 text-white' :
                        hasPending ? 'bg-black text-white shadow-md hover:bg-gray-800' :
                        'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                >
                    {saving ? 'Saving…' : saved ? '✓ Saved' : hasPending ? `Save Changes (${Object.keys(pendingPars).length + Object.keys(pendingRestocks).length + Object.keys(pendingPrices).length + Object.keys(pendingCaseSizes).length + Object.keys(pendingLocations).length})` : 'No changes'}
                </button>
            </div>

            {/* Categories */}
            {groups.map((group, catIdx) => (
                <section key={catIdx} className='rounded-xl bg-white shadow-sm'>
                    {/* Category header */}
                    <div className={`flex items-center gap-2 px-4 py-3 ${collapsed[catIdx] ? '' : 'border-b border-gray-100'}`}>
                        <button
                            type='button'
                            onClick={() => toggleCollapse(catIdx)}
                            className='text-gray-400 hover:text-black'
                            title={collapsed[catIdx] ? 'Expand' : 'Collapse'}
                        >
                            {collapsed[catIdx] ? '▶' : '▼'}
                        </button>
                        {editCat?.catIdx === catIdx ? (
                            <input
                                autoFocus
                                value={editCat.value}
                                onChange={(e) => setEditCat({ catIdx, value: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveCatName(catIdx); if (e.key === 'Escape') setEditCat(null); }}
                                onBlur={() => saveCatName(catIdx)}
                                className='flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-semibold outline-none focus:border-black'
                            />
                        ) : (
                            <span className='flex-1 font-semibold'>{group.category}</span>
                        )}
                        <span className='text-xs text-gray-400'>{group.items.length} items</span>
                        <button
                            type='button'
                            onClick={() => setEditCat({ catIdx, value: group.category })}
                            className='text-gray-400 hover:text-black'
                            title='Rename'
                        >
                            ✎
                        </button>
                        <button
                            type='button'
                            onClick={() => deleteCategory(catIdx)}
                            className='text-gray-300 hover:text-red-500'
                            title='Delete category'
                        >
                            ✕
                        </button>
                    </div>

                    {/* Items */}
                    {!collapsed[catIdx] && <div className='divide-y divide-gray-50'>
                        {group.items.map((item, itemIdx) => (
                            <div
                                key={itemIdx}
                                draggable
                                onDragStart={(e) => onItemDragStart(e, catIdx, itemIdx)}
                                onDragOver={(e) => onItemDragOver(e, catIdx, itemIdx)}
                                onDrop={(e) => onItemDrop(e, catIdx, itemIdx)}
                                onDragEnd={onItemDragEnd}
                                className={`flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-2 transition-opacity ${dragItem?.catIdx === catIdx && dragItem?.itemIdx === itemIdx ? 'opacity-40' : ''} ${overItem?.catIdx === catIdx && overItem?.itemIdx === itemIdx && dragItem?.itemIdx !== itemIdx ? 'border-t-2 border-blue-400' : ''}`}
                            >
                                {/* Row 1: drag handle + name + actions */}
                                <div className='flex min-w-0 flex-1 items-center gap-2'>
                                    <span className='hidden cursor-grab select-none text-gray-300 hover:text-gray-500 active:cursor-grabbing sm:inline' title='Drag to reorder'>⠿</span>
                                    {editItem?.catIdx === catIdx && editItem?.itemIdx === itemIdx ? (
                                        <input
                                            autoFocus
                                            value={editItem.value}
                                            onChange={(e) => setEditItem({ catIdx, itemIdx, value: e.target.value })}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveItemName(catIdx, itemIdx); if (e.key === 'Escape') setEditItem(null); }}
                                            onBlur={() => saveItemName(catIdx, itemIdx)}
                                            className='flex-1 rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-black'
                                        />
                                    ) : (
                                        <span className='flex-1 truncate text-sm'>{item}</span>
                                    )}
                                    <button
                                        type='button'
                                        onClick={() => onDailyCheckToggle(item)}
                                        title={dailyChecks?.has(item) ? 'Remove from daily check' : 'Add to daily check'}
                                        className={`shrink-0 p-1 text-base leading-none transition-colors ${dailyChecks?.has(item) ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-200 hover:text-yellow-300'}`}
                                    >☀</button>
                                    <button type='button' onClick={() => setEditItem({ catIdx, itemIdx, value: item })} className='shrink-0 p-1 text-gray-300 hover:text-black' title='Rename item'>✎</button>
                                    <button type='button' onClick={() => deleteItem(catIdx, itemIdx)} className='shrink-0 p-1 text-gray-300 hover:text-red-500' title='Delete item'>✕</button>
                                </div>
                                {/* Row 2 (mobile) / inline (desktop): par + unit */}
                                <div className='flex flex-wrap items-center gap-2 sm:contents'>
                                    {/* Par level */}
                                    <input
                                        type='number' min='0' step='1' inputMode='numeric'
                                        value={pendingPars[item] !== undefined ? pendingPars[item] : (pars[item] ?? 1)}
                                        onChange={(e) => setPendingPars((p) => ({ ...p, [item]: e.target.value }))}
                                        title='Par level'
                                        className={`w-14 shrink-0 rounded border px-2 py-1 text-center text-xs text-gray-500 outline-none focus:border-orange-400 ${pendingPars[item] !== undefined ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}
                                    />
                                    {/* Restock qty */}
                                    <input
                                        type='number' min='0' step='1' inputMode='numeric'
                                        value={pendingRestocks[item] !== undefined ? pendingRestocks[item] : (restocks[item] ?? '')}
                                        onChange={(e) => setPendingRestocks((p) => ({ ...p, [item]: e.target.value }))}
                                        placeholder='Restock'
                                        title='Restock qty — how many to buy when low'
                                        className={`w-16 shrink-0 rounded border px-2 py-1 text-center text-xs text-gray-500 outline-none focus:border-blue-400 ${pendingRestocks[item] !== undefined ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
                                    />
                                    {/* Unit type */}
                                    <select
                                        value={units[item] || ''} onChange={(e) => onUnitChange(item, e.target.value)}
                                        title='Unit type'
                                        className='w-20 shrink-0 rounded border border-gray-200 px-1 py-1 text-xs text-gray-500 outline-none focus:border-orange-400'
                                    >
                                        <option value=''>unit</option>
                                        {unitTypes.map((u) => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                    {/* Case size */}
                                    <input
                                        type='number' min='0' step='1' inputMode='numeric'
                                        value={pendingCaseSizes[item] !== undefined ? pendingCaseSizes[item] : (caseSizes[item] ?? '')}
                                        onChange={(e) => setPendingCaseSizes((p) => ({ ...p, [item]: e.target.value }))}
                                        placeholder='case'
                                        title='Units per case (e.g. 12 means 1 case = 12 units)'
                                        className={`w-14 shrink-0 rounded border px-2 py-1 text-center text-xs text-gray-500 outline-none focus:border-purple-400 ${pendingCaseSizes[item] !== undefined ? 'border-purple-300 bg-purple-50' : 'border-gray-200'}`}
                                    />
                                    {/* Price */}
                                    <div className='flex shrink-0 items-center'>
                                        <span className='text-xs text-gray-400 mr-0.5'>$</span>
                                        <input
                                            type='number' min='0' step='0.01' inputMode='decimal'
                                            value={pendingPrices[item] !== undefined ? pendingPrices[item] : (prices[item] ?? '')}
                                            onChange={(e) => setPendingPrices((p) => ({ ...p, [item]: e.target.value }))}
                                            placeholder='price'
                                            title='Unit price'
                                            className={`w-16 rounded border px-2 py-1 text-center text-xs text-gray-500 outline-none focus:border-green-400 ${pendingPrices[item] !== undefined ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}
                                        />
                                    </div>
                                    {/* Location */}
                                    <select
                                        value={pendingLocations[item] !== undefined ? pendingLocations[item] : (locations[item] || '')}
                                        onChange={(e) => setPendingLocations((p) => ({ ...p, [item]: e.target.value }))}
                                        title='Store / supplier'
                                        className={`w-28 shrink-0 rounded border px-1 py-1 text-xs text-gray-500 outline-none focus:border-green-400 ${pendingLocations[item] !== undefined ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}
                                    >
                                        <option value=''>store…</option>
                                        {DEFAULT_STORE_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>}

                    {/* Add item row */}
                    {!collapsed[catIdx] && <div className='flex gap-2 px-4 py-3'>
                        <input
                            type='text'
                            value={newItem[catIdx] || ''}
                            onChange={(e) => setNewItem((p) => ({ ...p, [catIdx]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addItem(catIdx)}
                            placeholder='Add item…'
                            className='flex-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-black focus:bg-white'
                        />
                        <button
                            type='button'
                            onClick={() => addItem(catIdx)}
                            disabled={!(newItem[catIdx] || '').trim()}
                            className='rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40'
                        >
                            + Add
                        </button>
                    </div>}
                </section>
            ))}

            {csvModal && (
                <CSVImportModal
                    parsed={csvModal}
                    onConfirm={handleCSVImport}
                    onCancel={() => setCsvModal(null)}
                />
            )}
        </div>
    );
}

// ─── Employees tab (admin only) ──────────────────────────────────────────────

function EmployeesTab({ employees, currentUser, onAdd, onDelete, onResetPin }) {
    const [form,        setForm]        = useState({ name: '', role: 'employee', pin: '', confirmPin: '' });
    const [formError,   setFormError]   = useState('');
    const [adding,      setAdding]      = useState(false);
    const [resetTarget, setResetTarget] = useState(null);
    const [resetPin,    setResetPin]    = useState('');
    const [resetError,  setResetError]  = useState('');
    const [resetting,   setResetting]   = useState(false);

    const handleAdd = async () => {
        if (!form.name.trim())       { setFormError('Name is required.'); return; }
        if (form.pin.length < 4)     { setFormError('PIN must be at least 4 digits.'); return; }
        if (form.pin !== form.confirmPin) { setFormError('PINs do not match.'); return; }
        setAdding(true); setFormError('');
        try {
            await onAdd(form.name.trim(), form.pin, form.role);
            setForm({ name: '', role: 'employee', pin: '', confirmPin: '' });
        } catch (e) { setFormError(e.message || 'Failed to add employee.'); }
        finally { setAdding(false); }
    };

    const handleResetPin = async () => {
        if (resetPin.length < 4) { setResetError('PIN must be at least 4 digits.'); return; }
        setResetting(true); setResetError('');
        try {
            await onResetPin(resetTarget, resetPin);
            setResetTarget(null); setResetPin('');
        } catch (e) { setResetError(e.message || 'Failed to reset PIN.'); }
        finally { setResetting(false); }
    };

    return (
        <div className='space-y-5'>
            {/* Employee list */}
            <div className='rounded-xl bg-white p-4 shadow-sm'>
                <h2 className='mb-3 font-semibold'>Employees ({employees.length})</h2>
                {employees.length === 0 ? (
                    <p className='text-sm text-gray-400'>No employees yet.</p>
                ) : (
                    <ul className='divide-y divide-gray-100'>
                        {employees.map((emp) => (
                            <li key={emp.id} className='flex items-center justify-between py-2.5'>
                                <div className='flex items-center gap-2'>
                                    <span className='font-medium'>{emp.name}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${emp.role === 'admin' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}>
                                        {emp.role}
                                    </span>
                                    {emp.id === currentUser.id && <span className='text-xs text-gray-400'>(you)</span>}
                                </div>
                                <div className='flex gap-3'>
                                    <button type='button' onClick={() => { setResetTarget(emp.id); setResetPin(''); setResetError(''); }} className='text-xs text-blue-500 hover:text-blue-700'>Reset PIN</button>
                                    {emp.id !== currentUser.id && (
                                        <button type='button' onClick={() => onDelete(emp.id)} className='text-xs text-red-400 hover:text-red-600'>Delete</button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Reset PIN inline panel */}
            {resetTarget && (
                <div className='rounded-xl bg-white p-4 shadow-sm'>
                    <h3 className='mb-3 font-medium'>Reset PIN — {employees.find((e) => e.id === resetTarget)?.name}</h3>
                    <div className='flex flex-wrap gap-2'>
                        <input
                            type='password' inputMode='numeric' maxLength={6}
                            value={resetPin} onChange={(e) => setResetPin(e.target.value.replace(/\D/g, ''))}
                            placeholder='New PIN'
                            className='w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black'
                        />
                        <button type='button' onClick={handleResetPin} disabled={resetting} className='rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50'>{resetting ? 'Saving…' : 'Save'}</button>
                        <button type='button' onClick={() => setResetTarget(null)} className='rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600'>Cancel</button>
                    </div>
                    {resetError && <p className='mt-1 text-xs text-red-500'>{resetError}</p>}
                </div>
            )}

            {/* Add employee */}
            <div className='rounded-xl bg-white p-4 shadow-sm'>
                <h2 className='mb-3 font-semibold'>Add Employee</h2>
                <div className='grid gap-3 sm:grid-cols-2'>
                    <div>
                        <label className='mb-1 block text-xs font-medium text-gray-600'>Name</label>
                        <input type='text' value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder='Full name' className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black' />
                    </div>
                    <div>
                        <label className='mb-1 block text-xs font-medium text-gray-600'>Role</label>
                        <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black'>
                            <option value='employee'>Employee</option>
                            <option value='admin'>Admin</option>
                        </select>
                    </div>
                    <div>
                        <label className='mb-1 block text-xs font-medium text-gray-600'>PIN (4–6 digits)</label>
                        <input type='password' inputMode='numeric' maxLength={6} value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} placeholder='••••' className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black' />
                    </div>
                    <div>
                        <label className='mb-1 block text-xs font-medium text-gray-600'>Confirm PIN</label>
                        <input type='password' inputMode='numeric' maxLength={6} value={form.confirmPin} onChange={(e) => setForm((f) => ({ ...f, confirmPin: e.target.value.replace(/\D/g, '') }))} placeholder='••••' className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black' />
                    </div>
                </div>
                {formError && <p className='mt-2 text-xs text-red-500'>{formError}</p>}
                <button type='button' onClick={handleAdd} disabled={adding} className='mt-3 rounded-lg bg-black px-5 py-2 text-sm text-white disabled:opacity-50'>
                    {adding ? 'Adding…' : 'Add Employee'}
                </button>
            </div>
        </div>
    );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function InventoryPage() {
    const [tab,          setTab]          = useState('checklist');
    const [groups,       setGroups]       = useState(DEFAULT_ITEMS);
    const [counts,       setCounts]       = useState({});
    const [statuses,     setStatuses]     = useState({});
    const [lastCounts,   setLastCounts]   = useState({});
    const [employeeName, setEmployeeName] = useState('');
    const [notes,        setNotes]        = useState('');
    const [submitting,   setSubmitting]   = useState(false);
    const [message,      setMessage]      = useState('');
    const [search,       setSearch]       = useState('');
    const [collapsed,    setCollapsed]    = useState({});
    const [draftSaved,   setDraftSaved]   = useState(false);
    const [showSummary,  setShowSummary]  = useState(false);
    const [history,      setHistory]      = useState([]);
    const [pars,         setPars]         = useState({});
    const [restocks,     setRestocks]     = useState({});
    const [units,        setUnits]        = useState({});
    const [prices,       setPrices]       = useState({});
    const [locations,    setLocations]    = useState({});
    const [caseSizes,    setCaseSizes]    = useState({});
    const [caseCounts,   setCaseCounts]   = useState({});
    const [dailyChecks,  setDailyChecks]  = useState(new Set());
    const [buyInCases,   setBuyInCases]   = useState(true);
    const [unitTypes,    setUnitTypes]    = useState(DEFAULT_UNIT_TYPES);
    const [isLoading,    setIsLoading]    = useState(true);
    const [currentUser,         setCurrentUser]         = useState(null);
    const [employees,           setEmployees]           = useState([]);
    const [selectedShoppingStore, setSelectedShoppingStore] = useState(null);
    const [shoppingBaseId,  setShoppingBaseId]  = useState(null);  // null = most recent
    const [purchasedAmounts,     setPurchasedAmounts]     = useState({});  // { [itemName]: total units received }
    const [purchasedCaseCounts, setPurchasedCaseCounts] = useState({});  // { [itemName]: {cases, units} }
    const [purchaseMode,        setPurchaseMode]        = useState(false);
    const [applyingRestock,     setApplyingRestock]     = useState(false);
    const [pinEmployee,  setPinEmployee]  = useState('');
    const [pinInput,     setPinInput]     = useState('');
    const [pinError,     setPinError]     = useState('');
    const [pinLoading,   setPinLoading]   = useState(false);
    const draftTimer = useRef(null);

    // Derived
    const flatItems = useMemo(() => buildFlat(groups), [groups]);

    // Sync counts/statuses when items list changes (add defaults for new items)
    useEffect(() => {
        setCounts((prev) => {
            const next = {};
            flatItems.forEach((i) => { next[i.name] = prev[i.name] ?? 0; });
            return next;
        });
        setStatuses((prev) => {
            const next = {};
            flatItems.forEach((i) => { next[i.name] = prev[i.name] ?? 'ok'; });
            return next;
        });
    }, [flatItems]);

    // Load from Supabase on mount
    useEffect(() => {
        const load = async () => {
            try {
                const [fetchedGroups, fetchedPars, fetchedRestocks, fetchedHistory, fetchedEmployees, fetchedPrices, fetchedLocations, fetchedCaseSizes, fetchedDailyChecks] = await Promise.all([
                    getInventoryGroups(),
                    getParLevels(),
                    getRestockLevels(),
                    getInventorySubmissions(),
                    getEmployees(),
                    getPrices(),
                    getLocations(),
                    getCaseSizes(),
                    getDailyCheckItems(),
                ]);

                if (fetchedGroups) {
                    setGroups(fetchedGroups);
                } else {
                    await saveInventoryGroups(DEFAULT_ITEMS);
                }
                setPars(fetchedPars);
                setRestocks(fetchedRestocks);
                setHistory(fetchedHistory);
                setEmployees(fetchedEmployees);

                if (Object.keys(fetchedPrices).length > 0) {
                    setPrices(fetchedPrices);
                } else {
                    setPrices(DEFAULT_PRICES);
                    Object.entries(DEFAULT_PRICES).forEach(([name, price]) => savePrice(name, price).catch(console.error));
                }
                if (Object.keys(fetchedLocations).length > 0) {
                    setLocations(fetchedLocations);
                } else {
                    setLocations(DEFAULT_LOCATIONS);
                    Object.entries(DEFAULT_LOCATIONS).forEach(([name, loc]) => saveLocation(name, loc).catch(console.error));
                }

                setCaseSizes(fetchedCaseSizes);
                setDailyChecks(fetchedDailyChecks);

                // Restore session
                try {
                    const session = JSON.parse(sessionStorage.getItem('inventory_session') || 'null');
                    if (session?.id) {
                        setCurrentUser(session);
                        setEmployeeName(session.name);
                    }
                } catch (_) {}

                // Draft stays in localStorage (per-session)
                const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
                if (draft) {
                    if (draft.counts) {
                        setCounts(draft.counts);
                        // Derive caseCounts from saved totals + loaded case sizes
                        const derived = {};
                        Object.entries(draft.counts).forEach(([name, total]) => {
                            const cs = fetchedCaseSizes[name];
                            if (cs > 1) derived[name] = { cases: Math.floor(total / cs), units: total % cs };
                        });
                        setCaseCounts(derived);
                    }
                    if (draft.statuses) setStatuses(draft.statuses);
                    if (draft.notes)    setNotes(draft.notes);
                }

                const savedLastCounts = JSON.parse(localStorage.getItem(LAST_COUNTS_KEY) || 'null');
                if (savedLastCounts) setLastCounts(savedLastCounts);

                const savedUnits = JSON.parse(localStorage.getItem(UNITS_KEY) || 'null');
                if (savedUnits) setUnits(savedUnits);
                const savedUnitTypes = JSON.parse(localStorage.getItem(UNIT_TYPES_KEY) || 'null');
                if (savedUnitTypes) setUnitTypes(savedUnitTypes);
            } catch (err) {
                console.error('Failed to load inventory from Supabase:', err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const handleGroupsChange = (next) => {
        setGroups(next);
        saveInventoryGroups(next).catch(console.error);
    };

    // ── Auth ─────────────────────────────────────────────────────────────────
    const handlePinSubmit = async () => {
        if (!pinEmployee) { setPinError('Select your name.'); return; }
        if (!pinInput)    { setPinError('Enter your PIN.'); return; }
        setPinLoading(true); setPinError('');
        const user = await verifyPin(pinEmployee, pinInput);
        if (!user) { setPinError('Incorrect PIN. Try again.'); setPinLoading(false); return; }
        sessionStorage.setItem('inventory_session', JSON.stringify(user));
        setCurrentUser(user);
        setEmployeeName(user.name);
        setPinLoading(false);
    };

    const handleSignOut = () => {
        sessionStorage.removeItem('inventory_session');
        setCurrentUser(null);
        setEmployeeName('');
        setPinEmployee('');
        setPinInput('');
    };

    // ── Employee management (admin) ───────────────────────────────────────────
    const handleCreateEmployee = async (name, pin, role) => {
        const created = await createEmployee(name, pin, role);
        setEmployees((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    };

    const handleDeleteEmployee = async (id) => {
        if (!confirm('Delete this employee?')) return;
        await deleteEmployee(id);
        setEmployees((prev) => prev.filter((e) => e.id !== id));
    };

    const handleResetPin = async (id, newPin) => {
        await updateEmployeePin(id, newPin);
    };

    // Auto-save draft (debounced 800ms)
    const saveDraft = useCallback((c, s, name, n) => {
        clearTimeout(draftTimer.current);
        draftTimer.current = setTimeout(() => {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ counts: c, statuses: s, employeeName: name, notes: n }));
            setDraftSaved(true);
            setTimeout(() => setDraftSaved(false), 2000);
        }, 800);
    }, []);

    const handleCountChange = (itemName, value) => {
        const num = Math.max(0, Math.floor(Number(value) || 0));
        setCounts((prev) => {
            const next = { ...prev, [itemName]: num };
            saveDraft(next, statuses, employeeName, notes);
            return next;
        });
    };

    const handleCaseCountChange = (itemName, field, value) => {
        const num = Math.max(0, Math.floor(Number(value) || 0));
        setCaseCounts((prev) => {
            const cur = prev[itemName] || { cases: 0, units: 0 };
            const next = { ...prev, [itemName]: { ...cur, [field]: num } };
            const cs = caseSizes[itemName] ?? 1;
            const total = next[itemName].cases * cs + next[itemName].units;
            setCounts((c) => {
                const nc = { ...c, [itemName]: total };
                saveDraft(nc, statuses, employeeName, notes);
                return nc;
            });
            return next;
        });
    };

    const handleCountKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const all = Array.from(document.querySelectorAll('[data-count-input]'));
            const idx = all.indexOf(e.currentTarget);
            if (idx !== -1 && idx < all.length - 1) {
                all[idx + 1].focus();
                all[idx + 1].select();
            } else {
                e.currentTarget.blur();
            }
        }
    };

    const handleParChange = (itemName, value) => {
        const num = Math.max(0, Math.floor(Number(value) || 0));
        setPars((prev) => {
            const next = { ...prev };
            if (num > 0) { next[itemName] = num; } else { delete next[itemName]; }
            return next;
        });
    };

    const handleRestockChange = (itemName, value) => {
        const num = Math.max(0, Math.floor(Number(value) || 0));
        setRestocks((prev) => {
            const next = { ...prev };
            if (num > 0) { next[itemName] = num; } else { delete next[itemName]; }
            return next;
        });
    };

    const handlePriceChange = (itemName, value) => {
        const num = Math.max(0, parseFloat(value) || 0);
        setPrices((prev) => {
            const next = { ...prev };
            if (num > 0) { next[itemName] = num; } else { delete next[itemName]; }
            return next;
        });
    };

    const handleCaseSizeChange = (itemName, value) => {
        const num = Math.max(0, Math.floor(Number(value) || 0));
        setCaseSizes((prev) => {
            const next = { ...prev };
            if (num > 0) { next[itemName] = num; } else { delete next[itemName]; }
            return next;
        });
    };

    const handleLocationChange = (itemName, value) => {
        setLocations((prev) => {
            const next = { ...prev, [itemName]: value };
            if (!value) delete next[itemName];
            return next;
        });
    };

    const handleSaveManageAll = async ({ pars: pendingPars, restocks: pendingRestocks, prices: pendingPrices, caseSizes: pendingCaseSizes, locations: pendingLocations }) => {
        const saves = [];
        Object.entries(pendingPars).forEach(([name, val]) => saves.push(saveParLevel(name, Math.max(0, Math.floor(Number(val) || 0)))));
        Object.entries(pendingRestocks).forEach(([name, val]) => saves.push(saveRestockLevel(name, Math.max(0, Math.floor(Number(val) || 0)))));
        Object.entries(pendingPrices).forEach(([name, val]) => saves.push(savePrice(name, Math.max(0, parseFloat(val) || 0))));
        Object.entries(pendingCaseSizes).forEach(([name, val]) => saves.push(saveCaseSize(name, Math.max(0, Math.floor(Number(val) || 0)))));
        Object.entries(pendingLocations).forEach(([name, val]) => saves.push(saveLocation(name, val)));
        await Promise.all(saves);
    };

    const handleUnitChange = (itemName, unit) => {
        setUnits((prev) => {
            const next = { ...prev, [itemName]: unit };
            localStorage.setItem(UNITS_KEY, JSON.stringify(next));
            return next;
        });
    };

    const handleDailyCheckToggle = (itemName) => {
        setDailyChecks((prev) => {
            const next = new Set(prev);
            const enabled = !next.has(itemName);
            if (enabled) next.add(itemName); else next.delete(itemName);
            saveDailyCheckItem(itemName, enabled).catch(console.error);
            return next;
        });
    };

    const handleAddUnitType = (type) => {
        const t = type.trim().toLowerCase();
        if (!t) return;
        setUnitTypes((prev) => {
            if (prev.includes(t)) return prev;
            const next = [...prev, t];
            localStorage.setItem(UNIT_TYPES_KEY, JSON.stringify(next));
            return next;
        });
    };

    const handleDeleteUnitType = (type) => {
        setUnitTypes((prev) => {
            const next = prev.filter((t) => t !== type);
            localStorage.setItem(UNIT_TYPES_KEY, JSON.stringify(next));
            return next;
        });
    };

    const handleReset = () => {
        const empty = Object.fromEntries(flatItems.map((i) => [i.name, 0]));
        const emptyS = Object.fromEntries(flatItems.map((i) => [i.name, 'ok']));
        setCounts(empty);
        setStatuses(emptyS);
        setEmployeeName('');
        setNotes('');
        setSearch('');
        localStorage.removeItem(DRAFT_KEY);
    };

    const handleDeleteHistory = (id, submittedAt) => {
        if (id) deleteInventorySubmission(id).catch(console.error);
        setHistory((prev) => prev.filter((e) => (e._id ? e._id !== id : e.submittedAt !== submittedAt)));
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setMessage('');
        const payload = {
            employeeName,
            notes,
            submittedAt: new Date().toISOString(),
            items: flatItems.map((item) => ({
                category: item.category,
                name:     item.name,
                amount:   counts[item.name] || null,
            })),
        };
        try {
            if (WEBHOOK_URL) {
                const res = await fetch(WEBHOOK_URL, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(payload),
                });
                if (!res.ok) throw new Error('Failed to submit inventory.');
            }
            const newId = await saveInventorySubmission(payload);
            setHistory((prev) => [{ ...payload, _id: newId }, ...prev].slice(0, 50));
            // Persist submitted counts so manage tab + shopping list reflect real stock
            localStorage.setItem(LAST_COUNTS_KEY, JSON.stringify(counts));
            setLastCounts(counts);
            setMessage('Submitted successfully.');
            setShowSummary(false);
            handleReset();
        } catch (error) {
            setMessage(error.message || 'Something went wrong.');
            setShowSummary(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmPurchase = async () => {
        setApplyingRestock(true);
        // Merge case-based and unit-based purchases into a single totals map
        const totals = { ...purchasedAmounts };
        Object.entries(purchasedCaseCounts).forEach(([name, { cases, units }]) => {
            const cs = caseSizes[name] ?? 1;
            totals[name] = (cases ?? 0) * cs + (units ?? 0);
        });
        // Compute new stock: current stock (lastCounts) + what was just received
        const newCounts = { ...lastCounts };
        Object.entries(totals).forEach(([name, bought]) => {
            if (bought > 0) newCounts[name] = (newCounts[name] ?? 0) + bought;
        });
        const payload = {
            employeeName: `Restock (${currentUser?.name || 'Admin'})`,
            notes: `Purchase recorded from shopping list${shoppingBaseId ? ' (based on historical count)' : ''}`,
            submittedAt: new Date().toISOString(),
            items: flatItems.map((item) => ({
                category: item.category,
                name:     item.name,
                amount:   newCounts[item.name] ?? null,
            })),
        };
        try {
            const newId = await saveInventorySubmission(payload);
            setHistory((prev) => [{ ...payload, _id: newId }, ...prev].slice(0, 50));
            localStorage.setItem(LAST_COUNTS_KEY, JSON.stringify(newCounts));
            setLastCounts(newCounts);
            setPurchaseMode(false);
            setPurchasedAmounts({});
            setPurchasedCaseCounts({});
            setShoppingBaseId(null);
        } catch (err) {
            alert('Failed to save purchase: ' + err.message);
        } finally {
            setApplyingRestock(false);
        }
    };

    // Derived stats
    const filledCount  = useMemo(() => flatItems.filter((i) => counts[i.name] > 0).length, [flatItems, counts]);
    const progressPct  = flatItems.length ? Math.round((filledCount / flatItems.length) * 100) : 0;

    const filteredGroups = useMemo(() => {
        if (!search.trim()) return groups;
        const q = search.toLowerCase();
        return groups
            .map((g) => ({ ...g, items: g.items.filter((i) => i.toLowerCase().includes(q)) }))
            .filter((g) => g.items.length > 0);
    }, [search, groups]);

    const shoppingBaseCounts = useMemo(() => {
        if (!shoppingBaseId) return lastCounts;
        const sub = history.find((h) => h._id === shoppingBaseId);
        if (!sub) return lastCounts;
        const map = {};
        for (const item of (sub.items || [])) map[item.name] = item.amount ?? 0;
        return map;
    }, [shoppingBaseId, history, lastCounts]);

    const shoppingItems = useMemo(() =>
        flatItems.filter((i) => pars[i.name] > 0 && (shoppingBaseCounts[i.name] ?? 0) < pars[i.name]),
        [flatItems, pars, shoppingBaseCounts]
    );

    const shoppingByStore = useMemo(() => {
        const map = {};
        for (const item of shoppingItems) {
            const store = locations[item.name] || '__none__';
            if (!map[store]) map[store] = [];
            map[store].push(item);
        }
        const order = [...DEFAULT_STORE_NAMES, '__none__'];
        return order.filter((s) => map[s]).map((s) => ({ store: s, items: map[s] }));
    }, [shoppingItems, locations]);

    const visibleShoppingStores = useMemo(() =>
        selectedShoppingStore
            ? shoppingByStore.filter(({ store }) => store === selectedShoppingStore)
            : shoppingByStore,
        [shoppingByStore, selectedShoppingStore]
    );

    const isAdmin = currentUser?.role === 'admin';
    const dailyLowCount = useMemo(() => {
        let low = 0;
        dailyChecks.forEach((name) => {
            const stock = lastCounts[name] ?? 0;
            const par   = pars[name] ?? 1;
            if (stock < par) low++;
        });
        return low;
    }, [dailyChecks, lastCounts, pars]);

    const tabs = [
        { key: 'daily',     label: `Daily Check${dailyLowCount > 0 ? ` ⚠ ${dailyLowCount}` : ''}` },
        { key: 'checklist', label: 'Checklist' },
        { key: 'stock',     label: 'Current Stock' },
        ...(isAdmin ? [
            { key: 'shopping', label: `Shopping List${shoppingItems.length > 0 ? ` (${shoppingItems.length})` : ''}` },
            { key: 'history',  label: `History${history.length > 0 ? ` (${history.length})` : ''}` },
        ] : []),
        { key: 'manage',    label: 'Manage Items' },
        ...(isAdmin ? [{ key: 'employees', label: 'Employees' }] : []),
    ];

    if (isLoading) {
        return (
            <main className='flex min-h-screen items-center justify-center bg-gray-50'>
                <div className='text-center'>
                    <div className='mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-black' />
                    <p className='text-sm text-gray-500'>Loading inventory…</p>
                </div>
            </main>
        );
    }

    if (!currentUser) {
        return (
            <main className='flex min-h-screen items-center justify-center bg-gray-50 p-4'>
                <div className='w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm'>
                    <div className='mb-6 text-center'>
                        <h1 className='text-2xl font-bold'>Inventory</h1>
                        <p className='mt-1 text-sm text-gray-500'>The Moon Tea · Palmhurst, TX</p>
                    </div>
                    <div className='space-y-4'>
                        <div>
                            <label className='mb-1 block text-sm font-medium'>Your name</label>
                            <select
                                value={pinEmployee}
                                onChange={(e) => setPinEmployee(e.target.value)}
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black'
                            >
                                <option value=''>Select employee…</option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.id}>{e.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className='mb-1 block text-sm font-medium'>PIN</label>
                            <input
                                type='password' inputMode='numeric' maxLength={6}
                                value={pinInput}
                                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                                onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
                                placeholder='••••'
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black'
                            />
                        </div>
                        {pinError && <p className='text-xs text-red-500'>{pinError}</p>}
                        <button
                            type='button'
                            onClick={handlePinSubmit}
                            disabled={pinLoading}
                            className='w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white disabled:opacity-50'
                        >
                            {pinLoading ? 'Verifying…' : 'Sign In'}
                        </button>
                        {employees.length === 0 && (
                            <p className='text-center text-xs text-gray-400'>No employees set up yet. Ask an admin to create employee profiles in Supabase.</p>
                        )}
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className='min-h-screen bg-gray-50'>
            {/* Header */}
            <div className='border-b border-gray-200 bg-white'>
                {/* Row 1: title + user */}
                <div className='flex items-center justify-between px-4 py-3 sm:px-6'>
                    <div>
                        <Link href='/' className='text-xl font-bold sm:text-2xl hover:opacity-70 transition-opacity'>Inventory</Link>
                        <p className='text-xs text-gray-500 sm:text-sm'>The Moon Tea · Palmhurst, TX</p>
                    </div>
                    <div className='text-right'>
                        <p className='text-sm font-medium'>{currentUser.name}</p>
                        <button type='button' onClick={handleSignOut} className='text-xs text-gray-400 hover:text-gray-600'>Sign out</button>
                    </div>
                </div>
                {/* Row 2: tabs — horizontally scrollable on mobile */}
                <div className='overflow-x-auto border-t border-gray-100 px-2 sm:px-6'>
                    <div className='flex gap-0.5 py-1.5 sm:gap-1'>
                        {tabs.map((t) => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition-colors sm:px-3 sm:py-1.5 sm:text-sm ${tab === t.key ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className='mx-auto max-w-4xl p-3 sm:p-6'>

                {/* ── Checklist Tab ── */}
                {/* ── Daily Check Tab ── */}
                {tab === 'daily' && (
                    <div className='space-y-4'>
                        {/* Header */}
                        <div className='rounded-xl bg-white p-4 shadow-sm'>
                            <div className='flex items-center justify-between'>
                                <div>
                                    <h2 className='text-base font-semibold'>Daily Check</h2>
                                    <p className='text-xs text-gray-400 mt-0.5'>
                                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                    </p>
                                </div>
                                <div className='text-right'>
                                    {dailyChecks.size === 0 ? (
                                        <p className='text-xs text-gray-400'>No items tagged yet.<br/>Tag items in Manage Items tab.</p>
                                    ) : (
                                        <>
                                            <p className='text-2xl font-bold text-red-500'>{dailyLowCount}</p>
                                            <p className='text-xs text-gray-400'>items low / out of {dailyChecks.size}</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {dailyChecks.size === 0 ? (
                            <div className='rounded-xl bg-white p-8 shadow-sm text-center'>
                                <p className='text-gray-400 text-sm'>Go to <strong>Manage Items</strong> and tap the ☀ icon next to items you want to check daily.</p>
                            </div>
                        ) : (
                            groups.map((group) => {
                                const dayItems = group.items.filter((item) => dailyChecks.has(item));
                                if (dayItems.length === 0) return null;
                                return (
                                    <section key={group.category} className='rounded-xl bg-white shadow-sm overflow-hidden'>
                                        <div className='px-4 py-2.5 border-b border-gray-100'>
                                            <h3 className='text-xs font-semibold uppercase tracking-wide text-gray-500'>{group.category}</h3>
                                        </div>
                                        <ul className='divide-y divide-gray-50'>
                                            {dayItems.map((item) => {
                                                const stock = lastCounts[item] ?? 0;
                                                const par   = pars[item] ?? 1;
                                                const isOut = stock === 0;
                                                const isLow = !isOut && stock < par;
                                                const isOk  = stock >= par;
                                                return (
                                                    <li key={item} className='flex items-center gap-3 px-4 py-3'>
                                                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isOut ? 'bg-red-500' : isLow ? 'bg-yellow-400' : 'bg-green-500'}`} />
                                                        <span className='flex-1 text-sm'>{item}</span>
                                                        <div className='flex items-center gap-2 text-xs'>
                                                            <span className={`font-semibold ${isOut ? 'text-red-500' : isLow ? 'text-yellow-600' : 'text-green-600'}`}>
                                                                {stock}
                                                            </span>
                                                            <span className='text-gray-300'>/</span>
                                                            <span className='text-gray-400'>{par} par</span>
                                                            <span className={`rounded-full px-2 py-0.5 font-medium ${isOut ? 'bg-red-100 text-red-600' : isLow ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                                                                {isOut ? 'OUT' : isLow ? 'LOW' : 'OK'}
                                                            </span>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </section>
                                );
                            })
                        )}

                        {dailyChecks.size > 0 && (
                            <p className='text-center text-xs text-gray-400 pb-2'>
                                Stock levels are from the last submitted count. Submit a new count to update.
                            </p>
                        )}
                    </div>
                )}

                {tab === 'checklist' && (
                    <div className='space-y-5'>
                        <div className='rounded-xl bg-white p-4 shadow-sm'>
                            <div className='grid gap-4 md:grid-cols-2'>
                                <div>
                                    <label className='mb-1 block text-sm font-medium'>Employee Name</label>
                                    <select
                                        value={employeeName}
                                        onChange={(e) => { setEmployeeName(e.target.value); saveDraft(counts, statuses, e.target.value, notes); }}
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-black'
                                    >
                                        {employees.map((e) => (
                                            <option key={e.id} value={e.name}>{e.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className='mb-1 block text-sm font-medium'>Notes</label>
                                    <input
                                        type='text'
                                        value={notes}
                                        onChange={(e) => { setNotes(e.target.value); saveDraft(counts, statuses, employeeName, e.target.value); }}
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-black'
                                        placeholder='Optional notes'
                                    />
                                </div>
                            </div>
                        </div>

                        <div className='rounded-xl bg-white p-4 shadow-sm'>
                            <div className='mb-2 flex items-center justify-between text-sm'>
                                <div className='flex items-center gap-3'>
                                    <span className='font-medium'>{filledCount} / {flatItems.length} filled</span>
                                    {draftSaved && <span className='text-xs text-gray-400'>Draft saved</span>}
                                </div>
                                <div className='flex gap-2'>
                                    <button type='button' onClick={() => exportCSV(groups, counts, employeeName)} className='rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50'>
                                        Export CSV
                                    </button>
                                    <button type='button' onClick={handleReset} className='rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50'>
                                        Reset
                                    </button>
                                </div>
                            </div>
                            <div className='h-2 w-full overflow-hidden rounded-full bg-gray-100'>
                                <div className='h-full rounded-full bg-green-500 transition-all duration-300' style={{ width: `${progressPct}%` }} />
                            </div>
                        </div>

                        <input
                            type='text'
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className='w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm outline-none focus:border-black'
                            placeholder='Search items…'
                        />

                        {filteredGroups.map((group) => {
                            const isCollapsed = collapsed[group.category] && !search.trim();
                            const groupFilled = group.items.filter((i) => counts[i] > 0).length;
                            return (
                                <section key={group.category} className='rounded-xl bg-white shadow-sm'>
                                    <button
                                        type='button'
                                        onClick={() => setCollapsed((p) => ({ ...p, [group.category]: !p[group.category] }))}
                                        className='flex w-full items-center justify-between px-4 py-3 text-left'
                                    >
                                        <span className='font-semibold'>{group.category}</span>
                                        <span className='flex items-center gap-1.5 text-sm'>
                                            {groupFilled > 0 && <span className='rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'>{groupFilled}/{group.items.length}</span>}
                                            <span className='text-gray-400'>{isCollapsed ? '▸' : '▾'}</span>
                                        </span>
                                    </button>
                                    {!isCollapsed && (
                                        <div className='grid gap-3 border-t border-gray-100 p-3 sm:gap-4 sm:p-4 md:grid-cols-2 lg:grid-cols-3'>
                                            {group.items.map((item) => {
                                                const cs = caseSizes[item];
                                                const hasCount = (counts[item] ?? 0) > 0;
                                                const borderCls = hasCount ? 'border-green-400 bg-green-50' : 'border-gray-300';
                                                return (
                                                <div key={item}>
                                                    <label className='mb-1 block text-sm font-medium leading-tight'>
                                                        {item}
                                                        {cs > 1 && <span className='ml-1.5 text-xs font-normal text-gray-400'>1 case = {cs} units</span>}
                                                    </label>
                                                    {cs > 1 ? (
                                                        <div className='flex gap-1.5'>
                                                            <div className='flex flex-1 flex-col gap-0.5'>
                                                                <input
                                                                    type='text' inputMode='numeric' pattern='[0-9]*'
                                                                    data-count-input={item}
                                                                    value={caseCounts[item]?.cases ?? 0}
                                                                    onChange={(e) => handleCaseCountChange(item, 'cases', e.target.value)}
                                                                    onKeyDown={handleCountKeyDown}
                                                                    onFocus={(e) => e.target.select()}
                                                                    className={`w-full rounded-lg border px-3 py-2 outline-none focus:border-black ${borderCls}`}
                                                                />
                                                                <span className='text-center text-xs text-gray-400'>cases</span>
                                                            </div>
                                                            <span className='mt-2.5 text-gray-400'>+</span>
                                                            <div className='flex flex-1 flex-col gap-0.5'>
                                                                <input
                                                                    type='text' inputMode='numeric' pattern='[0-9]*'
                                                                    value={caseCounts[item]?.units ?? 0}
                                                                    onChange={(e) => handleCaseCountChange(item, 'units', e.target.value)}
                                                                    onFocus={(e) => e.target.select()}
                                                                    className={`w-full rounded-lg border px-3 py-2 outline-none focus:border-black ${borderCls}`}
                                                                />
                                                                <span className='text-center text-xs text-gray-400'>units</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type='text' inputMode='numeric' pattern='[0-9]*'
                                                            data-count-input={item}
                                                            value={counts[item] ?? 0}
                                                            onChange={(e) => handleCountChange(item, e.target.value)}
                                                            onKeyDown={handleCountKeyDown}
                                                            onFocus={(e) => e.target.select()}
                                                            className={`w-full rounded-lg border px-3 py-2 outline-none focus:border-black ${borderCls}`}
                                                        />
                                                    )}
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            );
                        })}

                        <div className='flex items-center gap-3 pt-2'>
                            <button
                                type='button'
                                disabled={!employeeName.trim()}
                                onClick={() => { setMessage(''); setShowSummary(true); }}
                                className='w-full rounded-lg bg-black px-5 py-2.5 font-medium text-white disabled:opacity-50 sm:w-auto'
                            >
                                Review & Submit
                            </button>
                            {message && (
                                <p className={`text-sm ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{message}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Current Stock Tab ── */}
                {tab === 'stock' && (
                    <div className='space-y-4'>
                        {Object.keys(lastCounts).length === 0 ? (
                            <div className='rounded-xl bg-white p-10 text-center shadow-sm'>
                                <p className='text-2xl'>📦</p>
                                <p className='mt-2 font-medium text-gray-700'>No stock data yet.</p>
                                <p className='mt-1 text-sm text-gray-400'>Submit a checklist to see current stock levels here.</p>
                            </div>
                        ) : (
                            groups.map((group) => {
                                const itemsInGroup = group.items.filter((item) => lastCounts[item] !== undefined || true);
                                return (
                                    <section key={group.category} className='rounded-xl bg-white shadow-sm'>
                                        <div className='border-b border-gray-100 px-4 py-3'>
                                            <span className='font-semibold'>{group.category}</span>
                                        </div>
                                        <div className='divide-y divide-gray-50'>
                                            {itemsInGroup.map((item) => {
                                                const stock    = lastCounts[item];
                                                const par      = pars[item] ?? 1;
                                                const restock  = restocks[item];
                                                const isOut    = stock === undefined || stock === 0;
                                                const isLow    = !isOut && stock < par;
                                                const needBuy  = (isOut || isLow) && restock;
                                                return (
                                                    <div key={item} className='flex items-center justify-between px-4 py-3'>
                                                        <div>
                                                            <p className='text-sm font-medium'>{item}</p>
                                                            <p className='text-xs text-gray-400'>par {par}{restock ? ` · restock ${restock}` : ''}</p>
                                                        </div>
                                                        <div className='flex items-center gap-2'>
                                                            <span className='text-sm font-semibold tabular-nums text-gray-700'>{stock ?? '—'}</span>
                                                            {isOut  && <span className='rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700'>Out</span>}
                                                            {isLow  && <span className='rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700'>Low</span>}
                                                            {!isOut && !isLow && <span className='rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'>OK</span>}
                                                            {needBuy && <span className='rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700'>Buy {restock}</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                );
                            })
                        )}
                    </div>
                )}

                {/* ── Shopping List Tab ── */}
                {tab === 'shopping' && (
                    <div className='space-y-4'>
                        {/* Store filter + Cases/Units toggle */}
                        <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'>
                            <div className='flex flex-wrap gap-2'>
                                <button
                                    type='button'
                                    onClick={() => setSelectedShoppingStore(null)}
                                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedShoppingStore === null ? 'bg-black text-white' : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'}`}
                                >
                                    All Stores
                                </button>
                                {shoppingByStore.map(({ store }) => (
                                    <button
                                        key={store}
                                        type='button'
                                        onClick={() => setSelectedShoppingStore(store === selectedShoppingStore ? null : store)}
                                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedShoppingStore === store ? 'bg-black text-white' : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'}`}
                                    >
                                        {store === '__none__' ? 'No Store Set' : store}
                                    </button>
                                ))}
                            </div>
                            <div className='flex rounded-lg border border-gray-200 bg-white text-xs font-medium overflow-hidden'>
                                <button type='button' onClick={() => setBuyInCases(true)}
                                    className={`px-3 py-1.5 transition-colors ${buyInCases ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                                    By Case
                                </button>
                                <button type='button' onClick={() => setBuyInCases(false)}
                                    className={`px-3 py-1.5 transition-colors ${!buyInCases ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                                    By Unit
                                </button>
                            </div>
                        </div>
                        {/* Submission selector */}
                        <div className='flex items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-sm'>
                            <span className='shrink-0 text-xs font-medium text-gray-500'>Based on count:</span>
                            <select
                                value={shoppingBaseId ?? ''}
                                onChange={(e) => { setShoppingBaseId(e.target.value || null); setPurchaseMode(false); }}
                                className='flex-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 outline-none focus:border-black'
                            >
                                <option value=''>Most recent submission</option>
                                {history.map((h) => (
                                    <option key={h._id} value={h._id}>
                                        {h.employeeName} — {new Date(h.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {shoppingItems.length === 0 ? (
                            <div className='rounded-xl bg-white p-10 text-center shadow-sm'>
                                <p className='text-2xl'>✓</p>
                                <p className='mt-2 font-medium text-gray-700'>All good! Nothing needs ordering.</p>
                                <p className='mt-1 text-sm text-gray-400'>Items below their par level after submission will appear here.</p>
                            </div>
                        ) : (
                            <>
                                <div className='flex flex-wrap items-center justify-between gap-2'>
                                    <p className='text-sm text-gray-500'>
                                        {visibleShoppingStores.reduce((s, { items }) => s + items.length, 0)} item{visibleShoppingStores.reduce((s, { items }) => s + items.length, 0) !== 1 ? 's' : ''} to order
                                        {selectedShoppingStore ? ` at ${selectedShoppingStore === '__none__' ? 'No Store Set' : selectedShoppingStore}` : ''}
                                    </p>
                                    <div className='flex gap-2'>
                                        <button
                                            type='button'
                                            onClick={() => {
                                                const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                                const lines = [`SHOPPING LIST — ${date}`, ''];
                                                visibleShoppingStores.forEach(({ store, items: storeItems }) => {
                                                    const total = storeItems.reduce((sum, i) => {
                                                        const price = prices[i.name];
                                                        const short = Math.max(0, (pars[i.name] ?? 0) - (shoppingBaseCounts[i.name] ?? 0));
                                                        return price ? sum + price * short : sum;
                                                    }, 0);
                                                    lines.push(`${store === '__none__' ? 'No Store Set' : store}${total > 0 ? `  (~$${total.toFixed(2)})` : ''}`);
                                                    storeItems.forEach((i) => {
                                                        const have  = shoppingBaseCounts[i.name] ?? 0;
                                                        const par   = pars[i.name];
                                                        const short = Math.max(0, par - have);
                                                        const cs    = caseSizes[i.name];
                                                        const price = prices[i.name];
                                                        const buyStr = (buyInCases && cs > 1)
                                                            ? `${Math.ceil(short / cs)} case${Math.ceil(short / cs) !== 1 ? 's' : ''} (${short} units)`
                                                            : `${short} units`;
                                                        const lineTotal = price ? ` = $${(price * short).toFixed(2)}` : '';
                                                        const priceStr  = price ? `  @ $${price.toFixed(2)}/unit` : '';
                                                        lines.push(`  • ${i.name}   have ${have}, need ${par}, buy ${buyStr}${priceStr}${lineTotal}`);
                                                    });
                                                    lines.push('');
                                                });
                                                navigator.clipboard.writeText(lines.join('\n'));
                                            }}
                                            className='rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50'
                                        >
                                            Copy Text
                                        </button>
                                        <button
                                            type='button'
                                            onClick={() => {
                                                const rows = [['Store', 'Category', 'Item', 'Have', 'Need (Par)', 'Buy (Units)', 'Buy (Cases)', 'Case Size', 'Unit Price', 'Line Total']];
                                                visibleShoppingStores.forEach(({ store, items: storeItems }) => {
                                                    storeItems.forEach((i) => {
                                                        const have    = shoppingBaseCounts[i.name] ?? 0;
                                                        const par     = pars[i.name];
                                                        const short   = Math.max(0, par - have);
                                                        const cs      = caseSizes[i.name] ?? '';
                                                        const buyCase = cs ? Math.ceil(short / cs) : '';
                                                        const price   = prices[i.name] ?? '';
                                                        const lineTotal = price ? (price * short).toFixed(2) : '';
                                                        rows.push([store === '__none__' ? '' : store, i.category, i.name, have, par, short, buyCase, cs, price, lineTotal]);
                                                    });
                                                });
                                                const csv  = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                                                const blob = new Blob([csv], { type: 'text/csv' });
                                                const url  = URL.createObjectURL(blob);
                                                const a    = document.createElement('a');
                                                a.href = url; a.download = `shopping_list_${new Date().toISOString().slice(0, 10)}.csv`;
                                                a.click(); URL.revokeObjectURL(url);
                                            }}
                                            className='rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white'
                                        >
                                            Export CSV
                                        </button>
                                        <button
                                            type='button'
                                            onClick={() => {
                                                if (!purchaseMode) {
                                                    const initUnits = {};
                                                    const initCases = {};
                                                    shoppingItems.forEach((i) => {
                                                        const short = Math.max(0, (pars[i.name] ?? 0) - (shoppingBaseCounts[i.name] ?? 0));
                                                        const cs = caseSizes[i.name];
                                                        if (buyInCases && cs > 1) {
                                                            initCases[i.name] = { cases: Math.ceil(short / cs), units: 0 };
                                                        } else {
                                                            initUnits[i.name] = short;
                                                        }
                                                    });
                                                    setPurchasedAmounts(initUnits);
                                                    setPurchasedCaseCounts(initCases);
                                                } else {
                                                    setPurchasedAmounts({});
                                                    setPurchasedCaseCounts({});
                                                }
                                                setPurchaseMode((v) => !v);
                                            }}
                                            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${purchaseMode ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'border border-green-600 text-green-700 hover:bg-green-50'}`}
                                        >
                                            {purchaseMode ? 'Cancel' : 'Enter Purchase'}
                                        </button>
                                    </div>
                                </div>
                                {visibleShoppingStores.map(({ store, items: storeItems }) => {
                                    const storeTotal = storeItems.reduce((sum, i) => {
                                        const price = prices[i.name];
                                        const short = Math.max(0, (pars[i.name] ?? 0) - (shoppingBaseCounts[i.name] ?? 0));
                                        return price ? sum + price * short : sum;
                                    }, 0);
                                    return (
                                        <section key={store} className='rounded-xl bg-white shadow-sm'>
                                            <div className='flex items-center justify-between border-b border-gray-100 px-4 py-3'>
                                                <div>
                                                    <span className='font-semibold'>{store === '__none__' ? 'No Store Set' : store}</span>
                                                    <span className='ml-2 text-xs text-gray-400'>{storeItems.length} item{storeItems.length !== 1 ? 's' : ''}</span>
                                                </div>
                                                {storeTotal > 0 && (
                                                    <span className='text-sm font-medium text-gray-700'>~${storeTotal.toFixed(2)}</span>
                                                )}
                                            </div>
                                            <div className='divide-y divide-gray-50'>
                                                {storeItems.map((i) => {
                                                    const have  = shoppingBaseCounts[i.name] ?? 0;
                                                    const par   = pars[i.name];
                                                    const short = Math.max(0, par - have);
                                                    const price = prices[i.name];
                                                    const cs    = caseSizes[i.name];
                                                    const casesToBuy = cs > 1 ? Math.ceil(short / cs) : null;
                                                    return (
                                                        <div key={i.name} className='px-4 py-3'>
                                                            {/* Top row: item info + price/badge */}
                                                            <div className='flex items-start justify-between gap-2'>
                                                                <div className='min-w-0 flex-1'>
                                                                    <p className='text-sm font-medium'>{i.name}</p>
                                                                    <p className='text-xs text-orange-500'>
                                                                        have {have} · need {par} · buy{' '}
                                                                        {buyInCases && casesToBuy !== null
                                                                            ? <><strong>{casesToBuy} case{casesToBuy !== 1 ? 's' : ''}</strong><span className='text-orange-400'> ({short} units)</span></>
                                                                            : <strong>{short} units</strong>}
                                                                        {price ? ` · $${price.toFixed(2)}/unit` : ''}
                                                                    </p>
                                                                    <p className='text-xs text-gray-400'>
                                                                        {i.category}
                                                                        {cs > 1 && <span className='ml-1.5'>· 1 case = {cs} units</span>}
                                                                    </p>
                                                                </div>
                                                                <div className='flex shrink-0 flex-col items-end gap-1'>
                                                                    {price && short > 0 && (
                                                                        <span className='text-sm font-semibold text-gray-700'>${(price * short).toFixed(2)}</span>
                                                                    )}
                                                                    <span className='rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700'>Below par</span>
                                                                </div>
                                                            </div>
                                                            {/* Purchase inputs — full-width row below on mobile */}
                                                            {purchaseMode && (
                                                                <div className='mt-2 flex items-center gap-2'>
                                                                    <span className='text-xs text-gray-400'>Received:</span>
                                                                    {buyInCases && cs > 1 ? (
                                                                        <div className='flex items-end gap-1'>
                                                                            <div className='flex flex-col items-center gap-0.5'>
                                                                                <input
                                                                                    type='text' inputMode='numeric' pattern='[0-9]*'
                                                                                    value={purchasedCaseCounts[i.name]?.cases ?? 0}
                                                                                    onChange={(e) => setPurchasedCaseCounts((p) => ({ ...p, [i.name]: { ...(p[i.name] || { cases: 0, units: 0 }), cases: Math.max(0, Math.floor(Number(e.target.value) || 0)) } }))}
                                                                                    onFocus={(e) => e.target.select()}
                                                                                    className='w-16 rounded border border-green-300 bg-green-50 px-2 py-1.5 text-center text-sm outline-none focus:border-green-600'
                                                                                />
                                                                                <span className='text-xs text-gray-400'>cases</span>
                                                                            </div>
                                                                            <span className='mb-4 text-xs text-gray-400'>+</span>
                                                                            <div className='flex flex-col items-center gap-0.5'>
                                                                                <input
                                                                                    type='text' inputMode='numeric' pattern='[0-9]*'
                                                                                    value={purchasedCaseCounts[i.name]?.units ?? 0}
                                                                                    onChange={(e) => setPurchasedCaseCounts((p) => ({ ...p, [i.name]: { ...(p[i.name] || { cases: 0, units: 0 }), units: Math.max(0, Math.floor(Number(e.target.value) || 0)) } }))}
                                                                                    onFocus={(e) => e.target.select()}
                                                                                    className='w-16 rounded border border-green-300 bg-green-50 px-2 py-1.5 text-center text-sm outline-none focus:border-green-600'
                                                                                />
                                                                                <span className='text-xs text-gray-400'>units</span>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className='flex flex-col items-start gap-0.5'>
                                                                            <input
                                                                                type='text' inputMode='numeric' pattern='[0-9]*'
                                                                                value={purchasedAmounts[i.name] ?? 0}
                                                                                onChange={(e) => setPurchasedAmounts((p) => ({ ...p, [i.name]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                                                                                onFocus={(e) => e.target.select()}
                                                                                className='w-20 rounded border border-green-300 bg-green-50 px-2 py-1.5 text-center text-sm outline-none focus:border-green-600'
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    );
                                })}
                                {purchaseMode && (() => {
                                    // Compute total units received per item (merging case counts + unit counts)
                                    const receivedTotals = {};
                                    shoppingItems.forEach((i) => {
                                        const cs = caseSizes[i.name];
                                        if (buyInCases && cs > 1) {
                                            const cc = purchasedCaseCounts[i.name] || { cases: 0, units: 0 };
                                            receivedTotals[i.name] = (cc.cases ?? 0) * cs + (cc.units ?? 0);
                                        } else {
                                            receivedTotals[i.name] = purchasedAmounts[i.name] ?? 0;
                                        }
                                    });
                                    const hasAny = shoppingItems.some((i) => receivedTotals[i.name] > 0);
                                    return (
                                    <div className='rounded-xl border-2 border-green-200 bg-green-50 p-4'>
                                        <p className='mb-1 text-sm font-semibold text-green-800'>Confirm Purchase</p>
                                        <p className='mb-3 text-xs text-green-700'>
                                            Stock will be updated: current level + received amount. Saved as a new submission.
                                        </p>
                                        <div className='mb-3 space-y-1 text-xs text-green-900'>
                                            {shoppingItems.filter((i) => receivedTotals[i.name] > 0).map((i) => {
                                                const current = lastCounts[i.name] ?? 0;
                                                const received = receivedTotals[i.name];
                                                const cs = caseSizes[i.name];
                                                const caseStr = (buyInCases && cs > 1)
                                                    ? ` (${purchasedCaseCounts[i.name]?.cases ?? 0} cases + ${purchasedCaseCounts[i.name]?.units ?? 0} units)`
                                                    : '';
                                                return (
                                                    <div key={i.name} className='flex justify-between gap-4'>
                                                        <span className='truncate'>{i.name}</span>
                                                        <span className='shrink-0 tabular-nums'>
                                                            {current} + {received}{caseStr} → <strong>{current + received}</strong>
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                            {!hasAny && <p className='text-green-600'>No amounts entered yet.</p>}
                                        </div>
                                        <button
                                            type='button'
                                            onClick={handleConfirmPurchase}
                                            disabled={!hasAny || applyingRestock}
                                            className='rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-green-700'
                                        >
                                            {applyingRestock ? 'Saving…' : 'Save & Update Stock'}
                                        </button>
                                    </div>
                                    );
                                })()}
                            </>
                        )}
                    </div>
                )}

                {/* ── History Tab ── */}
                {tab === 'history' && (
                    <div className='space-y-3'>
                        {history.length === 0 ? (
                            <div className='rounded-xl bg-white p-10 text-center text-gray-400 shadow-sm'>No submissions yet.</div>
                        ) : (
                            <>
                                <div className='flex items-center justify-between'>
                                    <p className='text-sm text-gray-500'>{history.length} submission{history.length !== 1 ? 's' : ''}</p>
                                    <button
                                        type='button'
                                        onClick={() => { if (confirm('Clear all history?')) { clearInventorySubmissions().catch(console.error); setHistory([]); } }}
                                        className='text-xs text-red-400 hover:text-red-600'
                                    >
                                        Clear all
                                    </button>
                                </div>
                                {history.map((entry) => (
                                    <HistoryEntry key={entry._id || entry.submittedAt} entry={entry} onDelete={handleDeleteHistory} />
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* ── Manage Tab ── */}
                {tab === 'manage' && (
                    <ManageTab
                        groups={groups} onChange={handleGroupsChange}
                        pars={pars} onParChange={handleParChange}
                        restocks={restocks} onRestockChange={handleRestockChange}
                        units={units} onUnitChange={handleUnitChange}
                        unitTypes={unitTypes} onAddUnitType={handleAddUnitType} onDeleteUnitType={handleDeleteUnitType}
                        prices={prices} onPriceChange={handlePriceChange}
                        locations={locations} onLocationChange={handleLocationChange}
                        caseSizes={caseSizes} onCaseSizeChange={handleCaseSizeChange}
                        onSaveAll={handleSaveManageAll}
                        dailyChecks={dailyChecks} onDailyCheckToggle={handleDailyCheckToggle}
                    />
                )}

                {/* ── Employees Tab (admin) ── */}
                {tab === 'employees' && currentUser?.role === 'admin' && (
                    <EmployeesTab
                        employees={employees}
                        currentUser={currentUser}
                        onAdd={handleCreateEmployee}
                        onDelete={handleDeleteEmployee}
                        onResetPin={handleResetPin}
                    />
                )}
            </div>

            {showSummary && (
                <SummaryModal
                    flatItems={flatItems}
                    counts={counts}
                    pars={pars}
                    employeeName={employeeName}
                    notes={notes}
                    onConfirm={handleSubmit}
                    onCancel={() => setShowSummary(false)}
                    submitting={submitting}
                />
            )}
        </main>
    );
}
