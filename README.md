# 🌙 The Moon Tea — POS

Next.js 15 (App Router) point-of-sale for The Moon Tea. It covers the staff till,
customer self-ordering, prep-station screens, inventory counting, and sales reporting.

Supabase is the only backend. The browser talks to it **directly** — there is no ORM and
no API layer between the staff UI and the database. `lib/db.js` and friends are thin
wrappers around `@supabase/supabase-js`. Staff tills reach `orders` as a staff login and
customers' online orders go through the server; see [Order security](#order-security).

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
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.js` — server only, used by `/admin/menu` to save items and photos, and by `/api/online-order` to save customer orders. Supabase → Project Settings → API | **yes** for `/admin/menu` and online orders |
| `STAFF_SUPABASE_EMAIL` / `STAFF_SUPABASE_PASSWORD` | `app/api/supabase-session` — server only, the staff database login made with `scripts/create-staff-user.mjs`. See [Order security](#order-security) | **yes** once orders are locked down |
| `NEXT_PUBLIC_INVENTORY_WEBHOOK_URL` | `app/inventory/page.jsx` — posts inventory submissions | optional (defaults to `''`) |
| `PRINTER_PORT` | `print-server.js` — COM port from Device Manager → Ports | no (default `COM9`) |
| `PRINTER_BAUD` | `print-server.js` | no (default `9600`) |
| `PRINT_SERVER_PORT` | `print-server.js` | no (default `3333`) |
| `CASHAPP_URL` | `print-server.js` — fallback receipt QR target | no (default `https://cash.app/$TheMoonTea`) |

> The first two are the only ones the web app needs to boot; add `STAFF_PASSWORD` and
> `SUPABASE_SERVICE_ROLE_KEY` too, or staff can't sign in or edit the menu.
> Never prefix the service-role key with `NEXT_PUBLIC_`: it bypasses all database security. The `PRINTER_*`
> variables are read by the standalone print server process, not by Next.js.

Existing `.env.local` files may also carry `NEXT_PUBLIC_SMS_WEBHOOK_URL`,
`STRIPE_SECRET_KEY`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. **No code reads any of
them** — they are leftovers from the `stripe-payment` branch, and the `stripe` package
isn't even installed. Safe to drop.

---

## Routes

