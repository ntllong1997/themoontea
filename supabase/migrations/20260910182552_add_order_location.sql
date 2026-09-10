-- Split orders between two locations.
--
-- Each location has its own till, history and daily order-number count, so
-- "orderNumber" now identifies an order only within one day AND one location.
-- Existing rows, and any client that sends no location (an iPad build from
-- before this change, the online order page), are Location 1 via the default.
--
-- Each function gains a trailing p_location defaulting to 1, so callers that
-- don't pass it still resolve and still mean Location 1. The old signatures
-- are dropped first: leaving them beside the new ones would make PostgREST
-- calls ambiguous. Function bodies are otherwise the live definitions as of
-- 2026-09-10.
--
-- Called from lib/db.js (web) and
-- MoonTea/MoonTea/Services/SupabaseService.swift (iPad, fixed to Location 1).

alter table public.orders
  add column location integer not null default 1
  constraint orders_location_check check (location in (1, 2));

create index orders_location_timestamp_idx on public.orders (location, "timestamp");

-- ============================================================
-- next_order_number: each location counts from 1 every day.
-- ============================================================
drop function public.next_order_number(timestamp without time zone, timestamp without time zone);

create function public.next_order_number(
  range_start timestamp without time zone,
  range_end   timestamp without time zone,
  p_location  integer default 1
) returns integer
language plpgsql
as $function$
declare
  next_num int;
begin
  perform pg_advisory_xact_lock(hashtext('orders_next_number_' || p_location || '_' || date_trunc('day', range_start)::text)::bigint);

  select coalesce(max("orderNumber"), 0) + 1
  into next_num
  from public.orders
  where location = p_location
    and "timestamp" >= range_start
    and "timestamp" <= range_end;

  return next_num;
end;
$function$;

grant execute on function public.next_order_number(timestamp without time zone, timestamp without time zone, integer) to anon, authenticated, service_role;

-- ============================================================
-- recent_order_groups: newest groups at one location.
-- ============================================================
drop function public.recent_order_groups(timestamp without time zone, timestamp without time zone, integer);

create function public.recent_order_groups(
  range_start timestamp without time zone,
  range_end   timestamp without time zone,
  group_limit integer default 20,
  p_location  integer default 1
) returns setof public.orders
language sql
stable
as $function$
  select o.*
  from public.orders o
  where o."orderNumber" in (
    select distinct "orderNumber"
    from public.orders
    where location = p_location
      and "timestamp" >= range_start and "timestamp" <= range_end
    order by "orderNumber" desc
    limit group_limit
  )
  and o.location = p_location
  and o."timestamp" >= range_start and o."timestamp" <= range_end
  order by o."orderNumber" desc, o."timestamp" asc;
$function$;

grant execute on function public.recent_order_groups(timestamp without time zone, timestamp without time zone, integer, integer) to anon, authenticated, service_role;

-- ============================================================
-- replace_order_items: an edit replaces one location's order only.
-- Without the location bound, editing #5 at one location would delete the
-- other location's #5 from the same day.
-- ============================================================
drop function public.replace_order_items(integer, timestamp without time zone, timestamp without time zone, jsonb);

create function public.replace_order_items(
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

  -- Refuse to blank an order outright; voiding is deliberately not supported.
  if jsonb_array_length(new_rows) = 0 then
    raise exception 'replace_order_items requires at least one row';
  end if;

  perform pg_advisory_xact_lock(target_order_number);

  -- Day- and location-bounded: "orderNumber" resets to 1 each day at each
  -- location, so an unbounded delete would wipe other orders sharing it.
  delete from public.orders
   where "orderNumber" = target_order_number
     and location = p_location
     and timestamp >= range_start
     and timestamp <  range_end;

  return query
  insert into public.orders
    ("orderNumber", location, name, price, type, timestamp, phone, "paymentMethod", quantity)
  select target_order_number, p_location, r.name, r.price, r.type, r.timestamp, r.phone, r."paymentMethod", r.quantity
    from jsonb_to_recordset(new_rows) as r(
      name            text,
      price           double precision,
      type            text,
      timestamp       timestamp without time zone,
      phone           text,
      "paymentMethod" text,
      quantity        int
    )
  returning *;
end $function$;

revoke all on function public.replace_order_items(int, timestamp without time zone, timestamp without time zone, jsonb, integer) from public;
grant execute on function public.replace_order_items(int, timestamp without time zone, timestamp without time zone, jsonb, integer) to anon, authenticated, service_role;
