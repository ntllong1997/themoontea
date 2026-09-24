# Prompt: Build "Moon POS", a clean point-of-sale for a food truck / tea shop

> Paste everything below the line into an AI coding agent (Claude Code, etc.) in an **empty
> repository**. It describes a clean rebuild of The Moon Tea POS as a portfolio project.
> Placeholders are in `‹angle quotes›`.

---

## 0. Role and goal

You are a senior full-stack engineer. Build **Moon POS**, a production-quality point-of-sale
system for a small food business that sells **Korean corndogs and boba drinks**. The code will be
shown on a résumé, so it has to be clean, typed, tested and documented. Build it in small,
reviewable commits, following the milestones in §9.

The system has two clients that share one Supabase backend:

1. **Web app** (Next.js). It covers menu admin, the staff till, prep-station screens, the sales
   summary, and the customer self-order site reached by QR code.
2. **iPad till** (native SwiftUI). This is the counter register. It exists because it is the only
   client that can use the **Bluetooth receipt printer** and the **Square card reader**.

Ask me before you guess about anything in §10 ("Open questions").

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js (App Router) + **TypeScript (strict)**, Tailwind CSS, shadcn/ui, Zustand (cart), Zod (validation at every boundary), TanStack Query (server state) |
| Backend | **Supabase**: Postgres, Auth (staff), Realtime, Storage (item images), RLS, Postgres RPC functions, Edge Functions or Next.js route handlers for anything that holds a secret |
| Payments | Square: **Mobile Payments SDK** on iPad (Bluetooth reader), **Web Payments SDK** + server-side `CreatePayment` for self-order. Cash App via a payment link. Cash. |
| Printing | Epson TM-m30III. iPad uses the **Epson ePOS2 SDK** over Bluetooth. Web uses **ePOS-Print XML over WiFi** as a fallback |
| iPad | SwiftUI, Swift Concurrency (`async/await`, actors), `supabase-swift`, iOS 17+ |
| Tests | Vitest (domain + components), Playwright (E2E), XCTest (Swift domain + print queue) |
| Tooling | ESLint, Prettier, `supabase` CLI migrations, generated DB types (`supabase gen types`), GitHub Actions CI (lint → typecheck → unit → e2e) |

---

## 2. Database rules (IMPORTANT: this is a shared database)

- Use the **existing Supabase project** (`‹project-ref›`). It already contains production tables
  (`orders`, `inventory_*`, `employees`, `receipts`, and others) that belong to the old system.
  **Never read, alter or drop them.**
- Prefix every new table, view, function and enum with **`pos_`**.
- All schema changes go in `supabase/migrations/` as timestamped SQL files. Never edit the schema
  by clicking in the dashboard.
- **Enable RLS on every table.** Staff use Supabase Auth, with roles `owner`, `manager` and
  `staff` stored in `pos_staff`. Anonymous customers never write to tables directly. They call
  narrow `SECURITY DEFINER` RPCs with a pinned `search_path` (for example
  `pos_place_self_order`, `pos_get_order_status`).
- Store **money as integer cents**. Store **time as `timestamptz`**. Every order also gets a
  `business_date date` column, computed in the location's timezone. (The old system stored UTC
  in `timestamp without time zone`, and that caused window bugs. Do not repeat it.)
- Snapshot anything that can change later. Each order copies item names, prices, modifier
  prices and the tax rate at the moment it is placed, so later menu edits never rewrite history.

### Tables

