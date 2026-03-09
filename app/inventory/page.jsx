'use client';

import { useMemo, useState } from 'react';

const inventoryItems = [
    {
        category: 'Cleaning Supplies',
        items: [
            'Poly Bags',
            'T-shirt Bags',
            'Gloves (LG / MD)',
            'Degreaser 1 Gal',
            'Dish Soap',
            'Scrub Daddy',
            '33-Gallon Trash Bag',
            '13-Gallon Kitchen Trash Bag',
            'Lysol Disinfecting Wipes',
            'Hand Soap',
        ],
    },

    {
        category: 'Dairy & Creamers',
        items: [
            'Whole Milk',
            'Eggs',
            'Sweetened Condensed Milk 14oz',
            'Milk Evaporated 12oz',
            'Heavy Cream (if purchased)',
            'Sweetened Condensed Milk',
            'Almond Milk',
            'Oat Milk',
        ],
    },

    {
        category: 'Drinks',
        items: [
            'Drinking Water',
            'Coke',
            'Diet Coke',
            'Spirte',
            'Sugar Free Dr Pepper',
        ],
    },

    {
        category: 'Dry Ingredients',
        items: [
            'All purpose flour',
            'KIKO Bread Crumbs',
            'Yeast Instant Dry',
            'Cornstarch 3 lbs',
            'Sugar Gran Nat 50#',
            'Kosher Salt',
            'Tajin',
            'Samyang Buldak Ramen Carbonara',
            'Organic Brown Sugar',
        ],
    },

    {
        category: 'Fruits & Produce',
        items: [
            'Bananas',
            'Strawberries',
            'Pineapple',
            'Lemons',
            'Limes',
            'Oranges',
            'Apples',
            'Cantaloupe',
            'Onions',
            'Corn',
            'Mango Chunk (IQF)',
            'Mango Dice (IQF)',
            'Lemons 3 lb',
            'Limes 3 lb',
            'Garlic (bulk bag)',
            'Organic Coconut Water',
            'Seedless Watermelon',
            'Sliced Peaches',
            'Pure Vanilla Extract',
            'Lotus Biscoff Creamy Cookie Butter Spread Pail 6.6 lb.',
            'Lotus Biscoff Cookies 8.8 oz. - 10/Case',
        ],
    },

    {
        category: 'Meat & Cheese',
        items: [
            'Cotija cheese',
            'Chicken breast (bulk)',
            'Mascarpone 1 lb',
            'Mozzarella Bulk (~49lb)',
            'Nacho Cheese Sauce',
            'KS HOT DOGS',
            'Laughing Cow Light Wedges',
            'Kraft Grated Parmesan Cheese',
        ],
    },

    {
        category: 'Packaging',
        items: [
            'Cup',
            'PP Sealing Film – Good Time Printed',
            'Gallon Plus Freezer Bags',
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
            'Garlic Powder 5#',
            'Onion Powder 5#',
            'OIL CLEAR SOY',
            'Honey Hot Sauce',
            'Sriracha',
            'Heinz Ketchup (3/44oz)',
            'Hellmann’s Mayo (1 gal)',
            'Nutella Tub 6.6#',
            'Hershey Syrup (Jug)',
            'Chamoy',
            'Pink Salt',
        ],
    },

    {
        category: 'Snacks & Desserts',
        items: [
            'French Fry 3/8 Big C',
            'Onion Ring',
            'Oreo 2.5#',
            'OREO',
            'Jif Creamy Peanut Butter',
            'Shin Black',
            'Shin Ramyun Noodles',
        ],
    },

    {
        category: 'Syrups',
        items: [
            'Strawberry Syrup',
            'Mango Syrup',
            'Rose Syrup',
            'Passionfruit Syrup',
            'Peach Syrup',
            'Lychee Syrup',
            'Honeydew Syrup',
            'Pineapple Syrup',
            'Lemon Syrup',
            'Red Guava Syrup',
            'Grape Syrup',
            'Kumquat Syrup',
            'Kiwi Syrup',
            'Banana Syrup',
            'Strawberry Jam',
            'Mango Jam',
            'Passion Fruit Jam',
            'Torani Vanilla',
            'Dark Brown Sugar',
            'Strawberry Syrup, 64oz',
            'Tropical Syrup, 64oz',
        ],
    },

    {
        category: 'Tea & Powders',
        items: [
            'Thai Green Tea (Thumb up brand)',
            'Premium Thai Tea Mix (Cha Tra Mue)',
            'Jade Leaf Culinary Matcha Powder 1 lb. (454g) - 6/Case',
            'Taro Powder | Made in USA | 2.2 lbs',
            'Non-Dairy Creamer',
            'Black Tea',
            'Jasmine Green Tea',
            'Milk Tea',
            'Honeydew',
            'Coconut',
            'Egg Pudding',
        ],
    },

    {
        category: 'Toppings (Boba / Jelly)',
        items: [
            'Rainbow Jelly – BT',
            'Lychee Jelly',
            'Coconut Jelly',
            'Coffee Jelly',
            'Brown Sugar Agar Jelly',
            'Crystal Boba',
            'Strawberry',
            'Mango',
            'Blueberry',
            'Lychee',
            'Kiwi',
            'Peach',
            'Tapioca Pearls (Chewy)',
        ],
    },
];

