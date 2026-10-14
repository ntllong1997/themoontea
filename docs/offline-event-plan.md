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
- **No event mode**, **no customer online ordering** at events. The web till
  keeps working as today (its orders are saved as paid).

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
| 1 | Database: order_uuid, status, paid_at, square_payment_id; never-repeating number counter; uuid-keyed edits | ✅ Written and tested on a local copy of the schema. **Not applied to Supabase yet** |
| 2 | App: save orders on the phone first, upload list (`OrderOutbox`), sync badge | ✅ Written. **Not compiled yet** — build in Xcode and test |
| 3 | App: order → tickets → payment pages, Cancel, payment corrections + log, online-only card, receipt on paid | Not started |
| 4 | App: main phone numbering + booth sync between phones (Multipeer / local network) | Not started |
| 5 | Printer: release the connection after each print for sharing | Not started |

Code from steps 1–2 is on branch `claude/stoic-cray-osbp27`:
- `supabase/migrations/20261013120000_order_status_and_offline_uploads.sql`
- `MoonTea/MoonTea/Services/OrderOutbox.swift` (upload list)
- `MoonTea/MoonTea/Views/Order/UploadStatusBadge.swift`
- `MoonTea/MoonTea/Views/Order/OrderViewModel.swift`, `Services/SupabaseService.swift`, `Models/Order.swift`
- `lib/db.js` (web sales summary counts paid only)

## Before the next step

1. **Apply the migration** to the Supabase project *Themoontea* before installing
   this app build or merging the web change (the app's uploads and the web
   summary use the new columns). Until it is applied, app uploads wait safely on
   the phone.
2. Build in Xcode, fix any compile errors, then test: take an order (badge turns
   green); airplane mode → edit it and change the phone (badge orange, order
   still shown); force-quit and reopen; airplane mode off → everything uploads.
3. Then start step 3.

Still needs signal until step 4: getting the ticket number (retried 3 times).

## TestFlight

Not set up yet. Needs the paid Apple Developer Program, an app record for
bundle id `ntl.MoonTea` in App Store Connect, then Product → Archive →
Distribute → App Store Connect from Xcode on a Mac. Optional: add
`ITSAppUsesNonExemptEncryption = NO` to `Info.plist` (the app only uses HTTPS).
