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

**Devices and network** (updated 2026-10-16: no router for now)
- 2+ iPhones (iPhone 11 or newer, iOS 26) running the app.
- **Main phone = the owner's iPhone**: has cell data, app always open, plugged
  in. It takes orders too, hands out ticket numbers 1, 2, 3… in order, receives
  every other phone's orders, **uploads everyone's orders** to Supabase (through
  its upload list, so a weak signal only delays it), and is the **print hub**
  (the Epson stays connected to it by Bluetooth).
- **Other phones may have no signal at all.** They connect to the main phone
  **directly, phone to phone** (Multipeer Connectivity: peer-to-peer WiFi +
  Bluetooth, no router, no WiFi network). WiFi and Bluetooth must be ON, app
  open, within roughly 10–30 ft.
- A phone that takes an order **keeps it saved until the main phone confirms
  it received it** ("got it"), then the main phone owns the upload.
- Uploads are safe from any phone: row ids and order_uuid make a duplicate
  upload a no-op, so any phone that does have signal may also upload.
- If the main phone is unreachable, other tills show "Main phone not connected"
  and wait. **No automatic takeover** (numbers must stay in order). An optional
  manual "Make this the main phone" button may continue from the highest number
  any phone has seen.
- Optional, steadier: the main phone turns on **Personal Hotspot** and the
  others join it — same app, local traffic works even when cell signal is bad.
  A travel router may be added later; the app should work the same on it.
- Phones without signal take orders and **cash**. **Card payments happen on the
  main phone** (Square Reader, online only). Receipts for tickets **sent** from
  a till or the website print on the main phone (print hub).
- Until the paid Apple Developer Program is approved, phones are installed
  from Xcode with a free account (the install expires after 7 days; install
  1–2 days before an event). Nothing in steps 1–5 needs the paid program;
  only TestFlight and Tap to Pay do.
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
2. **Tickets page:** today's unpaid tickets: Edit, Cancel, Pay. **History
   page (the record):** paid and cancelled tickets, filter All / Paid /
   Cancelled; payment corrections only.
3. **Payment page:** Card (in-app, only on the phone with the Square Reader),
   Square app (staff charge in the Square app, then confirm), Cash, Cash App.
   Staff confirm themselves; no lock, no copy-amount helpers needed.
- **The receipt prints when the ticket is sent** (decided 2026-10-17), before
  payment. Staff keep it and hand it to the customer only once payment is
  confirmed. An unpaid ticket's receipt has no "Paid" line. Paying prints
  nothing. (No kitchen ticket; stations use the screen.)
- On Paid: the ticket turns Paid on every phone and station within a second.
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

**Printer:** the Epson stays on Bluetooth to the main phone, which prints every
receipt (print hub). If a router is added later: Epson on Ethernet, and the app
releases the printer after each print so several tills can share it.

## Build plan and status

| Step | What | Status |
|---|---|---|
| 1 | Database: order_uuid, status, paid_at, square_payment_id; never-repeating number counter; uuid-keyed edits | ✅ Applied to *Themoontea* 2026-10-14 and tested there in a rolled-back transaction |
| 2 | App: save orders on the phone first, upload list (`OrderOutbox`), sync badge | ✅ Written, builds in the simulator. Not tested on a phone |
| 3 | App: order → tickets → payment pages, Cancel, payment corrections + log, online-only card, receipt on paid; web till sends pre-orders | ✅ Written; app builds in the simulator, web builds and its unit tests pass. Migration `20261014130000_ticket_payment_log.sql` applied 2026-10-14. Not tested on a phone |
| 4 | App: main phone numbering + direct phone-to-phone sync (Multipeer); main phone uploads everyone's orders; delivery confirmed before the sender lets go | ✅ Written (2026-10-16). Builds; link tested between two simulators and a Mac test till (see below). Not tested on phones |
| 5 | Printing: main phone as print hub for other phones' receipts (router sharing later) | ✅ Print hub written (2026-10-17) with the receipt-at-send rule; builds, logic tested. Router sharing not needed yet. Not tested on phones |

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

## Step 4: what was built

- **Booth screen** (home → Booth): each phone is **Standalone** (default,
  works as before), **Main phone** or **Till**. Becoming main asks to confirm;
  switching a till to main is the manual takeover.
- **One ticket list per phone** (`TicketStore`), shared by every screen and
  loaded at app launch. Standalone/main read Supabase; a till reads only the
  main phone. Every change goes through `TicketStore.submit`.