const WEBHOOK_URL =
    'https://themoontea.app.n8n.cloud/webhook-test/17361f36-bbda-4dfa-92c0-2ce56f972c99';

export default function InventoryPage() {
    const flatItems = useMemo(
        () =>
            inventoryItems.flatMap((group) =>
                group.items.map((item) => ({
                    category: group.category,
                    name: item,
                })),
            ),
        [],
    );

    const initialCounts = useMemo(() => {
        const obj = {};
        flatItems.forEach((item) => {
            obj[item.name] = '0';
        });
        return obj;
    }, [flatItems]);

    const [counts, setCounts] = useState(initialCounts);
    const [employeeName, setEmployeeName] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState('');

    const handleChange = (itemName, value) => {
        const num = Math.max(0, Math.floor(Number(value) || 0));

        setCounts((prev) => ({
            ...prev,
            [itemName]: num,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setMessage('');

        const payload = {
            employeeName,
            notes,
            submittedAt: new Date().toISOString(),
            items: flatItems.map((item) => ({
                category: item.category,
                name: item.name,
                amount:
                    counts[item.name] === '' ? null : Number(counts[item.name]),
            })),
        };

        try {
            const res = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                throw new Error('Failed to submit inventory.');
            }

            setMessage('Inventory submitted successfully.');
            setCounts(initialCounts);
            setEmployeeName('');
            setNotes('');
        } catch (error) {
            setMessage(error.message || 'Something went wrong.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className='min-h-screen bg-gray-50 p-6'>
            <div className='mx-auto max-w-4xl rounded-xl bg-white p-6 shadow'>
                <h1 className='mb-2 text-3xl font-bold'>Inventory Checklist</h1>
                <p className='mb-6 text-sm text-gray-600'>
                    Enter the current amount for each item, then submit to send
                    it to n8n.
                </p>

                <form onSubmit={handleSubmit} className='space-y-6'>
                    <div className='grid gap-4 md:grid-cols-2'>
                        <div>
                            <label className='mb-1 block text-sm font-medium'>
                                Employee Name
                            </label>
                            <input
                                type='text'
                                value={employeeName}
                                onChange={(e) =>
                                    setEmployeeName(e.target.value)
                                }
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-black'
                                placeholder='Enter employee name'
                                required
                            />
                        </div>

                        <div>
                            <label className='mb-1 block text-sm font-medium'>
                                Notes
                            </label>
                            <input
                                type='text'
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-black'
                                placeholder='Optional notes'
                            />
                        </div>
                    </div>

                    {inventoryItems.map((group) => (
                        <section
                            key={group.category}
                            className='rounded-lg border border-gray-200 p-4'
                        >
                            <h2 className='mb-4 text-lg font-semibold'>
                                {group.category}
                            </h2>

                            <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-3'>
                                {group.items.map((item) => (
                                    <div key={item}>
                                        <label className='mb-1 block text-sm font-medium'>
                                            {item}
                                        </label>
                                        <input
                                            type='number'
                                            min='0'
                                            step='1'
                                            inputMode='numeric'
                                            value={counts[item] ?? ''}
                                            onChange={(e) =>
                                                handleChange(
                                                    item,
                                                    e.target.value,
                                                )
                                            }
                                            className='w-full rounded-lg border border-gray-300 px-3 py-2'
                                            placeholder='0'
                                        />
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}

                    <div className='flex items-center gap-3'>
                        <button
                            type='submit'
                            disabled={submitting}
                            className='rounded-lg bg-black px-5 py-2 text-white disabled:opacity-50'
                        >
                            {submitting ? 'Submitting...' : 'Submit Inventory'}
                        </button>

                        {message && (
                            <p className='text-sm text-gray-700'>{message}</p>
                        )}
                    </div>
                </form>
            </div>
        </main>
    );
}