```
pos_locations        id, name, timezone, address, is_self_order_open bool, busy_mode_multiplier numeric default 1.0
pos_settings         location_id PK, tax_rate numeric default 0.0825, cashapp_url, eta_buffer_minutes int default 2,
                     eta_min_minutes int default 3, max_open_corndogs int null, receipt_footer text
pos_staff            user_id (auth.users), location_id, role, display_name, pin_hash
pos_stations         id, location_id, slug ('corndog','drink'), name, color, sort
pos_menus            id, location_id, name, is_active, available_from/to (time, nullable)
pos_categories       id, menu_id, name, sort, is_active
pos_items            id, category_id, name, description, price_cents, image_path, station_id null,
                     prep_minutes int default 0, is_active, is_sold_out, sort
pos_modifier_groups  id, location_id, name, min_select, max_select, is_required, sort
pos_modifiers        id, group_id, name, price_delta_cents, prep_minutes_delta int default 0, is_active, is_sold_out, sort
pos_item_modifier_groups  item_id, group_id, sort          -- many-to-many, so groups are reusable
pos_orders           id uuid, location_id, business_date, order_number int, source ('till'|'self'),
                     customer_name, phone, status (see §4), payment_method ('cash'|'card'|'cashapp'|'pay_at_register'),
                     payment_status ('unpaid'|'pending'|'paid'|'refunded'|'failed'),
                     subtotal_cents, tax_rate, tax_cents, total_cents,
                     eta_at timestamptz, eta_original_at timestamptz, notes, client_request_id uuid UNIQUE,
                     created_at, completed_at, created_by
                     UNIQUE (location_id, business_date, order_number)
pos_order_items      id, order_id, item_id, name_snapshot, unit_price_cents, quantity, station_id, notes
pos_order_item_modifiers  order_item_id, modifier_id, name_snapshot, price_delta_cents
pos_order_units      id, order_item_id, order_id, station_id, unit_index, stage (see §4),
                     cook_minutes int, started_at, done_at, remake_count int default 0, updated_by
pos_payments         id, order_id, method, amount_cents, tip_cents, status, provider_payment_id,
                     idempotency_key UNIQUE, raw jsonb, created_at
pos_order_events     id, order_id, unit_id null, type, from_value, to_value, actor, created_at   -- audit log
pos_print_jobs       id, order_id, device_id, kind ('receipt'|'kitchen'), status, attempts, last_error, created_at
```

- Allocate order numbers with an RPC, `pos_next_order_number(location_id, business_date)`, that
  takes a `pg_advisory_xact_lock` so the numbers never collide. They restart at 1 each day for
  each location.
- `pos_order_units` holds one row per physical unit. Three corndogs means three unit rows, so the
  fryer cook can advance each one separately. (This idea carries over from the old system, which
  stored one `orders` row per unit.)
- Turn on Realtime for `pos_orders` and `pos_order_units`.

### Seed data (`supabase/seed.sql`, taken from the current menu)

- **Corndog** ($8.00, station: corndog, prep 5 min)
  - Inside: Cheese / Half-Half (required, pick 1)
  - Outside: Original (+0 min) / Hot Cheeto (+1 min) / Potato (+3 min) (required, pick 1)
  - Add-on: Hot Cheeto Dust (+$1.00)
- **Boba** ($8.00, station: drink, prep 0)
  - Drink flavors (required)
  - Boba: Tapioca / Mango Popping / Strawberry Popping / None
- **Cookie** packs: 1 for $5, 3 for $14, 5 for $23
- **Lemonade** ($7, Tea / Soda)
- **Egg Roll** ($7)
- **Sides**: Water $1, Soda $2, Flan $5

---

## 3. Features and acceptance criteria

### 3.1 Menu admin (`/admin/menu`)
- Full create, read, update and delete for menus, categories, items, modifier groups and
  modifiers. Modifier groups can be shared by many items.
- Set prices, set `prep_minutes` and `prep_minutes_delta`, assign an item to a station, and
  reorder rows by drag-and-drop.
- Toggle **active** (hidden) and **sold out** (shown greyed out) instantly. Changes reach every
  open till and self-order page through Realtime.
- Upload item images to Supabase Storage.
- Validate with Zod on the client and enforce the same rules with DB constraints (price ≥ 0,
  `min_select ≤ max_select`).
- Deleting an item that past orders reference must be a **soft delete** (`is_active=false`).
  History is never broken.
- **Settings page:** tax rate (default **8.25%**, editable, shown as a percentage, stored as a
  decimal), Cash App URL, ETA buffer, busy-mode multiplier, self-order open/closed, and the
  maximum number of open corndogs.

### 3.2 Staff till (`/order` on web; the main screen on iPad)
- Category tabs, then an item grid, then a modifier sheet that enforces min/max selections, then
  the cart. The cart supports quantity, line notes, editing a line and removing it.
