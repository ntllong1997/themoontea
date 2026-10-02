# 🌙 The Moon Tea — POS

Next.js 15 (App Router) point-of-sale for The Moon Tea. It covers the staff till,
customer self-ordering, prep-station screens, inventory counting, and sales reporting.

Supabase is the only backend. The browser talks to it **directly** with the anon key —
there is no server-side data layer, no ORM, and no API layer between the UI and the
database. `lib/db.js` and friends are thin wrappers around `@supabase/supabase-js`.

A sibling SwiftUI iPad app lives in `MoonTea/` and writes to the **same `orders` table**.
See [iPad app](#ipad-app).

---

## Quick start

```bash
npm install
# create .env.local — see Environment variables below
npm run dev
```

Open <http://localhost:3000> — `/` redirects to `/vendor`, the internal hub.

Receipt printing needs a second process:

```bash
npm run print-server   # only for the USB printer; the WiFi printer doesn't need it
```

On Windows, `start.bat` launches the print server, the dev server, and a browser at
`/order` in one go. `start.sh` does the same but shells out to `cmd.exe`, so despite the
extension it only works in Git Bash **on Windows** — not macOS or Linux.

---

## Environment variables

Put these in `.env.local` (gitignored via the `.env*` rule).

| Variable | Read by | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/db.js`, `lib/inventoryDb.js`, `lib/employeesDb.js`, `lib/supabase/server.js` | **yes** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as above | **yes** |
| `STAFF_PASSWORD` | `middleware.js`, `app/api/login` — the one password staff type at `/login` | **yes** (without it nobody can sign in) |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.js` — server only, used by `/admin/menu` to save items and photos. Supabase → Project Settings → API | **yes** for `/admin/menu` |
| `SQUARE_ENVIRONMENT` | `lib/online/square.js` — `sandbox` (test cards, no real money) or `production` | for online ordering (default `sandbox`) |
| `SQUARE_APPLICATION_ID` | same — Square Developer → your app → Credentials | for online ordering |
| `SQUARE_LOCATION_ID` | same — Square Developer → your app → Locations | for online ordering |
| `SQUARE_ACCESS_TOKEN` | same — Credentials → Access token. **Secret, server only** | for online ordering |
| `SHOP_TIME_ZONE` | `lib/online/shopTime.js` — the time zone pop-up dates and times are in | no (default `America/Chicago`) |
| `NEXT_PUBLIC_INVENTORY_WEBHOOK_URL` | `app/inventory/page.jsx` — posts inventory submissions | optional (defaults to `''`) |
| `PRINTER_PORT` | `print-server.js` — COM port from Device Manager → Ports | no (default `COM9`) |
| `PRINTER_BAUD` | `print-server.js` | no (default `9600`) |
| `PRINT_SERVER_PORT` | `print-server.js` | no (default `3333`) |
| `CASHAPP_URL` | `print-server.js` — fallback receipt QR target | no (default `https://cash.app/$TheMoonTea`) |

> The first two are the only ones the web app needs to boot; add `STAFF_PASSWORD` and
> `SUPABASE_SERVICE_ROLE_KEY` too, or staff can't sign in or edit the menu.
> Never prefix the service-role key or `SQUARE_ACCESS_TOKEN` with `NEXT_PUBLIC_`: the first bypasses all
> database security, the second can move money. Without all three `SQUARE_*` ids, `/order/online` says
> online payments aren't set up and takes no orders. The `PRINTER_*`
> variables are read by the standalone print server process, not by Next.js.

Existing `.env.local` files may also carry `NEXT_PUBLIC_SMS_WEBHOOK_URL`,
`STRIPE_SECRET_KEY`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. **No code reads any of
them** — they are leftovers from the `stripe-payment` branch, and the `stripe` package
isn't even installed. Safe to drop.

---

## Routes

| Route | What it is |
|---|---|
| `/login` | Staff sign-in. **Every route except `/menu`, `/order/online`, `/loyalty` and `/login` (and their `/api/order/*`, `/api/loyalty` APIs) needs the staff password** (enforced in `middleware.js`; a device stays signed in for 30 days, and changing `STAFF_PASSWORD` signs everyone out) |
| `/admin/menu` | Manage the customer menu: Available / Sold out / Hidden, reorder, add and edit items with a photo |
| `/admin/popups` | Manage the customer pop-up calendar: add, edit, copy to a new date, delete, and pin the spot online orders are checked against |
| `/admin/loyalty` | Staff rewards lookup: a phone number's punch card, and "Give a free drink" at the stand |
| `/` | Redirect to `/vendor` |
| `/vendor` | Internal hub — links to Order Track, Inventory, Sales Summary |
| `/order` | **The staff till.** Cart, payment method, receipt printing, today's history |
| `/order/online` | **Customer order-ahead, paid by card (Square).** Open only during a pinned pop-up, within 1 mile of it. See [Online ordering](#online-ordering) |
| `/loyalty` | Customer punch card: enter a phone number, see stamps and free drinks |
| `/order/[station]` | Prep-station screen. Valid slugs come from `station.slug` in the catalog — currently `corndog` and `drink`. Anything else 404s |
| `/orders` | Redirect to `/order` |
| `/summary` | Sales summary with date-range pills, per-category and per-payment-method breakdown |
| `/inventory` | Inventory counting — par/restock levels, prices, locations, case sizes, employee PIN auth |
| `/menu` | **Public customer site.** Menu with photos and descriptions, plus the pop-up calendar. See [Customer site](#customer-site) |
| `/cashapp` | Manages the list of Cash App cashtags and picks the active one for receipt QR codes (stored in `localStorage`) |
| `POST /api/receipts/process` | ⚠️ **Stub.** Returns hardcoded `buildMockExtraction()` data. Nothing in the app calls it |

---

## Customer site

`/menu` is the page to share with customers (link it from Instagram, a QR code on the
table, etc.). It needs no sign-in.

- **Menu items** live in the Supabase table `site_menu_items` and are managed by staff at
  `/admin/menu` — no code change or redeploy needed. Saving there refreshes `/menu` right
  away. Photos go to the public `menu-photos` storage bucket.
- The browser's anon key can only *read* items that aren't hidden; all writes go through
  `app/api/admin/menu/*`, which check the staff session and use the service-role key.
- How each category **looks** (heading, blurb, the corndog build steps, the boba choices)
  is in `lib/site/menu.js` → `SECTIONS`. A new category typed in the admin page works
  without touching code; it just gets plain defaults.
- If Supabase can't be reached, `/menu` falls back to `FALLBACK_ITEMS` in the same file, so
  the page is never empty.
- **Pop-up dates** live in the Supabase table `site_popups`, managed at `/admin/popups` (same security as menu items: public read, staff-only writes through
  `app/api/admin/popups/*`). Past dates drop off the public calendar on their own.

---

## Accessibility

The customer site and the staff site editors are checked against WCAG 2.2 AA with
axe-core (0 violations) plus keyboard testing. Keep these when changing them:

- **Colour:** `moon-caramel` is a fill. Put `moon-ink` text on it, never white
  (white on caramel is 2.6:1). `moon-orange` and `moon-muted` are tuned to pass 4.5:1 on
  every cream background.
- **Modals:** use `components/admin/Dialog.jsx`. It names the dialog, moves focus in and back out,
  keeps Tab inside, and closes on Escape.
- **Global CSS:** `assets/styles/globals.css` gives every focusable element a visible
  keyboard outline and turns animation off for `prefers-reduced-motion`.
- **Page titles:** every page sets a `<title>` (a `metadata` export or a small `layout.jsx`).
  The root layout owns the single `<main>` landmark.

---

## Locations

The two-location split is switched **off**: `LOCATIONS_ENABLED = false` in
`lib/locations.js`. Every device is Location 1, nothing asks which location it is at, and
the sales summary covers all orders. Set it back to `true` to restore the picker. (The iPad
app is always Location 1 either way.)

---

## Online ordering

`/order/online` lets a customer at a pop-up order and pay by card, then pick up at the stand.

- **When:** only while a pop-up in `site_popups` is running *and* has a location pin (set at
  `/admin/popups`). Online orders close 15 minutes before the pop-up ends.
- **Where:** the browser's location must be within 1 mile of the pin (`lib/online/geo.js`).
  The checkout repeats the check. A determined customer can fake their browser location,
  so this keeps honest people from ordering from home; it isn't a security guarantee.
- **Price:** the server recomputes every price from `lib/menu/catalog.js` and refuses items
  marked Sold out or Hidden at `/admin/menu`. The browser never sends a price.
- **Payment:** Square's Web Payments SDK turns the card into a one-time token in the browser.
  `app/api/order/checkout` charges it, then saves the order: one `orders` row per unit
  (`source = 'online'`, `paymentMethod = 'Online Card'`, plus `note` and `customer_name`)
  and one `online_orders` row. If saving fails after the charge, it removes any rows it
  wrote and refunds the card. A retried request with the same idempotency key returns the
  first order instead of charging twice.
- **Stations** show online orders with a purple **ONLINE · PAID** bar and the customer's note.
- **Printing:** the iPad app polls `claim_online_orders` every 5 seconds while it's open and a
  printer is saved. It prints each order once, then calls `mark_online_order_printed`. An order
  claimed but not printed within 2 minutes is offered again.
- **Rewards:** every paid Boba drink on a phone number is a stamp; 9 stamps = 1 free drink
  (`lib/online/loyalty.js`). Stamps count from the `orders` table, so past till orders with a
  phone number count too. Free drinks used, online or at the stand, are recorded in
  `loyalty_redemptions`.

To go live: create an app at developer.squareup.com, put its **sandbox** ids in Vercel, and test
with card `4111 1111 1111 1111`. Then switch `SQUARE_ENVIRONMENT` to `production` with the
production ids and redeploy.

---

## Printing

`lib/printer.js` supports two paths and picks the first that's configured:

1. **WiFi (preferred).** Direct ePOS-Print XML `POST` to an Epson printer on the LAN.
   The host is stored in `localStorage` under `wifiPrinterHost` and is configured in the
   UI via `components/PrinterSettings.jsx`, which also has a test-print button. XML is
   built in `lib/eposXml.js`. No extra process needed.
2. **USB fallback.** If no WiFi host is set, requests go to `print-server.js` at
   `http://127.0.0.1:3333`, which writes raw ESC/POS over a serial port. Start it with
   `npm run print-server`. It exposes `GET /status`, `GET /test`, and `POST /print`.

Receipts embed a Cash App QR code pointing at the active cashtag from `/cashapp`.

---

## Data model — read this before touching `lib/db.js`

Two non-obvious rules govern every order query:

**One database row per physical unit.** An order for 3 corndogs is 3 rows, not one row
with `quantity: 3`. Rows are regrouped back into orders by `orderNumber` in
`lib/orders/orderModel.js`. This is what lets a station screen mark one unit done without
touching the others.

**`orderNumber` resets to 1 every day.** It only identifies an order *within* a day, so
**every read and write is day-scoped**. An unbounded `UPDATE ... WHERE orderNumber = 7`
would rewrite every past day's order #7. `dayBounds()` in `lib/db.js` produces those
bounds; `getOrdersInRange()` is the deliberate exception, since the summary reports
across days.

Numbers are reserved through the `next_order_number` Postgres RPC, which serialises the
web till and the iPad behind a day-scoped advisory lock — collisions are structurally
impossible rather than retried away.

**Timestamps.** The `timestamp` column is `timestamp without time zone`, and both clients
write `new Date().toISOString()` into it — i.e. UTC wearing no marker. Any bound you
compare against must be converted the same way, or every window slides by the UTC offset.

---

## The menu is code, not data

`lib/menu/catalog.js` is the single source of truth for what the shop sells. The order
panel, the cart, the history colours, the station routes, and the summary tabs are all
derived from `CATEGORIES` — adding an item or a category means editing that one file, and
no other.

Current categories: Corndog, Boba, Cookie, Lemonade, Egg Roll, Side, Discount. Only
Corndog and Boba have a `station`, which is why only `/order/corndog` and `/order/drink`
exist.

> ⚠️ The iPad app has a matching `MoonTea/MoonTea/Config/MenuCatalog.swift`. **Keep the
> two in sync, and ship the iOS side FIRST** when adding a category — otherwise older
> iPads receive a `type` they can't decode and silently drop the order.

---

## Database

Supabase-hosted Postgres, accessed straight from the browser with the anon key.

Tables in use: `orders`, the `inventory_*` family (items, par/restock levels, prices,
locations, case sizes, daily checks, submissions), `employees` (PINs are SHA-256 hashed
client-side), and `receipts` / `receipt_items` (only touched by the stub API route).

**The authoritative schema is `supabase/migrations/`.**

> Historical note: a root-level `supabase_schema.sql` used to describe a different,
> non-matching schema (`order_number text`, an `items jsonb` column, `source` /
> `print_status`, `next_order_code(prefix)`). It has been removed to avoid confusion.

---

## iPad app

`MoonTea/` is a self-contained SwiftUI/Xcode project — a second till that shares the same
Supabase `orders` table. **It is not needed to run the web app** and has no build
relationship to it; open it in Xcode separately.

It's the reason `supabase/migrations/…_add_replace_order_items_rpc.sql` exists (the RPC is
called from `SupabaseService.swift`), and the reason `MenuCatalog.swift` must stay in sync
with `lib/menu/catalog.js`.

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Next dev server on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | `next lint` |
| `npm test` | `node --test lib/**/*.test.js` — covers the catalog, order model, payment methods, and date ranges |
| `npm run print-server` | USB ESC/POS print server on :3333 |

`lib/package.json` exists only to declare `"type": "module"` for `lib/`, so `node --test`
can run those files as ESM while `print-server.js` stays CommonJS. Don't delete it.

---

## Known issues

- `POST /api/receipts/process` returns mock data and is wired to nothing.
- `print-server.js`'s header comment says it listens on port 3001; the actual default is
  3333.
