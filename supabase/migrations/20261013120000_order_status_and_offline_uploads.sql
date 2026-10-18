-- Ticket status, and uploads that are safe to retry.
--
-- The iPhone app now saves an order on the phone first and uploads it later,
-- retrying until Supabase confirms it. That needs three things from here:
--
-- 1. Every order carries a hidden id (order_uuid) made on the phone. Each row's
--    own `id` is also made on the phone, so an upload retried after a timeout
--    that actually landed hits the primary key and is ignored, never doubled
--    (the app inserts with `on_conflict=id` + `resolution=ignore-duplicates`).
--
-- 2. A ticket status: pending (sent to the kitchen, not paid yet), paid, or
--    cancelled. Existing rows, the web till and older app builds write no
--    status and mean "paid", so the default keeps them all correct. The sales
--    summaries count paid tickets only.
--
-- 3. next_order_number never hands out the same number twice. It used to be
--    max("orderNumber") + 1 over uploaded rows, so a number whose order was
--    still waiting on a phone to upload would be handed out again. A per-day
--    counter now remembers every number given out, uploaded or not.
--
-- Edits and phone changes are queued on the phone too, so they need an
-- operation keyed by order_uuid that is safe to repeat: replace_order_items_by_uuid.

-- ============================================================
-- 1 + 2. New columns
-- ============================================================
alter table public.orders
  add column order_uuid uuid,
  add column status text not null default 'paid'
    constraint orders_status_check check (status in ('pending', 'paid', 'cancelled')),
  add column paid_at timestamp without time zone,
  add column square_payment_id text;

create index orders_order_uuid_idx on public.orders (order_uuid) where order_uuid is not null;

-- ============================================================
-- 3. next_order_number: a counter that only moves forward.
-- ============================================================
-- Keyed by the day's start bound exactly as the tills send it, so it lines up
-- with the day-scoped queries everywhere else. RLS on with no policies: only
-- next_order_number (SECURITY DEFINER below) touches it.
create table public.order_number_counters (
  location    integer not null,
  day_start   timestamp without time zone not null,
  last_number integer not null,
  primary key (location, day_start)
);

alter table public.order_number_counters enable row level security;

drop function public.next_order_number(timestamp without time zone, timestamp without time zone, integer);

