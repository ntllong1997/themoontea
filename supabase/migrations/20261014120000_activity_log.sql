-- Activity log: every notable thing the iPad app does (printer and card
-- reader connections, prints, payments, orders, edits, station taps, app
-- lifecycle), written as it happens and read on the staff page /admin/logs.
--
-- Security: the iPad only holds the anon key, so anon may INSERT and nothing
-- else. There is no SELECT policy, so a leaked anon key can add noise but
-- can't read the log back. Reading goes through the staff-only
-- /api/admin/logs route, which uses the service-role key.
--
-- The device makes up each row's `id` (a UUID) and retries uploads until they
-- succeed. A retry after a lost response fails on the primary key instead of
-- creating a second copy; the app then drops the rows already stored. (It
-- can't ask to skip duplicates: `ON CONFLICT (id)` needs a read policy.)
--
-- `created_at` is when it happened, by the device's clock (entries recorded
-- offline upload later). `received_at` is when the row reached the database;
-- the staff page polls on it to find rows that are new since its last look.
--
-- Nothing deletes old rows. To keep the last 90 days, run (or schedule) this:
--   delete from public.activity_log where created_at < now() - interval '90 days';

create table public.activity_log (
  id          uuid primary key,
  created_at  timestamptz not null,
  received_at timestamptz not null default now(),
  source      text not null default 'ios' check (source in ('ios', 'web')),
  device_id   text not null check (length(device_id) between 1 and 64),
  device_name text check (length(device_name) <= 100),
  app_version text check (length(app_version) <= 40),
  session_id  uuid,
  location    smallint,
  level       text not null check (level in ('debug', 'info', 'warning', 'error')),
  category    text not null check (category ~ '^[a-z][a-z0-9_]{0,31}$'),
  message     text not null check (length(message) between 1 and 500),
  details     jsonb check (
    details is null
    or (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8192)
  )
);

create index activity_log_created_at_idx on public.activity_log (created_at desc);
create index activity_log_received_at_idx on public.activity_log (received_at desc);

-- The database sets received_at, whatever the device sends.
create function public.activity_log_stamp_received()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.received_at := now();
  return new;
end;
$$;

create trigger activity_log_stamp_received
  before insert on public.activity_log
  for each row execute function public.activity_log_stamp_received();

alter table public.activity_log enable row level security;

create policy activity_log_device_insert on public.activity_log
  for insert to anon, authenticated
  with check (true);
