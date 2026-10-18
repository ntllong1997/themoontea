-- One ticket sequence shared by the booth's main phone and the website.
--
-- At an event the main phone numbers every booth ticket. With signal it asks
-- here for each number, so booth and website tickets interleave in order.
-- With no signal it carries on by itself, and the tickets it numbered
-- offline may not have uploaded yet when signal returns. So it says which
-- number it reached (p_after), and the counter continues after that instead
-- of handing the same numbers out again.
--
-- Same as next_order_number (20261013120000) plus p_after. The website keeps
-- calling next_order_number.

create function public.next_order_number_after(
  range_start timestamp without time zone,
  range_end   timestamp without time zone,
  p_location  integer,
  p_after     integer
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
    and "timestamp" >= range_start
    and "timestamp" <= range_end;

  insert into public.order_number_counters as c (location, day_start, last_number)
  values (p_location, range_start, greatest(max_existing, coalesce(p_after, 0)) + 1)
  on conflict (location, day_start)
  do update set last_number = greatest(c.last_number + 1, max_existing + 1, coalesce(p_after, 0) + 1)
  returning last_number into next_num;

  return next_num;
end;
$function$;

revoke all on function public.next_order_number_after(timestamp without time zone, timestamp without time zone, integer, integer) from public;
grant execute on function public.next_order_number_after(timestamp without time zone, timestamp without time zone, integer, integer) to anon, authenticated, service_role;