- Totals are subtotal, tax and total, calculated by the **shared domain function**. Cash
  payments show a change calculator.
- Payment choices: **Cash**, **Card (Square)**, **Cash App**.
- On submit: create the order, print the receipt, and optionally print a kitchen ticket.
- A "Today" history panel shows recent orders with their status, lets staff reprint, **edit** or
  **void** an order (with a reason, written to `pos_order_events`), and highlights self-orders
  still marked "Pay at register" so the cashier collects the money.

### 3.3 Prep stations (`/station/[slug]`)
- A live board of open units for this station, oldest first, grouped by order.
- A large tap target on every unit card. Use the corndog stage flow from §4. **Each tap moves
  the unit one stage forward. An Undo toast stays up for 5 seconds.**
- While a corndog is **Frying**, its card shows a **live countdown** (5:00 → 0:00). At 0:00 it
  flashes and plays a sound. If it goes past the timer, it shows **"+0:42 over"** in red.
- Each unit card has a **Remake** button for a dropped or burnt corndog. Remake returns the unit
  to *Received*, increments `remake_count`, logs an event, and pushes the ETA back (see §5).
- ETA controls for each order: **+5 min** / **−5 min**. Each change updates `eta_at`, which the
  customer sees live.
- When an order completes, show a **"Text customer"** button that opens an `sms:` link (see
  §3.7).

### 3.4 Customer self-order (`/s/[locationSlug]`, reached by QR code)
- Mobile-first flow: **menu → item + modifiers → cart → name + phone → pay → confirmation.**
- Sold-out items are greyed out. If `is_self_order_open` is false, show a "Self-order is paused,
  please order at the window" screen.
- Before the customer submits, show the **quoted ETA** ("Ready in about 14 min").
- Payment options:
  - **Card:** Square Web Payments SDK tokenizes the card in the browser. A server route calls
    `CreatePayment` with an idempotency key, and the order is marked `paid`.
  - **Cash App:** open `cashapp_url`. The page tells the customer to "Put **#23** in the note."
    The order is saved as `payment_status='pending'`. Staff confirm it on the till with one tap.
  - **Cash:** "Pay at the register." The order is saved as `payment_status='unpaid'` and is
    highlighted on the till.
- **Confirmation page (`/s/[locationSlug]/o/[orderId]`)** shows a big order number, the ETA
  clock time, and a **live order-status tracker** (§3.5). The customer can bookmark it.
- Self-orders show up on the till and on the stations with a **SELF** badge and their payment
  status. Units from an unpaid Cash App order are held until staff confirm payment, or start
  anyway if the owner turns on "start before paid" in settings.

### 3.5 Customer order-status page
- The customer sees their order and **every item's current stage**. It updates in real time over
  Supabase Realtime, and falls back to polling every 10 s if the socket drops.
- An order-level progress bar reads **Received → Preparing → Ready → Picked up**, with a
  per-item breakdown underneath. For example:
  - Corndog, Potato + Cheese: 🔥 **Frying**, 2:10 left
  - Corndog, Hot Cheeto: ✅ **Done**
  - Taro Milk Tea: ✅ **Ready**
- The page shows the ETA clock time. If staff move the ETA, the page shows "Updated: now ready
  at 3:42 PM".
- Read it through the `pos_get_order_status(order_id uuid)` RPC. It returns only this order's
  public fields, with no phone number and no data from other orders. The UUID in the URL is the
  capability, so order numbers cannot be guessed.

### 3.6 Sales summary (`/summary`)
- Date-range presets (Today, Yesterday, This week, This month, Custom) and a location filter.
- Figures: gross, tax collected, net, order count and average ticket. Breakdowns by category, by
  item, by payment method, and by source (till or self). Also voids and remakes.
- CSV export.
- Aggregate in SQL (a view or RPC), not by pulling every row into the browser.

