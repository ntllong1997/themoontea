// Run with: node scripts/sync-inventory.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://woxyzebkqwfxhacwfmft.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHl6ZWJrcXdmeGhhY3dmbWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkxNjk4MjUsImV4cCI6MjA2NDc0NTgyNX0.gp_4siQpU8hV9nebF-TiW8ql3UyGfOhE_Hh3jqE3Tog';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Full inventory from MoonTea_Inventory_Tracker.xlsx ─────────────────────
const INVENTORY = [
  // Syrups
  { category: 'Syrups', name: 'Strawberry Syrup',                        supplier: 'Bossen',          price: 12.50 },
  { category: 'Syrups', name: 'Mango Syrup',                             supplier: 'Bossen',          price: 12.50 },
  { category: 'Syrups', name: 'Rose Syrup',                              supplier: 'Bossen',          price: 14.75 },
  { category: 'Syrups', name: 'Passionfruit Syrup',                      supplier: 'Bossen',          price: 12.50 },
  { category: 'Syrups', name: 'Peach Syrup',                             supplier: 'Bossen',          price: 12.50 },
  { category: 'Syrups', name: 'Lychee Syrup',                            supplier: 'Bossen',          price: 12.50 },
  { category: 'Syrups', name: 'Honeydew Syrup',                          supplier: 'Bossen',          price: 12.50 },
  { category: 'Syrups', name: 'Pineapple Syrup',                         supplier: 'Bossen',          price: 12.50 },
  { category: 'Syrups', name: 'Lemon Syrup',                             supplier: 'Bossen',          price: 12.50 },
  { category: 'Syrups', name: 'Red Guava Syrup',                         supplier: 'Bossen',          price: 13.50 },
  { category: 'Syrups', name: 'Grape Syrup',                             supplier: 'Bossen',          price: 13.50 },
  { category: 'Syrups', name: 'Kumquat Syrup',                           supplier: 'Bossen',          price: 13.50 },
  { category: 'Syrups', name: 'Kiwi Syrup',                              supplier: 'Bossen',          price: 13.50 },
  { category: 'Syrups', name: 'Banana Syrup',                            supplier: 'Bossen',          price: 12.50 },
  { category: 'Syrups', name: 'Strawberry Jam',                          supplier: 'Bossen',          price: 21.75 },
  { category: 'Syrups', name: 'Mango Jam',                               supplier: 'Bossen',          price: 24.00 },
  { category: 'Syrups', name: 'Passion Fruit Jam',                       supplier: 'Bossen',          price: 21.75 },
  { category: 'Syrups', name: 'Torani Vanilla (750mL - 12/Case)',         supplier: 'Webstaurant',     price: 78.99 },
  { category: 'Syrups', name: 'Hershey Syrup (Jug)',                     supplier: 'Restaurant Depot', price: 15.00 },
  { category: 'Syrups', name: 'Concentrated Dark Brown Sugar Sauce 3.7L', supplier: 'Lollicup Store',  price: 26.75 },
  { category: 'Syrups', name: 'Strawberry Syrup 64oz',                   supplier: 'Lollicup Store',  price: 10.25 },
  { category: 'Syrups', name: 'Tropical Syrup 64oz',                     supplier: 'Lollicup Store',  price: null  },

  // Toppings
  { category: 'Toppings (Boba / Jelly)', name: 'Rainbow Jelly - BT',             supplier: 'Bossen',         price: 16.25 },
  { category: 'Toppings (Boba / Jelly)', name: 'Lychee Jelly',                   supplier: 'Bossen',         price: 16.25 },
  { category: 'Toppings (Boba / Jelly)', name: 'Coconut Jelly',                  supplier: 'Bossen',         price: 16.25 },
  { category: 'Toppings (Boba / Jelly)', name: 'Coffee Jelly',                   supplier: 'Bossen',         price: 19.25 },
  { category: 'Toppings (Boba / Jelly)', name: 'Brown Sugar Agar Jelly',          supplier: 'Bossen',         price: 18.75 },
  { category: 'Toppings (Boba / Jelly)', name: 'Crystal Boba',                   supplier: 'Bossen',         price: null  },
  { category: 'Toppings (Boba / Jelly)', name: 'Strawberry Topping',             supplier: 'Bossen',         price: 18.00 },
  { category: 'Toppings (Boba / Jelly)', name: 'Mango Topping',                  supplier: 'Bossen',         price: 18.00 },
  { category: 'Toppings (Boba / Jelly)', name: 'Blueberry Topping',              supplier: 'Bossen',         price: 18.00 },
  { category: 'Toppings (Boba / Jelly)', name: 'Lychee Topping',                 supplier: 'Bossen',         price: 18.00 },
  { category: 'Toppings (Boba / Jelly)', name: 'Kiwi Topping',                   supplier: 'Bossen',         price: 18.00 },
  { category: 'Toppings (Boba / Jelly)', name: 'Peach Topping',                  supplier: 'Bossen',         price: 18.00 },
  { category: 'Toppings (Boba / Jelly)', name: 'Tapioca Pearls (Chewy) - Case of 6', supplier: 'Lollicup Store', price: 45.25 },

  // Tea & Powders
  { category: 'Tea & Powders', name: 'Thai Green Tea (Thumb Up Brand)',             supplier: 'Bossen',         price: 6.00  },
  { category: 'Tea & Powders', name: 'Premium Thai Tea Mix (Cha Tra Mue)',          supplier: "Sam's Club",     price: 4.48  },
  { category: 'Tea & Powders', name: 'Number One Thai Iced Tea Mix 10-bag 4000g',   supplier: 'Amazon',         price: 65.10 },
  { category: 'Tea & Powders', name: 'ChaTraMue Green Tea Extra Green 180g - 12/Pack', supplier: 'Amazon',      price: 74.99 },
  { category: 'Tea & Powders', name: 'Drink Milk Green Tea Refill 200g x2',         supplier: 'Amazon',         price: 12.97 },
  { category: 'Tea & Powders', name: 'Blue Tea Butterfly Pea Flower Tea 100ct',     supplier: 'Amazon',         price: 18.69 },
  { category: 'Tea & Powders', name: 'Big Train Cookies N Cream Blended Creme 3.5lb', supplier: 'Amazon',       price: 20.94 },
  { category: 'Tea & Powders', name: 'Jade Leaf Culinary Matcha Powder 1lb - 6/Case', supplier: 'Webstaurant',  price: 352.49 },
  { category: 'Tea & Powders', name: 'Taro Powder 2.2 lbs',                         supplier: 'Lollicup Store', price: 15.50 },
  { category: 'Tea & Powders', name: 'Non-Dairy Creamer (Case of 10 bags)',          supplier: 'Lollicup Store', price: 67.75 },
  { category: 'Tea & Powders', name: 'Black Tea',                                   supplier: 'Lollicup Store', price: null  },
  { category: 'Tea & Powders', name: 'Jasmine Green Tea',                            supplier: 'Lollicup Store', price: null  },
  { category: 'Tea & Powders', name: 'Milk Tea Powder',                             supplier: 'Lollicup Store', price: null  },
  { category: 'Tea & Powders', name: 'Honeydew Powder',                             supplier: 'Lollicup Store', price: null  },
  { category: 'Tea & Powders', name: 'Coconut Powder',                              supplier: 'Lollicup Store', price: null  },
  { category: 'Tea & Powders', name: 'Egg Pudding Powder',                          supplier: 'Lollicup Store', price: null  },

  // Baking & Flavoring
  { category: 'Baking & Flavoring', name: 'LorAnn Oils Pistachio Bakery Emulsion 4oz',   supplier: 'Webstaurant', price: 5.49  },
  { category: 'Baking & Flavoring', name: 'LorAnn Oils Red Velvet Bakery Emulsion 16oz', supplier: 'Webstaurant', price: 18.99 },
  { category: 'Baking & Flavoring', name: 'LorAnn Oils Strawberry Bakery Emulsion 4oz',  supplier: 'Webstaurant', price: 5.99  },
  { category: 'Baking & Flavoring', name: 'LorAnn Oils Banana Bakery Emulsion 16oz',     supplier: 'Webstaurant', price: 18.99 },
  { category: 'Baking & Flavoring', name: 'LorAnn Oils Coffee Bakery Emulsion 4oz',      supplier: 'Webstaurant', price: 5.59  },
  { category: 'Baking & Flavoring', name: 'EverCrisp Breader & Batter Boost 16oz',       supplier: 'Amazon',      price: 22.95 },
  { category: 'Baking & Flavoring', name: 'Candy Eyes for Decorating 7mm',               supplier: 'Amazon',      price: 7.99  },
  { category: 'Baking & Flavoring', name: 'Lotus Biscoff Cookie Butter Spread 6.6lb',    supplier: 'Webstaurant', price: 47.99 },
  { category: 'Baking & Flavoring', name: 'Lotus Biscoff Cookies 8.8oz - 10/Case',       supplier: 'Webstaurant', price: 36.49 },
  { category: 'Baking & Flavoring', name: 'Lotus Biscoff Cookie Butter Topping 2.2lb',   supplier: 'Webstaurant', price: 17.49 },
  { category: 'Baking & Flavoring', name: 'Pure Vanilla Extract',                         supplier: 'Costco',      price: null  },

  // Dairy & Creamers
  { category: 'Dairy & Creamers', name: 'Whole Milk',                         supplier: 'HEB',              price: 3.50  },
  { category: 'Dairy & Creamers', name: 'Eggs',                               supplier: 'HEB',              price: 3.97  },
  { category: 'Dairy & Creamers', name: 'Cream Cheese',                       supplier: "Sam's Club",       price: 7.96  },
  { category: 'Dairy & Creamers', name: 'Heavy Cream',                        supplier: 'Costco',           price: 3.49  },
  { category: 'Dairy & Creamers', name: 'Sweetened Condensed Milk 14oz',      supplier: 'Restaurant Depot', price: 40.00 },
  { category: 'Dairy & Creamers', name: 'Milk Evaporated 12oz',               supplier: 'Restaurant Depot', price: 28.00 },
  { category: 'Dairy & Creamers', name: 'Sweetened Condensed Milk (Bulk)',     supplier: 'Costco',           price: null  },
  { category: 'Dairy & Creamers', name: 'Almond Milk',                        supplier: 'Costco',           price: null  },
  { category: 'Dairy & Creamers', name: 'Oat Milk',                           supplier: 'Costco',           price: null  },
  { category: 'Dairy & Creamers', name: 'Mascarpone 1 lb',                    supplier: 'Restaurant Depot', price: 25.00 },

  // Meat & Cheese
  { category: 'Meat & Cheese', name: 'Mozzarella Bulk (~49lb)',      supplier: 'Restaurant Depot', price: 100.00 },
  { category: 'Meat & Cheese', name: 'Cotija Cheese',               supplier: 'HEB',              price: 3.89   },
  { category: 'Meat & Cheese', name: 'Chicken Breast (Bulk)',        supplier: 'HEB',              price: 2.00   },
  { category: 'Meat & Cheese', name: 'KS Hot Dogs',                  supplier: 'Costco',           price: 19.99  },
  { category: 'Meat & Cheese', name: 'Laughing Cow Light Wedges',    supplier: 'Costco',           price: null   },
  { category: 'Meat & Cheese', name: 'Kraft Grated Parmesan Cheese', supplier: 'Costco',           price: null   },

  // Fruits & Produce
  { category: 'Fruits & Produce', name: 'Bananas',             supplier: 'HEB',              price: 0.50  },
  { category: 'Fruits & Produce', name: 'Strawberries',        supplier: 'HEB',              price: 4.00  },
  { category: 'Fruits & Produce', name: 'Pineapple',           supplier: 'HEB',              price: 5.00  },
  { category: 'Fruits & Produce', name: 'Lemons',              supplier: 'HEB',              price: 5.00  },
  { category: 'Fruits & Produce', name: 'Limes',               supplier: 'HEB',              price: 5.00  },
  { category: 'Fruits & Produce', name: 'Oranges',             supplier: 'HEB',              price: 4.00  },
  { category: 'Fruits & Produce', name: 'Apples',              supplier: 'HEB',              price: 2.52  },
  { category: 'Fruits & Produce', name: 'Cantaloupe',          supplier: 'HEB',              price: 2.97  },
  { category: 'Fruits & Produce', name: 'Onions',              supplier: 'HEB',              price: 0.67  },
  { category: 'Fruits & Produce', name: 'Corn',                supplier: 'HEB',              price: 1.48  },
  { category: 'Fruits & Produce', name: 'Clementines',         supplier: "Sam's Club",       price: 6.13  },
  { category: 'Fruits & Produce', name: 'Oranges (Fresh)',     supplier: "Sam's Club",       price: 7.52  },
  { category: 'Fruits & Produce', name: 'Potatoes',            supplier: "Sam's Club",       price: 4.42  },
  { category: 'Fruits & Produce', name: 'Mango Chunk IQF',     supplier: 'Restaurant Depot', price: 18.50 },
  { category: 'Fruits & Produce', name: 'Mango Dice IQF',      supplier: 'Restaurant Depot', price: 23.00 },
  { category: 'Fruits & Produce', name: 'Lemons 3 lb',         supplier: 'Costco',           price: null  },
  { category: 'Fruits & Produce', name: 'Limes 3 lb',          supplier: 'Costco',           price: null  },
  { category: 'Fruits & Produce', name: 'Garlic (Bulk Bag)',   supplier: 'Costco',           price: null  },
  { category: 'Fruits & Produce', name: 'Organic Coconut Water', supplier: 'Costco',         price: null  },
  { category: 'Fruits & Produce', name: 'Seedless Watermelon', supplier: 'Costco',           price: null  },
  { category: 'Fruits & Produce', name: 'Sliced Peaches',      supplier: 'Costco',           price: null  },

  // Dry Ingredients
  { category: 'Dry Ingredients', name: 'All Purpose Flour',                  supplier: 'HEB',              price: 3.68  },
  { category: 'Dry Ingredients', name: 'KIKO Bread Crumbs (Japanese)',       supplier: 'Restaurant Depot', price: 27.11 },
  { category: 'Dry Ingredients', name: 'Yeast Instant Dry',                  supplier: 'Restaurant Depot', price: 5.27  },
  { category: 'Dry Ingredients', name: 'Cornstarch 3 lbs',                   supplier: 'Restaurant Depot', price: 31.00 },
  { category: 'Dry Ingredients', name: 'Sugar Gran Nat 50#',                 supplier: 'Restaurant Depot', price: 28.18 },
  { category: 'Dry Ingredients', name: 'Kosher Salt',                        supplier: 'Restaurant Depot', price: 6.00  },
  { category: 'Dry Ingredients', name: 'Tajin',                              supplier: 'Restaurant Depot', price: 10.00 },
  { category: 'Dry Ingredients', name: 'Garlic Powder 5#',                   supplier: 'Restaurant Depot', price: 25.00 },
  { category: 'Dry Ingredients', name: 'Onion Powder 5#',                    supplier: 'Restaurant Depot', price: 25.00 },
  { category: 'Dry Ingredients', name: 'Pink Salt',                          supplier: 'Costco',           price: null  },
  { category: 'Dry Ingredients', name: 'Organic Brown Sugar',                supplier: 'Costco',           price: null  },

  // Sauces & Condiments
  { category: 'Sauces & Condiments', name: 'OIL CLEAR SOY',               supplier: 'Restaurant Depot', price: 30.43 },
  { category: 'Sauces & Condiments', name: 'Heinz Ketchup (3/44oz)',       supplier: 'Restaurant Depot', price: 10.99 },
  { category: 'Sauces & Condiments', name: "Hellmann's Mayo (1 gal)",      supplier: 'Restaurant Depot', price: 19.93 },
  { category: 'Sauces & Condiments', name: 'Nutella Tub 6.6#',             supplier: 'Restaurant Depot', price: 54.57 },
  { category: 'Sauces & Condiments', name: 'Honey Hot Sauce',              supplier: 'Restaurant Depot', price: 25.00 },
  { category: 'Sauces & Condiments', name: 'Sriracha',                     supplier: 'Restaurant Depot', price: 37.00 },
  { category: 'Sauces & Condiments', name: 'Nacho Cheese Sauce',           supplier: 'Restaurant Depot', price: 30.00 },
  { category: 'Sauces & Condiments', name: 'Chamoy',                       supplier: 'Restaurant Depot', price: 9.00  },

  // Snacks & Desserts
  { category: 'Snacks & Desserts', name: 'French Fry 3/8 Big C',           supplier: 'Restaurant Depot', price: 30.27 },
  { category: 'Snacks & Desserts', name: 'Onion Ring',                      supplier: 'Restaurant Depot', price: 26.00 },
  { category: 'Snacks & Desserts', name: 'Oreo 2.5#',                       supplier: 'Restaurant Depot', price: 14.50 },
  { category: 'Snacks & Desserts', name: 'OREO (Bulk)',                      supplier: 'Costco',           price: null  },
  { category: 'Snacks & Desserts', name: 'Jif Creamy Peanut Butter',        supplier: 'Costco',           price: null  },
  { category: 'Snacks & Desserts', name: 'Shin Black Ramen',                 supplier: 'Costco',           price: null  },
  { category: 'Snacks & Desserts', name: 'Shin Ramyun Noodles',              supplier: 'Costco',           price: null  },
  { category: 'Snacks & Desserts', name: 'Samyang Buldak Ramen Carbonara',  supplier: "Sam's Club",       price: 12.48 },

  // Packaging
  { category: 'Packaging', name: 'PP Sealing Film - Good Time 450m',         supplier: 'Webstaurant',    price: 52.99  },
  { category: 'Packaging', name: 'PP Cup V660 (660ml/22oz, 1000pcs)',         supplier: 'Bossen',         price: 110.00 },
  { category: 'Packaging', name: 'Poly Bags',                                 supplier: 'Restaurant Depot', price: 18.00 },
  { category: 'Packaging', name: 'T-Shirt Bags Small',                        supplier: 'Restaurant Depot', price: 24.16 },
  { category: 'Packaging', name: 'T-Shirt Bags Medium',                       supplier: 'Restaurant Depot', price: 16.62 },
  { category: 'Packaging', name: 'Gallon Plus Freezer Bags',                  supplier: 'Costco',         price: null   },
  { category: 'Packaging', name: 'Hot Dog Clamshell Container 500/Case',      supplier: 'Webstaurant',    price: 69.99  },
  { category: 'Packaging', name: 'Kraft Shopping Bag 8x4.5x10 - 250/Case',   supplier: 'Webstaurant',    price: 31.49  },
  { category: 'Packaging', name: 'Sandwich/Cookie Bag 5x5x1 - 1000/Box',     supplier: 'Webstaurant',    price: 22.49  },
  { category: 'Packaging', name: 'White Cupcake/Bakery Box 4x4x4 - 200/Case', supplier: 'Webstaurant',   price: 59.99  },
  { category: 'Packaging', name: 'Bakery Box 8x8x2.5 Window - 200/Case',     supplier: 'Webstaurant',    price: 66.99  },
  { category: 'Packaging', name: "Center Pull Paper Towel 500' - 6/Case",    supplier: 'Webstaurant',    price: 24.99  },
  { category: 'Packaging', name: "Jumbo TP Roll 720' - 12/Case",              supplier: 'Webstaurant',    price: 31.99  },
  { category: 'Packaging', name: 'Drink Carrier 4-Cup 200/Case',              supplier: 'Webstaurant',    price: 61.49  },
  { category: 'Packaging', name: 'Clear PET Cold Cup 24oz - 600/Case',        supplier: 'Webstaurant',    price: 44.49  },
  { category: 'Packaging', name: 'Clear Strawless Sip Lid - 1000/Case',       supplier: 'Webstaurant',    price: 37.99  },
  { category: 'Packaging', name: 'PET Dome Lid w/ 2" Hole - 1000/Case',       supplier: 'Webstaurant',    price: 33.99  },
  { category: 'Packaging', name: 'Black Souffle Cup 2oz - 2500/Case',         supplier: 'Webstaurant',    price: 19.49  },
  { category: 'Packaging', name: 'PET Lid for Souffle Cup - 2500/Case',       supplier: 'Webstaurant',    price: 16.99  },
  { category: 'Packaging', name: 'Tamper-Evident Drink Carrier - 1000/Case',  supplier: 'Webstaurant',    price: 102.99 },
  { category: 'Packaging', name: 'Kraft Basket Liner / Deli Wrap - 5000/Case', supplier: 'Webstaurant',   price: 79.99  },
  { category: 'Packaging', name: 'Paper Food Tray 1000/Case',                 supplier: 'Webstaurant',    price: 36.79  },
  { category: 'Packaging', name: 'Kraft Take-Out Container 300/Case',         supplier: 'Webstaurant',    price: 49.49  },
  { category: 'Packaging', name: 'Interfold Paper Napkin - 6000/Case',        supplier: 'Webstaurant',    price: 74.49  },
  { category: 'Packaging', name: 'Boba Straws 1600ct (0.39x9")',              supplier: 'Lollicup Store', price: 39.75  },
  { category: 'Packaging', name: 'Plastic Dome Cup Lids 1000ct (90mm)',       supplier: 'Lollicup Store', price: 49.50  },

  // Equipment & Supplies
  { category: 'Equipment & Supplies', name: 'Pressure Washer w/ Foam Cannon',     supplier: 'Amazon', price: 99.97  },
  { category: 'Equipment & Supplies', name: 'Commercial Kitchen Timer 12-Channel', supplier: 'Amazon', price: 42.99  },
  { category: 'Equipment & Supplies', name: 'KitchenAid Dough Hook Attachment',    supplier: 'Amazon', price: 12.90  },
  { category: 'Equipment & Supplies', name: 'VEVOR Fryer Grease Bucket 10 Gal',   supplier: 'Amazon', price: 83.91  },
  { category: 'Equipment & Supplies', name: 'Zebra ZD410 Printhead 203dpi',        supplier: 'Amazon', price: 59.50  },
  { category: 'Equipment & Supplies', name: 'Manual Soap Dispenser 1000ml',        supplier: 'Amazon', price: 14.39  },
  { category: 'Equipment & Supplies', name: 'Wall-Mount Ticket Holder 48"',        supplier: 'Webstaurant', price: 11.49 },
  { category: 'Equipment & Supplies', name: 'Wall-Mount Ticket Holder 18"',        supplier: 'Webstaurant', price: 6.49  },
  { category: 'Equipment & Supplies', name: '20 Qt Aluminum Stock Pot',            supplier: 'Webstaurant', price: 40.79 },
  { category: 'Equipment & Supplies', name: 'Green Epoxy Wire Shelf 18x36',        supplier: 'Webstaurant', price: 22.70 },
  { category: 'Equipment & Supplies', name: 'Wall-Mounted Hand Sink 12x16',        supplier: 'Webstaurant', price: 84.99 },
  { category: 'Equipment & Supplies', name: 'Thermal Printer Cleaning Pen 10pk',   supplier: 'Amazon', price: 9.49  },
  { category: 'Equipment & Supplies', name: 'Phone Tripod 62" w/ Remote',          supplier: 'Amazon', price: 19.99 },
  { category: 'Equipment & Supplies', name: 'Leveling Feet 12pcs 1/4-20',          supplier: 'Amazon', price: 3.19  },

  // Cleaning Supplies
  { category: 'Cleaning Supplies', name: 'Gloves (LG / MD)',            supplier: 'Restaurant Depot', price: 28.00 },
  { category: 'Cleaning Supplies', name: 'Degreaser 1 Gal',             supplier: 'Restaurant Depot', price: 20.00 },
  { category: 'Cleaning Supplies', name: 'Dish Soap',                   supplier: 'Costco',           price: null  },
  { category: 'Cleaning Supplies', name: 'Scrub Daddy',                 supplier: 'Costco',           price: null  },
  { category: 'Cleaning Supplies', name: '33-Gallon Trash Bag',         supplier: 'Costco',           price: null  },
  { category: 'Cleaning Supplies', name: '13-Gallon Kitchen Trash Bag', supplier: 'Costco',           price: null  },
  { category: 'Cleaning Supplies', name: 'Lysol Disinfecting Wipes',    supplier: 'Costco',           price: null  },
  { category: 'Cleaning Supplies', name: 'Hand Soap',                   supplier: 'Costco',           price: null  },

  // Drinks
  { category: 'Drinks', name: 'Drinking Water',    supplier: 'Costco', price: null },
  { category: 'Drinks', name: 'Coke',              supplier: 'Costco', price: null },
  { category: 'Drinks', name: 'Diet Coke',         supplier: 'Costco', price: null },
  { category: 'Drinks', name: 'Sprite',            supplier: 'Costco', price: null },
  { category: 'Drinks', name: 'Sugar Free Dr Pepper', supplier: 'Costco', price: null },
];

