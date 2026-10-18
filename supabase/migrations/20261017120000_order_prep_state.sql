-- Station progress on each item.
--
-- The stations tap each unit through its category's stages (e.g. a corndog:
-- frying → done). That stage used to live only in the screen where it was
-- tapped, so another screen or phone never saw it. orders is one row per
-- physical unit, so the stage is a column on the row: null = not started,
-- otherwise the name of a stage in that item's flow (MenuCatalog).
--
-- Additive: older apps and the web till don't send it and get null.

alter table public.orders
  add column prep_state text;

-- ============================================================
-- replace_order_items_by_uuid: carry prep_state through a replace.
-- ============================================================
-- Same as 20261014130000 plus prep_state, so rows that keep their id through
-- a replace (a repeated upload) keep their progress.
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