### 3.7 Notifications
- Define a `Notifier` interface with the method `notify(order, template)`.
- **v1 implementation:** `SmsLinkNotifier`. It builds an `sms:‹phone›?body=…` link that staff
  tap on the station or the till. Templates:
  - *Received:* "Moon Tea: Order #23 received! Estimated ready at 3:42 PM. Track it: ‹url›"
  - *Ready:* "Moon Tea: Order #23 is ready for pickup!"
  - *Delayed:* "Moon Tea: Sorry, order #23 is running a bit late. New time is 3:50 PM."
- Also write a **stub `TwilioNotifier`** behind an env flag, so switching to automatic texts
  later only needs configuration.

### 3.8 Hardware (iPad): make Bluetooth reliable
**Printer (Epson TM-m30III, ePOS2 SDK, Bluetooth):**
- Create **one long-lived `Epos2Printer` instance** for the life of the app. Never allocate one
  per print, because the SDK's teardown threads race and crash.
- **Stay connected between prints.** Run a keepalive ping every ~30 s and a reconnect watchdog
  with exponential backoff (1, 2, 4, 8 s, capped at 30 s).
- Run discovery in the background at launch. Remember the last printer target and connect to it
  first.
- Keep a **persistent print queue** (`PrintQueueStore`, saved to disk) with states
  queued → printing → done / failed. Retry automatically once the printer reconnects. Failed jobs
  are visible and can be reprinted manually. **A printer error must never block taking an
  order.**
- Show a connection pill (🟢 / 🟡 / 🔴) in the till header. Tapping it opens printer settings
  with a test print.
- Keep transport, formatting and queueing separate: `PrinterTransport` (protocol),
  `EpsonBluetoothTransport`, `ReceiptBuilder`, `PrintManager`.

**Card reader (Square Mobile Payments SDK):**
- Request location and Bluetooth permission **at launch**, not at first pairing. A
  `.notDetermined` permission makes pairing fail silently.
- Authorize the SDK at launch and observe reader state through a `ReaderObserver`.
- Model the reader as a state machine: `notConfigured → unauthorized → disconnected →
  connecting → ready`. Only enable the "Card" button when the reader is `ready`.
- Auto-reconnect with a cooldown, so an unreachable reader doesn't loop retries.
- Every payment uses an idempotency key derived from `client_request_id`, so a retry never
  charges twice.

**Web fallback:** ePOS-Print XML POSTed to the printer's LAN IP. The printer IP is stored per
device. Include a test print button.

---

## 4. Order and unit stages

### Unit stages (one row per physical unit, in `pos_order_units.stage`)

**Corndog station**
```
received ──tap──▶ frying ──tap──▶ done ──(order picked up)──▶ picked_up
   ▲  "Arrived"     "In fryer"      "Out of fryer"
   └──────── Remake (from frying or done) ────────┘
```
- **received** means the unit has arrived on the station board.
- **First tap → `frying`.** The cook has put the corndog in the fryer. Set `started_at = now()`
  and start the 5-minute countdown (`cook_minutes`, from `prep_minutes` + modifier deltas).
- **Second tap → `done`.** The cook took it out of the fryer. Set `done_at = now()`.
- Tapping `done` again does **not** loop back to received. The old system had that accidental
  reset. Use Undo or Remake instead.

**Drink station:** `received → ready → picked_up`, one tap per step.

**Items with no station** (cookies, sides, egg rolls) are created as `ready` right away.

### Order status (derived, never set by hand)
Compute it in **one place**, the Postgres trigger `pos_recompute_order_status` that runs after
any update to `pos_order_units`, and mirror it in a pure TypeScript function for the UI and for
tests:

| Condition | `pos_orders.status` |
|---|---|
| all units `received` | `received` |
| any unit `frying` or partly done | `preparing` |
| **every unit is `done`/`ready`** | **`ready`** → set `completed_at`, show the "Text customer" button |
| staff taps "Picked up" on the order | `picked_up` (all units → `picked_up`) |
| voided | `void` |

This is the rule "When all corndogs in the order are done, the order is complete." A mixed order
(corndogs + drinks) becomes `ready` when **every** unit on every station is done or ready.

Log every stage change to `pos_order_events` with the actor and a timestamp, for audit and for
analytics such as average fry-to-done time.

