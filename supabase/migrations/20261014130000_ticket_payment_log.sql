-- Payment history on each ticket.
--
-- Step 3 of docs/offline-event-plan.md: a ticket is sent as pending, paid
-- later, and a paid ticket's payment can be corrected (change method, mark
-- unpaid, restore a cancelled ticket). Every change is logged on the ticket
-- ("Cash → Card, Till B, 2:14 PM") so the log has to travel with the order to
-- every phone and survive edits.
--
-- orders is one row per line item, so like status and paid_at the log is
-- copied onto every row of the order. Each entry is
--   {"at": iso8601, "till": text, "from": text, "to": text}.
--
-- Needs 20261013120000_order_status_and_offline_uploads.sql applied first.

alter table public.orders
  add column payment_log jsonb not null default '[]'::jsonb;

-- ============================================================
-- replace_order_items (by number): carry payment_log through an edit.
-- ============================================================
-- Same as 20261013120000 plus payment_log; a client that sends none (the web,
-- an older app build) gets an empty log.
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
     order_uuid, status, paid_at, square_payment_id, payment_log)
  select coalesce(r.id, gen_random_uuid()), target_order_number, p_location, r.name, r.price, r.type,
         r.timestamp, r.phone, r."paymentMethod", r.quantity,
         r.order_uuid, coalesce(r.status, 'paid'), r.paid_at, r.square_payment_id,
         coalesce(r.payment_log, '[]'::jsonb)
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
      square_payment_id text,
      payment_log       jsonb
    )
  returning *;
end $function$;

-- ============================================================
-- replace_order_items_by_uuid: carry payment_log through an edit.
-- ============================================================
-- Same as 20261013120000 plus payment_log. A pending ticket can already have
-- a log (paid, then marked unpaid to fix its items), so an edit must keep it.
create or replace function public.replace_order_items_by_uuid(
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
     order_uuid, status, paid_at, square_payment_id, payment_log)
  select coalesce(r.id, gen_random_uuid()), r."orderNumber", coalesce(r.location, 1), r.name, r.price, r.type,
         r.timestamp, r.phone, r."paymentMethod", r.quantity,
         target_order_uuid, coalesce(r.status, 'paid'), r.paid_at, r.square_payment_id,
         coalesce(r.payment_log, '[]'::jsonb)
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
      square_payment_id text,
      payment_log       jsonb
    )
  returning *;
end $function$;