- **Booth link** (`BoothSync`, MultipeerConnectivity, service
  `moontea-booth`, encrypted): the main phone advertises, tills find it and
  connect on their own. Messages (`BoothMessage`): till → main `hello`,
  `numberRequest`, `change`; main → till `number`, `received` ("got it"),
  `snapshot` (whole day, on connect), `ticket` (one ticket's new rows).
- A till keeps each change on a saved send list until the main phone answers
  "got it"; it resends unconfirmed changes on reconnecting. The main phone
  remembers which changes it took (per day), so a resend never applies twice
  or undoes a newer change. "Got it" is sent only after the change is on the
  main phone's upload list.
- **Numbers** (`TicketNumbers`, `NumberPool`): the main phone keeps 10
  numbers reserved from Supabase's counter while it has signal, so website
  pre-orders can't get the same number. Out of reserved numbers with no
  signal, it continues from the highest number seen and warns ("offline
  numbers") until it can reserve again.
- A till that becomes main/standalone moves its unconfirmed changes onto its
  own upload list. The link stops in the background and restarts on return.
- Status line on the Orders screen: main shows its connected tills; a till
  shows "Connected to main phone" or a red "Main phone not connected".
- Printing: see step 5.

**Tested 2026-10-16:** two simulators (main + till) connected on their own; a
Mac program acting as a till checked numbering (same order → same number,
next order → next number), "got it", ticket broadcasts, payment coming back
paid with the same row ids, a resent old change not undoing the payment, and
the reconnect snapshot (10/10); the main phone's upload list held exactly the
ticket and its payment. The simulators used a fake Supabase address, so
nothing reached the live database. This found and fixed a bug: a till could
take another till for the main phone.

## Step 5: what was built (receipt at send, main phone as print hub)

- Sending a ticket prints its receipt at once (standalone or main phone).
  `ReceiptPrinter` builds it; unpaid receipts have no payment line, a reprint
  of a paid ticket shows "Paid <method>". Paying prints nothing.
- **Main phone = print hub:** any new unpaid ticket that appears on it — sent
  from a till, or a website pre-order arriving through Supabase — prints once,
  2 s after it appears (a website order's rows arrive one by one). Website
  pre-orders that arrived while it was offline print on the next full reload.
- `PrintedTickets` remembers per day which tickets got a receipt, so edits,
  resends, payments and relaunches never print twice. Paid, cancelled and old
  tickets (no `order_uuid`) never auto-print.
- A till's reprint button asks the main phone to print.
- Web till: prints the pre-order's receipt on send when its own WiFi printer
  is connected (at the shop); otherwise the main phone prints it at a booth.
  Don't run a main phone and a connected web printer together, or website
  orders print twice.

## Changes after testing feedback (2026-10-17)

- **Station progress is per phone** (owner's decision). Each unit's stage
  (e.g. a corndog's frying → done) lives in `PrepProgress` on the phone:
  shared by every screen there (stations, Tickets, History), saved across app
  restarts, fresh each day, and **never sent to other phones or Supabase**.
  A payment keeps it; an edit (new rows) restarts it. (Migration
  `20261017120000_order_prep_state.sql` was applied for an earlier attempt
  that synced it; `orders.prep_state` is now unused and can be dropped.)
- **Order tab:** each menu category folds shut with a tap on its header;
  remembered per phone.
- **Status lines** (upload badge, booth link) sit at the bottom of the screen.
- **Tickets and History are separate tabs.** Tickets: unpaid tickets only,
  with Pay / Edit / Cancel (the tab shows how many are waiting). History: the
  day's paid and cancelled tickets, filter All / Paid / Cancelled, paid total,
  and the till name.

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
4. Test step 4 on phones: set the owner's iPhone to Main phone and another to
   Till (Booth screen); with the till in airplane mode (WiFi and Bluetooth
   back on), send, edit, pay and cancel tickets on both; check both screens
   match and the main phone uploads everything; walk the till out of range
   and back (changes resend); force-quit the main phone mid-order.
5. Test step 5: a ticket sent on the main phone, on a till and on the website
   each prints exactly once on the main phone's Epson, with no "Paid" line;
   paying prints nothing; a till's reprint prints on the main phone.

Still needs signal until step 4: getting the ticket number (retried 3 times).

## TestFlight

Not set up yet. Needs the paid Apple Developer Program, an app record for
bundle id `ntl.MoonTea` in App Store Connect, then Product → Archive →
Distribute → App Store Connect from Xcode on a Mac. Optional: add
`ITSAppUsesNonExemptEncryption = NO` to `Info.plist` (the app only uses HTTPS).
