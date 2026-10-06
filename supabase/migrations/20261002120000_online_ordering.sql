-- Online ordering, paid by card through Square.
--
-- Security shape, same as the other site tables: online_orders has RLS on and
-- NO policies, so only the service-role key (server-side API routes) can
-- touch it.

-- ── orders: who placed it, and what they asked for ─────────────────────────
-- One row per unit, like phone, so every unit carries the order's metadata.
-- Nullable: every existing row, and everything the till/iPad write, stays as is.
alter table public.orders
  add column if not exists source        text,   -- 'online' for website orders, else null
  add column if not exists note          text,   -- the customer's note ("less ice")
  add column if not exists customer_name text;

-- ── pop-up location, for the "are you nearby?" check ───────────────────────
alter table public.site_popups
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

alter table public.site_popups
  add constraint site_popups_coordinates_check check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  );

-- ── online orders: the Square payment record ───────────────────────────────
create table public.online_orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       integer not null,
  location           integer not null default 1,
  order_timestamp    timestamp without time zone not null,  -- same value as the orders rows
  popup_id           uuid references public.site_popups(id) on delete set null,
  customer_name      text not null,
  phone              text not null,
  note               text,
  items              jsonb not null,           -- [{ name, qty, price, type }] for the receipt
  subtotal           numeric(8, 2) not null,
  tax                numeric(8, 2) not null,
  total              numeric(8, 2) not null,
  square_payment_id  text unique,
  square_receipt_url text,
  distance_m         integer,                  -- how far the customer said they were
  created_at         timestamptz not null default now()
);

alter table public.online_orders enable row level security;

-- ── editing an order on the iPad keeps its online note ─────────────────────
-- Same function as before (same signature, same rules); it now carries an
-- order's source / note / customer_name over to the replacement rows when the
-- client doesn't send them, which no current client does.
create or replace function public.replace_order_items(
  target_order_number integer,
  range_start         timestamp without time zone,
  range_end           timestamp without time zone,
  new_rows            jsonb,
  p_location          integer default 1
) returns setof public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  kept_source        text;
  kept_note          text;
  kept_customer_name text;
begin
  if new_rows is null or jsonb_typeof(new_rows) <> 'array' then
    raise exception 'new_rows must be a JSON array';
  end if;

  -- Refuse to blank an order outright; voiding is deliberately not supported.
  if jsonb_array_length(new_rows) = 0 then
    raise exception 'replace_order_items requires at least one row';
  end if;

  perform pg_advisory_xact_lock(target_order_number);

  select o.source, o.note, o.customer_name
    into kept_source, kept_note, kept_customer_name
    from public.orders o
   where o."orderNumber" = target_order_number
     and o.location = p_location
     and o.timestamp >= range_start
     and o.timestamp <  range_end
   limit 1;

  -- Day- and location-bounded: "orderNumber" resets to 1 each day at each
  -- location, so an unbounded delete would wipe other orders sharing it.
  delete from public.orders
   where "orderNumber" = target_order_number
     and location = p_location
     and timestamp >= range_start
     and timestamp <  range_end;

  return query
  insert into public.orders
    ("orderNumber", location, name, price, type, timestamp, phone, "paymentMethod", quantity,
     source, note, customer_name)
  select target_order_number, p_location, r.name, r.price, r.type, r.timestamp, r.phone, r."paymentMethod", r.quantity,
         coalesce(r.source, kept_source), coalesce(r.note, kept_note), coalesce(r.customer_name, kept_customer_name)
    from jsonb_to_recordset(new_rows) as r(
      name            text,
      price           double precision,
      type            text,
      timestamp       timestamp without time zone,
      phone           text,
      "paymentMethod" text,
      quantity        int,
      source          text,
      note            text,
      customer_name   text
    )
  returning *;
end $$;
