-- MoonTea — public.orders, as the live database actually has it.
--
-- HISTORY / WARNING
-- Earlier revisions of this file described a unified *one-row-per-order* table
-- (source, order_number text like 'P-1043', items jsonb, subtotal/tax/total,
-- print_status, printed_at, printed_by) introduced by migration
-- 20260718190732 unify_orders_table. That migration was REVERTED on
-- 2026-07-19 back to the per-line-item shape below, but this file was not
-- updated, so it described a table that does not exist.
-- `orders-backup-2026-07-19.json` is a snapshot taken just before the revert,
-- so its rows show the abandoned shape too — not current reality.
--
-- Ground truth, in order of reliability: the live database, then
-- supabase/migrations/, then MoonTea/MoonTea/Models/Order.swift and lib/db.js.

-- ============================================================
-- orders — ONE ROW PER LINE ITEM (a quantity of 3 is three rows)
-- ============================================================
-- Verified against project woxyzebkqwfxhacwfmft on 2026-08-01.
create table if not exists public.orders (
    id              uuid primary key default gen_random_uuid(),
    -- Resets to 1 each day, so it identifies an order only *within* a day.
    -- Every read and write must be day-bounded. Allocated by
    -- next_order_number(), which serialises callers behind a day-scoped
    -- advisory lock.
    "orderNumber"   integer not null,
    name            text not null,
    price           double precision not null,
    type            text not null,
    -- `timestamp without time zone`, but both clients write
    -- `new Date().toISOString()` — i.e. UTC wearing no marker. A "business
    -- day" window is therefore local midnight converted to UTC, which means
    -- one business day straddles two UTC dates. Do NOT use
    -- date_trunc('day', "timestamp") as an order key.
    "timestamp"     timestamp without time zone not null default now(),
    phone           text,
    "paymentMethod" text,
    quantity        integer
);

create index if not exists orders_timestamp_idx   on public.orders ("timestamp");
create index if not exists orders_ordernumber_idx on public.orders ("orderNumber");

-- ============================================================
-- Row Level Security
-- Both clients call PostgREST with only the anon key (no user auth).
-- There is deliberately NO DELETE policy — replace_order_items() is
-- SECURITY DEFINER precisely so it can hold that one narrow capability
-- instead of opening blanket DELETE to every device holding the anon key.
-- ============================================================
alter table public.orders enable row level security;

drop policy if exists orders_anon_select on public.orders;
create policy orders_anon_select on public.orders for select to anon using (true);

drop policy if exists orders_anon_insert on public.orders;
create policy orders_anon_insert on public.orders for insert to anon with check (true);

drop policy if exists orders_anon_update on public.orders;
create policy orders_anon_update on public.orders for update to anon using (true) with check (true);

-- ============================================================
-- Functions (definitions live in the database; listed here for orientation)
-- ============================================================
--   next_order_number(range_start, range_end)          -> int
--   recent_order_groups(range_start, range_end, limit)
--   replace_order_items(order_number, range_start, range_end, new_rows)
--       SECURITY DEFINER — see supabase/migrations/20260719050646_*.sql
--   adjust_menu_item_inventory(item_id, delta)

-- ============================================================
-- Related tables
-- ============================================================
--   menu, employees, inventory_items — in use.
--   print_jobs                       — receipt-printer queue, see
--       supabase/migrations/20260801120000_add_print_jobs_queue.sql
--   receipts, receipt_items          — UNRELATED leftovers from a receipt-OCR
--       app (image_url, ai_status, raw_ocr_text). Both empty; nothing in this
--       repo reads them.
--
-- Realtime: the `supabase_realtime` publication contains `menu` and, after the
-- print-queue migration, `print_jobs`. `orders` is NOT published — clients
-- poll it.