async function main() {
  console.log(`Total items: ${INVENTORY.length}`);

  // ── 1. Rebuild inventory_items ─────────────────────────────────────────
  console.log('\n[1/3] Rebuilding inventory_items…');
  const { error: delErr } = await supabase.from('inventory_items').delete().not('id', 'is', null);
  if (delErr) { console.error('Delete error:', delErr); process.exit(1); }

  const itemRows = INVENTORY.map((item, idx) => ({
    category:   item.category,
    name:       item.name,
    sort_order: idx,
  }));

  // Insert in batches of 50
  for (let i = 0; i < itemRows.length; i += 50) {
    const { error } = await supabase.from('inventory_items').insert(itemRows.slice(i, i + 50));
    if (error) { console.error('Insert items error:', error); process.exit(1); }
  }
  console.log(`  ✓ Inserted ${itemRows.length} items`);

  // ── 2. Rebuild inventory_locations ─────────────────────────────────────
  console.log('\n[2/3] Rebuilding inventory_locations…');
  const { error: delLocErr } = await supabase.from('inventory_locations').delete().not('item_name', 'is', null);
  if (delLocErr) { console.error('Delete locations error:', delLocErr); process.exit(1); }

  const locRows = INVENTORY.map((item) => ({ item_name: item.name, location: item.supplier }));
  for (let i = 0; i < locRows.length; i += 50) {
    const { error } = await supabase.from('inventory_locations').insert(locRows.slice(i, i + 50));
    if (error) { console.error('Insert locations error:', error); process.exit(1); }
  }
  console.log(`  ✓ Set locations for ${locRows.length} items`);

  // ── 3. Rebuild inventory_prices ────────────────────────────────────────
  console.log('\n[3/3] Rebuilding inventory_prices…');
  const { error: delPriceErr } = await supabase.from('inventory_prices').delete().not('item_name', 'is', null);
  if (delPriceErr) { console.error('Delete prices error:', delPriceErr); process.exit(1); }

  const priceRows = INVENTORY.filter((item) => item.price != null).map((item) => ({ item_name: item.name, price: item.price }));
  for (let i = 0; i < priceRows.length; i += 50) {
    const { error } = await supabase.from('inventory_prices').insert(priceRows.slice(i, i + 50));
    if (error) { console.error('Insert prices error:', error); process.exit(1); }
  }
  console.log(`  ✓ Set prices for ${priceRows.length} items`);

  console.log('\nDone! Reload the inventory page to see the updated data.');
}

main().catch(console.error);
