-- Payment tracking + ETA for the customer self-order flow.
--
-- Quoted camelCase to match this table's existing JS-originated columns
-- ("orderNumber", "paymentMethod") rather than the plain-lowercase
-- "location" column — Supabase's JS client maps object keys straight onto
-- column names with no case translation, and every row is built in
-- lib/orders/orderModel.js as a camelCase object, so the column name has to
-- be spelled exactly as the JS key or every insert silently 400s.
--
-- "paymentStatus" distinguishes an order that's already settled (a card
-- charge that succeeded, or any till/iPad sale — those have always been paid
-- at the moment they're rung up) from one placed but not yet collected (Cash,
-- paid at the register; Cash App, paid via a link the customer sends
-- separately). Defaulting to 'paid' keeps every existing row, and every
-- future POS/iPad row that never sets this column, correct with no backfill.
--
-- "estimatedReadyAt" is set once at order creation from
-- lib/orders/estimate.js and never recomputed, so the number texted to the
-- customer always matches what's shown on the confirmation screen.
alter table public.orders
  add column "paymentStatus" text not null default 'paid'
  constraint orders_payment_status_check check ("paymentStatus" in ('paid', 'pending')),
  add column "estimatedReadyAt" timestamp without time zone;
