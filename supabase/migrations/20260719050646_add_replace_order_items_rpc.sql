-- Atomically replace every line-item row of one order.
--
-- Applied to project woxyzebkqwfxhacwfmft as migration 20260719050646.
--
-- Editing a submitted order means changing which rows exist, not patching them
-- in place: public.orders is one-row-per-line-item, so a quantity of 3 is three
-- rows. Doing that as a client-side DELETE-then-INSERT would destroy a paid
-- order outright if the app died between the two calls, so both happen inside
-- one transaction here.
--
-- SECURITY DEFINER is required, not incidental: RLS on public.orders grants
-- anon only SELECT/INSERT/UPDATE (orders_anon_select / _insert / _update).
-- There is deliberately no DELETE policy, so a security-invoker version of
-- this function would silently delete zero rows and then insert, duplicating
-- the order. Running as owner grants exactly this one narrow replace
-- capability instead of opening blanket DELETE to every device holding the
-- anon key. search_path is pinned so the definer context can't be hijacked.
--
-- Called from MoonTea/MoonTea/Services/SupabaseService.swift
-- (replaceOrderItems(orderNumber:rows:)).
create or replace function public.replace_order_items(
  target_order_number int,
  range_start         timestamp without time zone,
  range_end           timestamp without time zone,
  new_rows            jsonb
) returns setof public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new_rows is null or jsonb_typeof(new_rows) <> 'array' then
    raise exception 'new_rows must be a JSON array';
  end if;

  -- Refuse to blank an order outright; voiding is deliberately not supported.
  if jsonb_array_length(new_rows) = 0 then
    raise exception 'replace_order_items requires at least one row';
  end if;

  -- Same lock domain as next_order_number() so an edit cannot interleave
  -- with a concurrent order-number allocation on another device.
  perform pg_advisory_xact_lock(target_order_number);

  -- Day-bounded: "orderNumber" resets to 1 each day, so an unbounded delete
  -- would wipe every past day's order sharing this number.
  delete from public.orders
   where "orderNumber" = target_order_number
     and timestamp >= range_start
     and timestamp <  range_end;

  return query
  insert into public.orders
    ("orderNumber", name, price, type, timestamp, phone, "paymentMethod", quantity)
  select target_order_number, r.name, r.price, r.type, r.timestamp, r.phone, r."paymentMethod", r.quantity
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
end $$;

revoke all on function public.replace_order_items(int, timestamp without time zone, timestamp without time zone, jsonb) from public;
grant execute on function public.replace_order_items(int, timestamp without time zone, timestamp without time zone, jsonb) to anon, authenticated;
