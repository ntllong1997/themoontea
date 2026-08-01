-- Print queue for the receipt-printer bridge.
--
-- Deliberately a separate table rather than columns on public.orders: print
-- state is a property of an *order*, but orders is one-row-per-line-item, so a
-- print_status column there would mean N rows to flip per receipt and would
-- invent partial-print states.
--
-- Identity is (order_number, order_timestamp), NOT (order_number, day):
--   * "orderNumber" resets to 1 each day, so it is not unique on its own.
--   * date_trunc('day', "timestamp") is not a safe partition either. Both
--     clients write local-midnight bounds serialised as UTC ISO8601 into a
--     `timestamp without time zone` column (see dayBounds() in lib/db.js), so
--     one business day straddles two UTC dates — production rows for business
--     day 2026-07-26 exist at 2026-07-27 00:00-01:57.
--   * The exact `timestamp` the order number was reserved against is shared by
--     that order's line rows and needs no timezone reasoning.
--
-- Orders edited through replace_order_items() re-insert rows with new
-- timestamps. That deliberately does not enqueue a second job: a reprint is an
-- explicit action, not a side effect of editing.

create table if not exists public.print_jobs (
  id              uuid primary key default gen_random_uuid(),
  order_number    int  not null,
  order_timestamp timestamp without time zone not null,
  status          text not null default 'pending'
                    check (status in ('pending','claimed','printed','failed')),
  claimed_by      text,
  claimed_at      timestamptz,
  printed_at      timestamptz,
  attempts        int  not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  -- Idempotency: a retried enqueue, or a second device, can never double-print.
  unique (order_number, order_timestamp)
);

create index if not exists print_jobs_pending_idx
  on public.print_jobs (created_at)
  where status = 'pending';

-- Lets the reaper find jobs abandoned mid-print by a device that died.
create index if not exists print_jobs_claimed_idx
  on public.print_jobs (claimed_at)
  where status = 'claimed';

alter table public.print_jobs enable row level security;

-- Both clients call PostgREST with only the anon key, matching the existing
-- orders_anon_* policies. No DELETE policy, mirroring public.orders.
drop policy if exists print_jobs_anon_select on public.print_jobs;
create policy print_jobs_anon_select on public.print_jobs
  for select to anon using (true);

drop policy if exists print_jobs_anon_insert on public.print_jobs;
create policy print_jobs_anon_insert on public.print_jobs
  for insert to anon with check (true);

drop policy if exists print_jobs_anon_update on public.print_jobs;
create policy print_jobs_anon_update on public.print_jobs
  for update to anon using (true) with check (true);

-- Required for the bridge to get push events. Without this the table is
-- invisible to Realtime and the bridge falls back to its safety poll only.
-- As of this migration the publication contains `menu` alone.
alter publication supabase_realtime add table public.print_jobs;
