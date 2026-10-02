-- Online ordering (paid by card through Square), the loyalty punch card, and
-- auto-printing online orders on the iPad.
--
-- Security shape, same as the other site tables:
--   * online_orders and loyalty_redemptions have RLS on and NO policies, so
--     only the service-role key (server-side API routes) can touch them.
--   * The iPad uses the anon key, so it gets exactly two narrow SECURITY
--     DEFINER functions: claim the next unprinted online orders, and mark one
--     printed. Nothing else about online orders is reachable with anon.

-- ── orders: who placed it, and what they asked for ─────────────────────────
-- One row per unit, like phone, so every unit carries the order's metadata.
-- Nullable: every existing row, and everything the till/iPad write, stays as is.
alter table public.orders
  add column if not exists source        text,   -- 'online' for website orders, else null
  add column if not exists note          text,   -- the customer's note ("less ice")
  add column if not exists customer_name text;

-- Loyalty looks orders up by phone, which is stored as typed. This index is
-- on the same normalised form the lookup uses (last 10 digits).
create index if not exists orders_phone_digits_idx
  on public.orders (right(regexp_replace(phone, '\D', '', 'g'), 10))
  where phone is not null;

-- ── pop-up location, for the "are you nearby?" check ───────────────────────
alter table public.site_popups
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

alter table public.site_popups
  add constraint site_popups_coordinates_check check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  );

-- ── online orders: the payment record, and the print queue ─────────────────
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
  reward_used        boolean not null default false,
  distance_m         integer,                  -- how far the customer said they were
  claimed_at         timestamptz,              -- an iPad took it to print
  claimed_by         text,
  printed_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index online_orders_print_queue_idx
  on public.online_orders (location, created_at)
  where printed_at is null;

alter table public.online_orders enable row level security;

-- ── loyalty: free drinks already given out ─────────────────────────────────
-- Stamps themselves aren't stored: they're counted from paid drinks in
-- `orders` by phone, so every till that records a phone number earns them.
create table public.loyalty_redemptions (
  id              uuid primary key default gen_random_uuid(),
  phone_digits    text not null check (phone_digits ~ '^[0-9]{10}$'),
  source          text not null check (source in ('online', 'staff')),
  online_order_id uuid references public.online_orders(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index loyalty_redemptions_phone_idx on public.loyalty_redemptions (phone_digits);

alter table public.loyalty_redemptions enable row level security;

-- Paid drinks and redemptions for one phone (10 digits). Called by the
-- server with the service role only.
create or replace function public.loyalty_summary(p_digits text, p_types text[])
returns table (paid_drinks integer, redeemed integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    (select count(*)::int
       from public.orders
      where phone is not null
        and right(regexp_replace(phone, '\D', '', 'g'), 10) = p_digits
        and type = any (p_types)
        and price > 0),
    (select count(*)::int
       from public.loyalty_redemptions
      where phone_digits = p_digits);
$$;

revoke all on function public.loyalty_summary(text, text[]) from public, anon, authenticated;
grant execute on function public.loyalty_summary(text, text[]) to service_role;

-- ── the iPad's print queue ─────────────────────────────────────────────────
-- Claims up to 5 unprinted online orders for one device. A claim that isn't
-- marked printed within 2 minutes (the iPad crashed, the printer was off)
-- is up for grabs again, so an order is never silently lost. SKIP LOCKED +
-- the claim makes two iPads polling at once each get different orders.
create or replace function public.claim_online_orders(p_device text, p_location integer default 1)
returns table (
  id              uuid,
  order_number    integer,
  order_timestamp timestamp without time zone,
  customer_name   text,
  phone           text,
  note            text,
  items           jsonb,
  subtotal        numeric,
  tax             numeric,
  total           numeric,
  reward_used     boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_device is null or length(trim(p_device)) = 0 then
    raise exception 'p_device is required';
  end if;

  return query
  update public.online_orders o
     set claimed_at = now(), claimed_by = p_device
   where o.id in (
     select q.id
       from public.online_orders q
      where q.location = p_location
        and q.printed_at is null
        and (q.claimed_at is null or q.claimed_at < now() - interval '2 minutes')
        -- Don't resurrect yesterday's backlog when an iPad is switched on.
        and q.created_at > now() - interval '12 hours'
      order by q.created_at
      limit 5
      for update skip locked
   )
  returning o.id, o.order_number, o.order_timestamp, o.customer_name, o.phone, o.note,
            o.items, o.subtotal, o.tax, o.total, o.reward_used;
end $$;

create or replace function public.mark_online_order_printed(p_id uuid, p_device text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.online_orders
     set printed_at = now()
   where id = p_id and claimed_by = p_device and printed_at is null;
  return found;
end $$;

revoke all on function public.claim_online_orders(text, integer) from public;
revoke all on function public.mark_online_order_printed(uuid, text) from public;
grant execute on function public.claim_online_orders(text, integer) to anon, authenticated, service_role;
grant execute on function public.mark_online_order_printed(uuid, text) to anon, authenticated, service_role;

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
