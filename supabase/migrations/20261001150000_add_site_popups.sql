-- Pop-up dates for the calendar on the customer menu site (/menu), managed
-- by staff on the Pop-ups tab of /admin/menu.
--
-- Same security shape as site_menu_items: anon may read, and there are no
-- write policies, so changes only go through the staff-only API routes in
-- app/api/admin/popups/, which use the service-role key.
--
-- Times are local wall-clock 'HH:MM' strings, as the page shows them; the
-- calendar works in the viewer's own time zone, like the code-based list
-- (lib/site/popups.js) it replaces.

create table public.site_popups (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time   text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  name       text not null check (length(trim(name)) > 0),
  place      text not null check (length(trim(place)) > 0),
  address    text,
  note       text,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index site_popups_date_idx on public.site_popups (date);

alter table public.site_popups enable row level security;

create policy site_popups_public_read on public.site_popups
  for select to anon, authenticated
  using (true);
