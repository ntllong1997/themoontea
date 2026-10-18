-- The booth's main phone numbers the website's orders too.
--
-- At an event the main phone (iPhone app, Booth screen) numbers every booth
-- ticket. While it is registered here, the website asks it for each number
-- through ticket_number_requests instead of using the database counter. If
-- the phone doesn't answer in time (no signal, app closed), the website gives
-- up on the request and numbers the order from its own sequence starting at
-- 1000, which can never clash with the phone's numbers.
--
-- Ordinary numbering (next_order_number, and the phone's own counter) only
-- looks at numbers below 1000, so 1000+ tickets never push it up. Assumes
-- fewer than 1000 tickets a day per location.
--
-- Replaces next_order_number_after (20261017140000): the phone no longer asks
-- the database for numbers.

-- ============================================================
-- Which phone is in charge
-- ============================================================
-- One row = a main phone numbers this location's tickets. The phone adds it
-- on becoming main and removes it on switching back to Standalone or Till;
-- there is no automatic expiry.
create table public.booth_main_phone (
  location    integer primary key,
  device_name text not null,
  started_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

alter table public.booth_main_phone enable row level security;
create policy booth_main_phone_anon_select on public.booth_main_phone for select to anon using (true);
create policy booth_main_phone_anon_insert on public.booth_main_phone for insert to anon with check (true);
create policy booth_main_phone_anon_update on public.booth_main_phone for update to anon using (true) with check (true);
create policy booth_main_phone_anon_delete on public.booth_main_phone for delete to anon using (true);

-- ============================================================
-- Website → main phone number requests
-- ============================================================
create table public.ticket_number_requests (
  order_uuid   uuid primary key,
  location     integer not null,
  requested_at timestamptz not null default now(),
  order_number integer,
  abandoned    boolean not null default false,
  answered_by  text
);

create index ticket_number_requests_open_idx
  on public.ticket_number_requests (location, requested_at)
  where order_number is null and not abandoned;

-- Insert and read only; answering and giving up go through the functions
-- below, which do it atomically.
alter table public.ticket_number_requests enable row level security;
create policy ticket_number_requests_anon_select on public.ticket_number_requests for select to anon using (true);
create policy ticket_number_requests_anon_insert on public.ticket_number_requests for insert to anon with check (true);

alter publication supabase_realtime add table public.ticket_number_requests;

-- The phone answers. True only if the request was still open, so a request
-- the website already gave up on never uses up one of the phone's numbers.
create function public.answer_ticket_number_request(
  p_order_uuid uuid,
  p_number     integer,
  p_device     text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  updated int;
begin
  update public.ticket_number_requests
     set order_number = p_number, answered_by = p_device
   where order_uuid = p_order_uuid
     and order_number is null
     and not abandoned;
  get diagnostics updated = row_count;
  return updated = 1;
end;
$function$;

-- The website gives up waiting. Returns the phone's number if it answered
-- first (use that), or null once the request is marked abandoned (number the
-- order from the 1000+ sequence).
create function public.abandon_ticket_number_request(p_order_uuid uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  answered int;
begin
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

-- ============================================================
-- The website's own sequence when the main phone doesn't answer: 1000, 1001…
-- ============================================================
create table public.fallback_number_counters (
  location    integer not null,
  day_start   timestamp without time zone not null,
  last_number integer not null,
  primary key (location, day_start)
);

alter table public.fallback_number_counters enable row level security;

create function public.next_fallback_order_number(
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

-- ============================================================
-- next_order_number: ignore the 1000+ website sequence
-- ============================================================
-- Same as 20261013120000 except the "orderNumber" < 1000 filter.
create or replace function public.next_order_number(
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

drop function public.next_order_number_after(timestamp without time zone, timestamp without time zone, integer, integer);

revoke all on function public.answer_ticket_number_request(uuid, integer, text) from public;
revoke all on function public.abandon_ticket_number_request(uuid) from public;
revoke all on function public.next_fallback_order_number(timestamp without time zone, timestamp without time zone, integer) from public;
grant execute on function public.answer_ticket_number_request(uuid, integer, text) to anon, authenticated, service_role;
grant execute on function public.abandon_ticket_number_request(uuid) to anon, authenticated, service_role;
grant execute on function public.next_fallback_order_number(timestamp without time zone, timestamp without time zone, integer) to anon, authenticated, service_role;
