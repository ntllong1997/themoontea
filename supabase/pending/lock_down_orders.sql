-- Staff access to orders, step 2 of 2: take anon's access away.
--
-- ⚠️ Apply ONLY once the website and EVERY iPhone running the app sign in as
-- staff (Secrets.staffEmail / staffPassword set and the new build installed).
-- An iPhone still on the anon key stops loading and saving orders the moment
-- this runs. To undo, re-create the anon policies and grants dropped below.
--
-- Step 1 is supabase/migrations/20261022120000_staff_access.sql. Once this
-- has been applied, move it into supabase/migrations/ with a timestamp.
--
-- After this, orders and the ticket-number tables are reachable only by the
-- staff login and the service role (the website's server), and the order
-- functions — SECURITY DEFINER, so they bypass RLS — check for staff first.

drop policy if exists orders_anon_select on public.orders;
drop policy if exists orders_anon_insert on public.orders;
drop policy if exists orders_anon_update on public.orders;

drop policy if exists booth_main_phone_anon_select on public.booth_main_phone;
drop policy if exists booth_main_phone_anon_insert on public.booth_main_phone;
drop policy if exists booth_main_phone_anon_update on public.booth_main_phone;
drop policy if exists booth_main_phone_anon_delete on public.booth_main_phone;

drop policy if exists ticket_number_requests_anon_select on public.ticket_number_requests;
drop policy if exists ticket_number_requests_anon_insert on public.ticket_number_requests;

-- The bodies below are unchanged except for the require_staff() line.

create or replace function public.next_order_number(range_start timestamp without time zone, range_end timestamp without time zone, p_location integer default 1)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  max_existing int;
  next_num     int;
begin
  perform public.require_staff();

  perform pg_advisory_xact_lock(hashtext('orders_next_number_' || p_location || '_' || date_trunc('day', range_start)::text)::bigint);

  select coalesce(max("orderNumber"), 0)
  into max_existing
  from public.orders
  where location = p_location
    and "orderNumber" < 1000
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

create or replace function public.next_fallback_order_number(range_start timestamp without time zone, range_end timestamp without time zone, p_location integer default 1)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  max_existing int;
  next_num     int;
begin
  perform public.require_staff();

  perform pg_advisory_xact_lock(hashtext('orders_fallback_number_' || p_location || '_' || date_trunc('day', range_start)::text)::bigint);

  select coalesce(max("orderNumber"), 999)
  into max_existing
  from public.orders
  where location = p_location
    and "orderNumber" >= 1000
    and "timestamp" >= range_start
    and "timestamp" <= range_end;

  insert into public.fallback_number_counters as c (location, day_start, last_number)
  values (p_location, range_start, max_existing + 1)
  on conflict (location, day_start)
  do update set last_number = greatest(c.last_number + 1, max_existing + 1)
  returning last_number into next_num;

  return next_num;
end;
$function$;

create or replace function public.abandon_ticket_number_request(p_order_uuid uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  answered int;
begin
  perform public.require_staff();

  update public.ticket_number_requests
     set abandoned = true
   where order_uuid = p_order_uuid
     and order_number is null;

  select order_number into answered
    from public.ticket_number_requests
   where order_uuid = p_order_uuid;
  return answered;
end;
$function$;

create or replace function public.answer_ticket_number_request(p_order_uuid uuid, p_number integer, p_device text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  updated int;
begin
  perform public.require_staff();

  update public.ticket_number_requests
     set order_number = p_number, answered_by = p_device
   where order_uuid = p_order_uuid
     and order_number is null
     and not abandoned;
  get diagnostics updated = row_count;
  return updated = 1;
end;
$function$;

create or replace function public.replace_order_items(target_order_number integer, range_start timestamp without time zone, range_end timestamp without time zone, new_rows jsonb, p_location integer default 1)
 returns setof orders
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.require_staff();

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

create or replace function public.replace_order_items_by_uuid(target_order_uuid uuid, new_rows jsonb)
 returns setof orders
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.require_staff();

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
     order_uuid, status, paid_at, square_payment_id, payment_log, prep_state)
  select coalesce(r.id, gen_random_uuid()), r."orderNumber", coalesce(r.location, 1), r.name, r.price, r.type,
         r.timestamp, r.phone, r."paymentMethod", r.quantity,
         target_order_uuid, coalesce(r.status, 'paid'), r.paid_at, r.square_payment_id,
         coalesce(r.payment_log, '[]'::jsonb), r.prep_state
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
      payment_log       jsonb,
      prep_state        text
    )
  returning *;
end $function$;

-- Functions are executable by PUBLIC (so anon) unless revoked.
revoke execute on function public.next_order_number(timestamp without time zone, timestamp without time zone, integer) from public, anon;
revoke execute on function public.next_fallback_order_number(timestamp without time zone, timestamp without time zone, integer) from public, anon;
revoke execute on function public.abandon_ticket_number_request(uuid) from public, anon;
revoke execute on function public.answer_ticket_number_request(uuid, integer, text) from public, anon;
revoke execute on function public.replace_order_items(integer, timestamp without time zone, timestamp without time zone, jsonb, integer) from public, anon;
revoke execute on function public.replace_order_items_by_uuid(uuid, jsonb) from public, anon;
-- Granted explicitly, so revoking PUBLIC can't take them from staff or the server.
grant execute on function public.next_order_number(timestamp without time zone, timestamp without time zone, integer) to authenticated, service_role;
grant execute on function public.next_fallback_order_number(timestamp without time zone, timestamp without time zone, integer) to authenticated, service_role;
grant execute on function public.abandon_ticket_number_request(uuid) to authenticated, service_role;
grant execute on function public.answer_ticket_number_request(uuid, integer, text) to authenticated, service_role;
grant execute on function public.replace_order_items(integer, timestamp without time zone, timestamp without time zone, jsonb, integer) to authenticated, service_role;
grant execute on function public.replace_order_items_by_uuid(uuid, jsonb) to authenticated, service_role;

-- SECURITY INVOKER, so RLS already limits it to staff; revoked for tidiness.
revoke execute on function public.recent_order_groups(timestamp without time zone, timestamp without time zone, integer, integer) from public, anon;
grant execute on function public.recent_order_groups(timestamp without time zone, timestamp without time zone, integer, integer) to authenticated, service_role;

-- The old online_orders queue: no code in this repo uses it and it is empty,
-- but both functions hand out customer names and phones to anyone.
revoke execute on function public.claim_online_orders(text, integer) from public, anon, authenticated;
revoke execute on function public.mark_online_order_printed(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_online_orders(text, integer) to service_role;
grant execute on function public.mark_online_order_printed(uuid, text) to service_role;