---

## 5. ETA engine (pure function, fully unit-tested)

`estimateReadyAt({ now, openUnitsAhead, newOrderUnits, settings }) → { readyAt, minutes, breakdown }`
lives in `packages/domain` or `src/domain`, is framework-free, and is shared by the web app and
the RPC (port it to SQL or call it from an Edge Function).

**Rules (confirmed):**
1. **Drinks add 0 minutes.** A drink-only order gets `eta_min_minutes` (default 3) and does
   **not** wait behind the corndog queue.
2. **Every corndog adds 5 minutes of fry time.** The fryer is treated as sequential for ETA
   purposes. Coating adds more:
   - Original: 5 min
   - Hot Cheeto: 5 + 1 = **6 min**
   - Potato: 5 + 3 = **8 min**
3. **Live queue.** The ETA includes remaining corndog work from orders ahead at the same
   location:
   - Units in `received` count their full `cook_minutes`.
   - Units in `frying` count `max(0, cook_minutes − minutes since started_at)`.
   - Units in `done`, `ready` or `picked_up` count 0.
4. `minutes = ceil((queueAhead + thisOrder) × busy_mode_multiplier) + eta_buffer_minutes`,
   floored at `eta_min_minutes`. Round **up** to the whole minute.
5. The order stores `eta_original_at` (the quote) and `eta_at` (the current value, which staff
   can move).

**Worked examples (write these as tests):**
| Queue ahead | New order | Math | Minutes (buffer 0) |
|---|---|---|---|
| empty | 1 Boba | drink only | 3 (min) |
| empty | 1 Original | 5 | 5 |
| 1 Original (received) | 1 Potato + 1 Hot Cheeto | 5 + 8 + 6 | **19** |
| 1 Potato frying, started 3 min ago | 2 Original + 1 Boba | (8−3) + 5 + 5 + 0 | 15 |
| empty, busy ×1.5, buffer 2 | 1 Hot Cheeto | ceil(6×1.5)+2 | 11 |

---

## 6. Buffers and "what if things go wrong"

Build each of these in. They are what makes the project look production-grade.

**Time buffers (don't over-promise)**
- **ETA buffer.** Add `eta_buffer_minutes` (default 2) to every quote. Customers are happier
  when an order is early than when it is late.
- **Busy mode.** Staff use a one-tap multiplier (×1.25 / ×1.5 / ×2) during a rush or when
  short-staffed.
- **Capacity cap.** If open corndog units exceed `max_open_corndogs`, self-order shows "Kitchen
  is very busy, about 25 min wait" and requires the customer to acknowledge it, or auto-pauses
  self-order.
- **Show a range, not a promise.** For example "Ready 3:40–3:45 PM" on the customer page.
- **Auto-drift.** When a `frying` unit runs over its timer, or the queue grows faster than
  quoted, recompute `eta_at` and flag orders where `eta_at − eta_original_at > 5 min` so staff
  can send the "Delayed" text.

**Kitchen mistakes**
- **Undo toast** (5 s) on every stage tap, to handle double-taps and wrong cards.
  **Debounce** taps at 400 ms.
- **Remake** puts the unit back to received, logs the reason, and bumps the ETA by that unit's
  cook time.
- **Fryer timer alarm** at 0:00 and an **overdue** state at +1 min.
- **Stale order alert.** An order still `ready` 10 minutes after completion, or not started 10
  minutes after it was placed, is highlighted in red.
- **Sold-out mid-order.** If an item sells out while it sits in a customer's cart, checkout
  re-validates and asks the customer to swap it.

**Payments**
- Every order carries a client-generated `client_request_id` (UUID) that is **UNIQUE** in the
  DB. A retried submit returns the existing order and never creates a duplicate.
- Square calls use **idempotency keys**. Handle declines, timeouts and "reader disconnected
  mid-payment": show the error, keep the cart, and offer another method.
- **Pending Cash App** orders go into a "Needs payment check" list on the till. They
  auto-expire after 30 min unpaid, but only a person can cancel them.
- **Unpaid "pay at register"** orders are highlighted. Optionally, don't start them until they
  are paid (a setting).
- Payment and order status are **separate fields**. Refunds and voids are events, never deletes.

**Hardware and network**
- **Printer offline:** jobs go into the persistent queue and print when it reconnects. The order
  still saves, and there is an on-screen receipt fallback.
- **Card reader offline:** disable the Card button with the reason. Cash and Cash App keep
  working.
- **Internet drops on the iPad:** keep an **offline outbox**. Orders are saved locally with
  their `client_request_id` and synced when the connection returns. Show an "Offline, N orders
  pending sync" banner. (Order numbers for offline orders are assigned when they sync. Show a
  temporary letter code such as "A7" until then.)
