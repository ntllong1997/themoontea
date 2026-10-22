-- Staff access to orders, step 1 of 2: let a staff login in, alongside anon.
--
-- Until now every till — the website and the iPhone app — reached orders with
-- the public anon key, and orders let anon read, insert and update any row.
-- That key ships in the customer pages' JavaScript, so anyone could read
-- every customer's phone number or mark a ticket paid.
--
-- The fix is one staff login in Supabase Auth whose app_metadata says
-- role = staff (scripts/create-staff-user.mjs). app_metadata can only be set
-- with the service-role key, so signing yourself up never makes you staff.
--
-- This step only ADDS staff policies. Nothing anon can do changes, so tills
-- that still use the anon key keep working. Once the website and every iPhone
-- sign in as staff, supabase/pending/lock_down_orders.sql removes anon's
-- access (step 2).

-- Whether this request is staff: the staff login, or the service role (the
-- website's server, e.g. placing a customer's online order).
create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'staff'
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

-- For SECURITY DEFINER functions, which bypass RLS: step 2 calls this first
-- thing in each one.
create or replace function public.require_staff()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'staff sign-in required' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.is_staff() to anon, authenticated, service_role;
grant execute on function public.require_staff() to anon, authenticated, service_role;

-- `(select ...)` so Postgres checks it once per query, not once per row.

create policy orders_staff_select on public.orders
  for select to authenticated using ((select public.is_staff()));
create policy orders_staff_insert on public.orders
  for insert to authenticated with check ((select public.is_staff()));
create policy orders_staff_update on public.orders
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

create policy booth_main_phone_staff_all on public.booth_main_phone
  for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

create policy ticket_number_requests_staff_select on public.ticket_number_requests
  for select to authenticated using ((select public.is_staff()));
create policy ticket_number_requests_staff_insert on public.ticket_number_requests
  for insert to authenticated with check ((select public.is_staff()));
