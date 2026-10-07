-- Staff schedule: who works when, and a private calendar feed per employee.
--
-- People are the existing `employees` rows (the same list the inventory PIN
-- sign-in uses). Everything here has RLS on and NO policies, so only the
-- service-role key (the staff-only /api/admin/schedule routes and the feed
-- route) can read or write it. `employees` itself is open to the anon key,
-- which is why the calendar tokens are kept out of it.

-- A shift either repeats every week on `weekday` (0 = Sunday) from
-- `start_date` until `end_date` (or forever), or happens once on `date`.
-- `skip_dates` are single days a weekly shift doesn't happen (changed or
-- removed for just that day).
create table public.staff_shifts (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  repeat      text not null check (repeat in ('weekly', 'once')),
  weekday     smallint check (weekday between 0 and 6),
  start_date  date,
  end_date    date,
  date        date,
  start_time  time not null,
  end_time    time not null,
  note        text,
  skip_dates  date[] not null default '{}',
  created_at  timestamptz not null default now(),
  check (end_time > start_time),
  check (
    (repeat = 'weekly' and weekday is not null and start_date is not null and date is null
       and (end_date is null or end_date >= start_date))
    or (repeat = 'once' and date is not null and weekday is null and start_date is null and end_date is null)
  )
);
create index staff_shifts_employee_idx on public.staff_shifts (employee_id);
alter table public.staff_shifts enable row level security;

-- Days off: no shifts for that person from start_date to end_date (inclusive).
create table public.staff_time_off (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  note        text,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index staff_time_off_employee_idx on public.staff_time_off (employee_id);
alter table public.staff_time_off enable row level security;

-- The secret in each employee's calendar link (/staff-calendar/<token>.ics).
-- Resetting it gives a new link and stops the old one working.
create table public.staff_calendar_links (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);
alter table public.staff_calendar_links enable row level security;
