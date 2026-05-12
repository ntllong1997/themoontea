# The Moon Tea — React Native POS

A mobile POS app built with **Expo + React Native** that:
- Tracks online orders in real-time (Supabase)
- Connects to Bluetooth thermal printers (ESC/POS via BLE)
- Takes payments via **Tap to Pay** (Stripe Terminal NFC) or **Cash App** QR link
- Manages the full menu (categories, items, prices, customizations)
- Tracks item inventory with low-stock alerts

---

## Quick Start

```bash
cd mobile
cp .env.example .env
# Fill in your Supabase + Stripe keys in .env

npm install
npx expo start
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `EXPO_PUBLIC_STRIPE_TERMINAL_LOCATION_ID` | Stripe Terminal location ID |
| `EXPO_PUBLIC_CASHAPP_CASHTAG` | Your Cash App tag (e.g. `$TheMoonTea`) |

---

## Database Setup

Run `supabase/001_menu_items.sql` in your Supabase SQL editor to create the `menu_items` table and inventory RPC.

### Stripe Terminal Backend

Deploy the Edge Function in `supabase/002_stripe_edge_function.ts`:

```bash
supabase functions deploy stripe-connection-token
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
```

---

## Tap to Pay Requirements

- **iOS**: iPhone XS or newer, iOS 16.4+. Requires Apple entitlement `com.apple.developer.proximity-reader.payment.acceptance` — apply via [Apple's request form](https://developer.apple.com/contact/request/payment-acceptance-using-tap-to-pay-on-iphone/).
- **Android**: Supported via Stripe Terminal Android SDK on NFC-capable devices.
- A Stripe account with Terminal enabled is required.

---

## Bluetooth Printer Setup

1. Power on your Bluetooth ESC/POS printer and put it in pairing mode.
2. Open the app → Settings → Printer tab → **Scan for Printers**.
3. Select your printer from the list and tap **Connect**.
4. Choose paper width (58mm or 80mm).

Compatible printers: any ESC/POS BLE thermal printer (MUNBYN, Rongta, Epson, etc.).

---

## App Screens

| Screen | Description |
|---|---|
| **Dashboard** | Order stats, active orders, quick actions |
| **POS** | Menu grid, customization modal, cart, checkout flow |
| **Orders** | Live order tracking with status advancement |
| **Menu** | Add/edit/delete menu items, toggle active |
| **Inventory** | View/adjust stock counts, filter low/out |
| **Settings** | Bluetooth printer, Cash App tag, Stripe keys, store name |

---

## Building for Production

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

Requires an [Expo EAS](https://expo.dev/eas) account.