create function public.next_order_number(
  range_start timestamp without time zone,
  range_end   timestamp without time zone,
  p_location  integer default 1
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  max_existing int;
  next_num     int;
begin
  perform pg_advisory_xact_lock(hashtext('orders_next_number_' || p_location || '_' || date_trunc('day', range_start)::text)::bigint);

  -- Still read the uploaded rows, so a day that started before this counter
  -- existed (or rows written some other way) can never be overtaken.
  select coalesce(max("orderNumber"), 0)
  into max_existing
  from public.orders
  where location = p_location
    and "timestamp" >= range_start
    and "timestamp" <= range_end;

  insert into public.order_number_counters as c (location, day_start, last_number)
  values (p_location, range_start, max_existing + 1)
  on conflict (location, day_start)
  do update set last_number = greatest(c.last_number + 1, max_existing + 1)
  returning last_number into next_num;

  return next_num;
end;
$function$;

revoke all on function public.next_order_number(timestamp without time zone, timestamp without time zone, integer) from public;
grant execute on function public.next_order_number(timestamp without time zone, timestamp without time zone, integer) to anon, authenticated, service_role;

-- ============================================================
-- replace_order_items (by number): keep the new columns through an edit.
-- ============================================================
-- Same signature and behaviour as before. Rows may now also carry id,
-- order_uuid, status, paid_at and square_payment_id; a client that sends none
-- of them (the web, an older app build) gets the column defaults, as before.
create or replace function public.replace_order_items(
  target_order_number int,
  range_start         timestamp without time zone,
  range_end           timestamp without time zone,
  new_rows            jsonb,
  p_location          integer default 1
) returns setof public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new_rows is null or jsonb_typeof(new_rows) <> 'array' then
    raise exception 'new_rows must be a JSON array';
  end if;

  if jsonb_array_length(new_rows) = 0 then
    raise exception 'replace_order_items requires at least one row';
  end if;

  perform pg_advisory_xact_lock(target_order_number);

  delete from public.orders
   where "orderNumber" = target_order_number
     and location = p_location
     and timestamp >= range_start
     and timestamp <  range_end;

  return query
  insert into public.orders
    (id, "orderNumber", location, name, price, type, timestamp, phone, "paymentMethod", quantity,
     order_uuid, status, paid_at, square_payment_id)
  select coalesce(r.id, gen_random_uuid()), target_order_number, p_location, r.name, r.price, r.type,
         r.timestamp, r.phone, r."paymentMethod", r.quantity,
         r.order_uuid, coalesce(r.status, 'paid'), r.paid_at, r.square_payment_id
    from jsonb_to_recordset(new_rows) as r(
      id                uuid,
      name              text,
      price             double precision,
      type              text,
      timestamp         timestamp without time zone,
      phone             text,
      "paymentMethod"   text,
      quantity          int,
      order_uuid        uuid,
      status            text,
      paid_at           timestamp without time zone,
      square_payment_id text
    )
  returning *;
end $function$;

-- ============================================================
-- replace_order_items_by_uuid: an edit that is safe to repeat.
-- ============================================================
-- Replaces every row of one order, found by its hidden id rather than its
-- number. The rows carry their own ids, so running the same queued edit twice
-- deletes and re-inserts the identical rows: same result, no duplicates.
--
-- SECURITY DEFINER for the same reason as replace_order_items: anon has no
-- DELETE policy on orders.
create function public.replace_order_items_by_uuid(
  target_order_uuid uuid,
  new_rows          jsonb
) returns setof public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if target_order_uuid is null then
    raise exception 'target_order_uuid is required';
  end if;

  if new_rows is null or jsonb_typeof(new_rows) <> 'array' then
    raise exception 'new_rows must be a JSON array';
  end if;

  if jsonb_array_length(new_rows) = 0 then
    raise exception 'replace_order_items_by_uuid requires at least one row';
  end if;

  -- Every row must belong to the order being replaced, or one bad edit could
  -- plant rows under another order's id. Compared as uuid, not text: the app
  -- writes uuids in upper case, Postgres prints them in lower case.
  if exists (
    select 1 from jsonb_array_elements(new_rows) e
     where (e ->> 'order_uuid')::uuid is distinct from target_order_uuid
  ) then
    raise exception 'every row must carry order_uuid %', target_order_uuid;
  end if;

  perform pg_advisory_xact_lock(hashtext('orders_replace_' || target_order_uuid::text)::bigint);

  delete from public.orders where order_uuid = target_order_uuid;

  return query
  insert into public.orders
    (id, "orderNumber", location, name, price, type, timestamp, phone, "paymentMethod", quantity,
     order_uuid, status, paid_at, square_payment_id)
  select coalesce(r.id, gen_random_uuid()), r."orderNumber", coalesce(r.location, 1), r.name, r.price, r.type,
         r.timestamp, r.phone, r."paymentMethod", r.quantity,
         target_order_uuid, coalesce(r.status, 'paid'), r.paid_at, r.square_payment_id
    from jsonb_to_recordset(new_rows) as r(
      id                uuid,
      "orderNumber"     int,
      location          int,
      name              text,
      price             double precision,
      type              text,
      timestamp         timestamp without time zone,
      phone             text,
      "paymentMethod"   text,
      quantity          int,
      status            text,
      paid_at           timestamp without time zone,
      square_payment_id text
    )
  returning *;
end $function$;

revoke all on function public.replace_order_items_by_uuid(uuid, jsonb) from public;
grant execute on function public.replace_order_items_by_uuid(uuid, jsonb) to anon, authenticated, service_role;
