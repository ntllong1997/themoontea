-- Daily stock check and the Today board.
--
-- At closing, staff count a short list (`daily_stock_items`): things made in
-- the shop (boba, jelly, batter…) and a few supplies that run out fast (cups,
-- milk). Each item has a target. A made item under its target goes on
-- tomorrow's make list; a supply under its target is "running low".
--
-- The make list, and anything else staff are asked to do, are rows in
-- `daily_tasks`: shown on /today and ticked off when done. A task that isn't
-- done stays on the board until it is.
--
-- RLS on and NO policies, like the schedule tables: only the staff-only
-- /api/admin/daily routes reach these tables, through the service-role key.

-- target: 'make' -> how much to have ready for the day; 'buy' -> below this is
-- running low. 0 means just count it, never flag it.
create table public.daily_stock_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(btrim(name)) > 0),
  kind        text not null check (kind in ('make', 'buy')),
  unit        text,
  target      integer not null default 0 check (target >= 0),
  created_at  timestamptz not null default now()
);
alter table public.daily_stock_items enable row level security;

-- One check per shop day; redoing tonight's check replaces it. `counts` is a
-- snapshot ([{itemId, name, kind, unit, target, count}]) so an old check still
-- reads the same after targets change or items are removed.
create table public.daily_stock_checks (
  id             uuid primary key default gen_random_uuid(),
  check_date     date not null unique,
  employee_id    uuid references public.employees(id) on delete set null,
  employee_name  text not null,
  counts         jsonb not null default '[]',
  note           text,
  submitted_at   timestamptz not null default now()
);
alter table public.daily_stock_checks enable row level security;

-- kind 'make': from a check (make `quantity` `unit` of `title`). kind 'task':
-- added by someone on the Today board. `for_date` is the day it's for; an open
-- task shows on every day from then until someone ticks it off.
create table public.daily_tasks (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('make', 'task')),
  title       text not null check (length(btrim(title)) > 0),
  quantity    integer check (quantity > 0),
  unit        text,
  item_id     uuid references public.daily_stock_items(id) on delete set null,
  check_id    uuid references public.daily_stock_checks(id) on delete cascade,
  for_date    date not null,
  note        text,
  added_by    text,
  done_at     timestamptz,
  done_by     text,
  created_at  timestamptz not null default now()
);
create index daily_tasks_open_idx on public.daily_tasks (for_date) where done_at is null;
create index daily_tasks_done_idx on public.daily_tasks (done_at) where done_at is not null;
alter table public.daily_tasks enable row level security;

-- Bring over the old Daily Check list (Inventory's `inventory_daily_check`, if
-- this database has it) as supplies, with their par level as the target.
-- Staff can switch any of them to "made in-house" afterwards. The old table is
-- left alone; nothing reads it any more.
do $$
begin
  if to_regclass('public.inventory_daily_check') is null then
    return;
  end if;
  if to_regclass('public.inventory_par_levels') is not null then
    execute $q$
      insert into public.daily_stock_items (name, kind, target)
      select btrim(c.item_name), 'buy', greatest(coalesce(p.par_level, 0), 0)::integer
      from public.inventory_daily_check c
      left join public.inventory_par_levels p on p.item_name = c.item_name
      where length(btrim(coalesce(c.item_name, ''))) > 0
      on conflict (name) do nothing
    $q$;
  else
    execute $q$
      insert into public.daily_stock_items (name, kind)
      select btrim(item_name), 'buy'
      from public.inventory_daily_check
      where length(btrim(coalesce(item_name, ''))) > 0
      on conflict (name) do nothing
    $q$;
  end if;
end $$;