| Route | What it is |
|---|---|
| `/login` | Staff sign-in. **Every route except `/menu`, `/order/online`, `/login` and the `/staff-calendar/<token>.ics` feeds needs the staff password** (enforced in `middleware.js`; a device stays signed in for 30 days, and changing `STAFF_PASSWORD` signs everyone out) |
| `/admin/menu` | Manage the customer menu: Available / Sold out / Hidden, reorder, add and edit items with a photo |
| `/admin/popups` | Manage the customer pop-up calendar: add, edit, copy to a new date, delete |
| `/admin/schedule` | **Staff schedule.** Weekly shifts, one-day changes, days off, and each employee's private calendar link. See [Staff schedule](#staff-schedule) |
| `/admin/logs` | **iPad activity log**, live: printer and card-reader connections, prints, payments, orders, station taps. See [iPad activity log](#ipad-activity-log) |
| `/` | Redirect to `/vendor` |
| `/vendor` | Internal hub — links to Order Track, Inventory, Sales Summary |
| `/order` | **The staff till.** Cart, payment method, receipt printing, today's history |
| `/order/online` | Customer-facing self-order. Writes to the same `orders` table but never prints |
| `/order/[station]` | Prep-station screen. Valid slugs come from `station.slug` in the catalog — currently `corndog` and `drink`. Anything else 404s |
| `/orders` | Redirect to `/order` |
| `/summary` | Sales summary with date-range pills, per-category and per-payment-method breakdown |
| `/inventory` | Inventory counting — par/restock levels, prices, locations, case sizes, employee PIN auth |
| `/menu` | **Public customer site.** Menu with photos and descriptions, plus the pop-up calendar. See [Customer site](#customer-site) |
| `/cashapp` | Manages the list of Cash App cashtags and picks the active one for receipt QR codes (stored in `localStorage`) |
| `POST /api/online-order` | Public. Saves a customer's online order after checking every item and price against the catalog |
| `GET /api/supabase-session` | Staff only. Hands a till a database session for the staff login |
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
- **Phone calendar feed:** `/menu/popups.ics` is the pop-up calendar as an iCalendar feed
  (`lib/site/ical.js`), public like `/menu`. The Pop-ups tab has an **Add to iPhone Calendar**
  button (a `webcal://` link) and a copyable link for Google Calendar. Subscribed calendars check for
  changes about every hour, so edits show up on their own. Pop-up times are read in the shop's time
  zone, `SHOP_TIME_ZONE` (default `America/Chicago`). The feed keeps the last 60 days of pop-ups.

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

## Staff schedule

`/admin/schedule` (linked from `/vendor`) plans who works when at the store. It's separate from the
pop-up calendar.

- **People** are the `employees` rows Inventory already uses. Adding someone here gives them no
  Inventory PIN (an admin sets one in Inventory → Employees). Removing someone deletes their shifts,
  days off and calendar link, and their Inventory sign-in.
- **Shifts** live in `staff_shifts`. A shift repeats every week on a weekday from a start date
  (optionally until an end date), or happens once on a date. Tapping a shift offers:
  - change just that day (the weekly shift skips the date via `skip_dates`, and a one-off shift takes its place)
  - change every week
  - remove just that day
  - stop repeating from that day on
- **Events:** the week view also shows any pop-up from the pop-up calendar on its day, as a heads-up for
  the owner. Events don't go into employees' calendars.
- **Days off** live in `staff_time_off` and hide all of that person's shifts on those days.
- `lib/schedule/schedule.js` turns all of that into actual workdays (`expandShifts`). The week view
  and the calendar feeds both use it, so they always agree.
- **Calendar links:** each employee has a secret token in `staff_calendar_links`. Their feed at
  `/staff-calendar/<token>.ics` shows only their shifts ("Work: The Moon Tea"), from 30 days back to
  120 days ahead. The link is public by design,
  because phones can't sign in, so the token is the key. **Make a new link** on the Team view stops an
  old one working.
- The three schedule tables have RLS on and no policies. Only the staff-only API routes
  (`app/api/admin/schedule/*`) and the feed route can reach them, through the service-role key.

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

**Live tickets.** `/order` and the station screens read today's rows once, then keep them
current from Supabase Realtime (`lib/orders/useTodayTickets.js`, `lib/orders/ticketCache.js`),
re-reading in full every 20 s, on reconnect, and when the page comes back into view. This
needs `orders` in the `supabase_realtime` publication
(`supabase/migrations/20261018120000_orders_realtime.sql`); without it the screens still
work, just on the 20 s refresh.

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

Supabase-hosted Postgres, accessed straight from the browser.

Tables in use: `orders`, the `inventory_*` family (items, par/restock levels, prices,
locations, case sizes, daily checks, submissions), `employees` (PINs are SHA-256 hashed
client-side), and `receipts` / `receipt_items` (only touched by the stub API route).

**The authoritative schema is `supabase/migrations/`.**

> Historical note: a root-level `supabase_schema.sql` used to describe a different,
> non-matching schema (`order_number text`, an `items jsonb` column, `source` /
> `print_status`, `next_order_code(prefix)`). It has been removed to avoid confusion.

---

## Order security

`orders` holds customers' phone numbers and every ticket's payment state, so only staff
may read or change it. The public anon key ships in every page's JavaScript and must not
be enough.

- **One staff login** in Supabase Auth, with `app_metadata.role = 'staff'`
  (`scripts/create-staff-user.mjs`). Only the service-role key can set `app_metadata`, so
  signing yourself up never makes you staff. The database checks it with `public.is_staff()`.
- **Web tills** get a session for it from `/api/supabase-session` (staff password cookie
  required) and keep it in the browser (`staffReady()` in `lib/db.js`).
- **iPhones** sign in with it directly (`StaffAuth.swift`, `Secrets.staffEmail` /
  `staffPassword`).
- **Customers** never touch `orders`: `/order/online` posts to `/api/online-order`, which
  rebuilds every line from the catalog (`catalogLine` in `lib/menu/catalog.js`), so a
  tampered price or an off-menu item is refused, and saves it with the service-role key.

### Rolling it out — in this order

1. Apply `supabase/migrations/20261022120000_staff_access.sql`. It only **adds** staff
   access; the anon key keeps working.
2. Create the login: `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node
   scripts/create-staff-user.mjs <email>`. Put the printed email and password in Vercel
   (`STAFF_SUPABASE_EMAIL`, `STAFF_SUPABASE_PASSWORD`) and redeploy.
3. Put the same two values in every iPhone's `Secrets.swift`, build and install.
4. Check: the website's tills and every iPhone load and save orders, and `/admin/logs` shows
   no "Staff database sign-in failed".
5. Only then apply `supabase/pending/lock_down_orders.sql` (and move it into
   `supabase/migrations/`). It removes anon's access to `orders`, `booth_main_phone` and
   `ticket_number_requests`, and makes the order functions check for staff. A device still
   on the anon key stops working at this point.

Also turn off **Allow new users to sign up** (Supabase → Authentication → Sign In / Providers):
not needed for security, since a sign-up can't become staff, but nobody needs it.

---

## iPad app

`MoonTea/` is a self-contained SwiftUI/Xcode project — a second till that shares the same
Supabase `orders` table. **It is not needed to run the web app** and has no build
relationship to it; open it in Xcode separately.

It's the reason `supabase/migrations/…_add_replace_order_items_rpc.sql` exists (the RPC is
called from `SupabaseService.swift`), and the reason `MenuCatalog.swift` must stay in sync
with `lib/menu/catalog.js`.

### iPad activity log

The iPad app records what it does to the `activity_log` table, and staff read it at
**`/admin/logs`** from any browser (signed in with the staff password). The page updates
every 3 seconds while it shows today, filters by category, warnings/errors, device, and text
or order number, and downloads the day as CSV.

What gets logged (`ActivityLog.shared.info/warning/error(...)` in the Swift code):

- **Printer** — scans, printers found and selected, every connect and its result (with the
  Epson error code and how long it took), links found dead, background reconnect attempts,
  receipts queued / printed / failed, and print retries.
- **Card reader** — Square authorization, reader ready / connecting / not connected (with
  Square's reason), retries, pairing, Bluetooth on/off, location permission.
- **Payments** — card payments started, approved, cancelled, failed (amount, never card data).
- **Orders** — sent (number, item count, total, payment method), failed to save, edited,
  reprinted, phone number saved (never the number), ready text sent.
- **Stations** — every item status tap.
- **Order sync / App** — live-update connects and drops, launches, foreground/background.

Entries are written to a file on the iPad first and uploaded in batches a couple of seconds
later, so nothing is lost offline or if the app is killed — they upload when it's back.
Each iPad gets a random ID on first launch, shown with its model (e.g. `iPad13,18 · 6f1d`).

**Setup:** run `supabase/migrations/20261014120000_activity_log.sql` in the Supabase SQL
editor. The page needs `SUPABASE_SERVICE_ROLE_KEY`, like the other admin pages. The iPad
can only add entries; nobody can read them without the staff sign-in.

**Housekeeping:** nothing deletes old entries. To keep 90 days, run (or schedule with
`pg_cron`):

```sql
delete from public.activity_log where created_at < now() - interval '90 days';
```

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Next dev server on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | `next lint` |
| `npm test` | `node --test lib/**/*.test.js` — covers the catalog, order model, payment methods, date ranges, and the activity log helpers |
| `npm run print-server` | USB ESC/POS print server on :3333 |

`lib/package.json` exists only to declare `"type": "module"` for `lib/`, so `node --test`
can run those files as ESM while `print-server.js` stays CommonJS. Don't delete it.

---

## Known issues

- `POST /api/receipts/process` returns mock data and is wired to nothing.
- `print-server.js`'s header comment says it listens on port 3001; the actual default is
  3333.
