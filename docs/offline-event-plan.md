# Offline event mode: plan and status

Hand-off notes for the iPhone app (`MoonTea/`) work that started after a busy
pop-up event where the signal died and orders could not be taken. Read this
before continuing the work in a new session.

## The problem

Both tills needed the internet before an order could exist: the order number
came from Supabase (`next_order_number`), and the order was only saved by an
insert straight after. In a crowd the cell signal failed, so orders failed.
The iPhone app also charged the card *before* saving the order, so a card
could be charged with no order saved.

## Decisions (agreed with the owner)

**Devices and network**
- 3–5 staff iPhones (iPhone 11 or newer, iOS 26) running the app via TestFlight.
- A small travel router at the booth makes a local WiFi; it needs no internet.
- One **main phone**, always on and plugged in, set once in the app's settings.
  It hands out ticket numbers 1, 2, 3… in order to every till over the booth WiFi.
- If the main phone is unreachable, tills show "Main phone not connected" and
  wait. **No automatic takeover** (numbers must stay in order). An optional
  manual "Make this the main phone" button may continue from the highest number
  any phone has seen.
- All phones share every order and status with each other over the booth WiFi.
  Each phone uploads to Supabase whenever it has signal.
- **No event mode**, **no customer online ordering** at events.
- **Taking orders and taking payment are separate jobs** (decided 2026-10-14).
  Staff without an iPhone take orders on the web till from their own phone;
  those are **pre-orders**, saved as Pending with an `order_uuid`, and the
  customer pays at an iPhone before getting the order. The web till has no
  payment buttons and prints nothing on send. (The customer self-order page
  `/order/online` is unchanged and still saves as paid with method `online`.)

**Order → tickets → payment flow**
1. **Order page:** items + phone → Send → ticket saved as **Pending**. The
   stations see it at once and start making it (small pop-up, staff talk).
2. **Tickets page (a record):** all of today's tickets, filter All / Pending /
   Paid / Cancelled. Pending: Edit, Cancel, Pay. Paid/Cancelled: read-only items.
3. **Payment page:** Card (in-app, only on the phone with the Square Reader),
   Square app (staff charge in the Square app, then confirm), Cash, Cash App.
   Staff confirm themselves; no lock, no copy-amount helpers needed.
- On Paid: the ticket turns Paid on every phone and station within a second,
  and **the receipt prints** (no kitchen ticket; stations use the screen).
- Stations show Pending / Paid on each ticket, live.
- **Card payments online only** (`processingMode: .onlineOnly`). No offline
  card payments.
- **Cancel ticket** for walk-aways: marked Cancelled, never deleted; the number
  stays used.
- **Paid tickets: only payment info is editable** — change payment method, mark
  as unpaid (back to Pending), restore a cancelled ticket. Items are never
  edited after paid (mark unpaid, edit, pay again). Each correction is logged on
  the ticket ("Cash → Card, Till B, 2:14 PM"). Correcting an in-app card payment
  warns that the card was really charged and refunds happen in Square Dashboard.
- **No default payment method** — staff tap the one used.
- Sales summary counts **Paid only**; Pending and Cancelled shown separately.

**Printer:** one shared Epson on the router (Ethernet), and the app releases the
printer after each print so several tills can share it.

## Build plan and status

| Step | What | Status |
|---|---|---|
| 1 | Database: order_uuid, status, paid_at, square_payment_id; never-repeating number counter; uuid-keyed edits | ✅ Applied to *Themoontea* 2026-10-14 and tested there in a rolled-back transaction |
| 2 | App: save orders on the phone first, upload list (`OrderOutbox`), sync badge | ✅ Written, builds in the simulator. Not tested on a phone |
| 3 | App: order → tickets → payment pages, Cancel, payment corrections + log, online-only card, receipt on paid; web till sends pre-orders | ✅ Written; app builds in the simulator, web builds and its unit tests pass. Migration `20261014120000_ticket_payment_log.sql` applied 2026-10-14. Not tested on a phone |
| 4 | App: main phone numbering + booth sync between phones (Multipeer / local network) | Not started |
| 5 | Printer: release the connection after each print for sharing | Not started |

Code from steps 1–2 is on branch `claude/stoic-cray-osbp27`:
- `supabase/migrations/20261013120000_order_status_and_offline_uploads.sql`
- `MoonTea/MoonTea/Services/OrderOutbox.swift` (upload list)
- `MoonTea/MoonTea/Views/Order/UploadStatusBadge.swift`
- `MoonTea/MoonTea/Views/Order/OrderViewModel.swift`, `Services/SupabaseService.swift`, `Models/Order.swift`
- `lib/db.js` (web sales summary counts paid only)

## Step 3: what was built

- **Order tab:** "Send to kitchen" saves the ticket as Pending (no payment
  method, no receipt). A "Ticket #N sent — Pay now" banner opens the payment
  page for the ticket just sent.
- **Tickets tab** (was History): filter All / Pending / Paid / Cancelled with
  counts. Pending: Edit, Cancel (confirm), Pay. Paid/Cancelled: Payment, which
  opens the correction page. Website pre-orders have an `order_uuid` and get
  the same actions; only tickets saved before that column existed show none.
  "Paid total" counts paid tickets only. Each phone sets a till name here.
- **Payment page** (`PaymentSheet`): Card (reader on this phone only),
  Square app, Cash, Cash App; no default; each non-reader choice asks to
  confirm. Paying prints the receipt. Square app and reader cards are both
  stored as `Card`; `square_payment_id` marks the reader's.
- **Correction page** (`PaymentCorrectionSheet`): change method, mark unpaid,
  restore a cancelled ticket, and the payment history. Reader-charged tickets
  warn that refunds happen in Square Dashboard.
- **Payment log:** new `orders.payment_log` jsonb column, every row of the
  order, entries `{at, till, from, to}`. Every payment change (including the
  first payment and cancel) is logged.
- Payment changes go through the upload list as one PATCH of the whole
  payment state by `order_uuid` (safe to repeat; keeps row ids, so station
  progress survives payment). Stations show Unpaid / Paid / Cancelled live;
  cancelled tickets are dimmed.
- Card payments use `processingMode: .onlineOnly`.
- Not done: the app's Sales page still shows paid only and doesn't list
  pending/cancelled separately.

## Before the next step

1. ~~Apply both migrations~~ — done 2026-10-14. **Deploy the web change** with
   the app build: an iPhone still on an older build would save web pre-orders'
   payment wrongly, and the old web till would keep saving orders as paid.
2. Build in Xcode, fix any compile errors, then test: take an order (badge turns
   green); airplane mode → edit it and change the phone (badge orange, order
   still shown); force-quit and reopen; airplane mode off → everything uploads.
3. Test step 3: send → Pending on the stations; pay by each method (receipt
   prints, Paid on every phone); cancel; change method; mark unpaid → edit →
   pay; restore a cancelled ticket; check the payment history on another phone.
4. Then start step 4.

Still needs signal until step 4: getting the ticket number (retried 3 times).

## TestFlight

Not set up yet. Needs the paid Apple Developer Program, an app record for
bundle id `ntl.MoonTea` in App Store Connect, then Product → Archive →
Distribute → App Store Connect from Xcode on a Mac. Optional: add
`ITSAppUsesNonExemptEncryption = NO` to `Info.plist` (the app only uses HTTPS).