- **Realtime disconnect:** reconnect with backoff, and poll every 10 s in the meantime. Show a
  "Live updates paused" pill.
- **Error boundaries** on every page. Log errors to the console and to `pos_order_events` or a
  logging service.

**Data safety**
- RLS on everything. Customers go only through RPCs. Rate-limit self-order submits per IP and
  per phone.
- Soft deletes plus an audit log make every change traceable.
- Nightly `pg_dump` via GitHub Action, or the Supabase PITR note in the README.

---

## 7. Project structure (web)

```
src/
  app/
    (staff)/order, (staff)/station/[slug], (staff)/summary, (staff)/admin/{menu,settings}
    s/[locationSlug]/            # customer self-order
    s/[locationSlug]/o/[orderId] # customer order status
    api/square/payments/route.ts
  domain/         # PURE TS, no React/Supabase: pricing.ts, tax.ts, eta.ts, orderStatus.ts, stages.ts (+ *.test.ts)
  data/           # Supabase repositories, typed with generated DB types
  features/       # menu-admin, till, station, self-order, summary (components + hooks)
  lib/printing/   # eposXml.ts, printer.ts
  lib/notify/     # Notifier, SmsLinkNotifier, TwilioNotifier (stub)
supabase/migrations, supabase/seed.sql
ios/MoonPOS/      # SwiftUI app: Domain/, Data/, Features/, Hardware/{Printing,Square}/
```

---

## 8. Quality bar
- TypeScript strict, with no `any`. Zod schemas at API and RPC boundaries.
- **≥ 90% coverage on `domain/`** (pricing, tax rounding, ETA, stage transitions, order-status
  derivation). Playwright E2E covers: till order → station taps → order ready; self-order →
  status page updates live; menu edit → till reflects it.
- Accessibility: keyboard navigation, 44 px touch targets, and color never used as the only
  signal (every stage has an icon and text).
- README: screenshots or GIFs, an architecture diagram (Mermaid), the data model, how to run
  locally (`supabase start`), env vars (`.env.example`), and a "Design decisions" section
  covering cents, `timestamptz`, derived status, idempotency and the offline outbox.
- CI must be green before a milestone is done.

---

## 9. Milestones (one PR each)
1. Repo scaffold, CI, Supabase migrations + RLS + seed, generated types
2. `domain/` library with tests (pricing, tax, stages, order status, ETA)
3. Menu admin + settings
4. Staff till (web) with cash, and receipt printing over WiFi
5. Prep stations with fry timer, undo, remake, ETA bump
6. Customer self-order + order-status page + ETA quote
7. Payments: Square web + Cash App pending flow + pay-at-register
8. Sales summary + CSV
9. iPad till: Bluetooth printer queue, Square reader state machine, offline outbox
10. Buffers polish (busy mode, capacity cap, stale alerts), README, demo video

---

## 10. Open questions (ask me before building the affected part)
1. Do cookies, egg rolls, lemonade and sides add **0 min** to the ETA? Does "Half-Half" inside
   change fry time? Does the Hot Cheeto *dust* add-on add time?
2. How many corndogs fit in the fryer at once? (The ETA currently assumes one after another. If
   the fryer holds N, switch rule 2 to batches.)
3. Is the queue **per location**? (Assumed yes.)
4. Should a self-order paid with Cash App or cash start cooking before payment is confirmed?
5. Tip prompt on card payments: yes or no?
6. Default ETA buffer and busy-mode values?
