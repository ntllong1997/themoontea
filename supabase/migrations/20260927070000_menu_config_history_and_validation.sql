-- Harden save_menu (follow-up to 20260927060000_add_menu_config.sql).
--
-- 1. Validate the menu's shape inside the database. The apps validate too,
--    but save_menu is the real trust boundary: anyone holding an admin PIN
--    could call it directly. The rules mirror lib/menu/menuConfig.js
--    (receipt-name collisions stay app-side: they only merge summary rows).
-- 2. Keep every replaced menu in menu_config_history, so a bad save can be
--    rolled back instead of rebuilt by hand:
--      update menu_config set config = (select config from menu_config_history
--        order by replaced_at desc limit 1) where id = 1;

create table public.menu_config_history (
  id          bigint generated always as identity primary key,
  config      jsonb not null,
  saved_at    timestamptz not null,
  saved_by    text,
  replaced_at timestamptz not null default now()
);

-- RLS on with no policies: only save_menu (security definer) and the
-- dashboard can touch it.
alter table public.menu_config_history enable row level security;

-- ============================================================
-- menu_config_problem: null when a menu is acceptable, else why not.
-- ============================================================
create function public.menu_config_problem(p_config jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $function$
declare
  max_price constant numeric := 1000;
  max_items constant int := 200;
  category jsonb;
  grp jsonb;
  opt jsonb;
  keys text[] := '{}';
begin
  if jsonb_typeof(p_config -> 'categories') is distinct from 'array' then
    return 'Menu must contain a categories list';
  end if;
  if jsonb_array_length(p_config -> 'categories') not between 1 and max_items then
    return format('Menu must have between 1 and %s items', max_items);
  end if;

  for category in select * from jsonb_array_elements(p_config -> 'categories') loop
    if jsonb_typeof(category -> 'key') is distinct from 'string' or btrim(category ->> 'key') = ''
       or jsonb_typeof(category -> 'label') is distinct from 'string' or btrim(category ->> 'label') = '' then
      return 'Every item needs a key and a name';
    end if;
    if category ->> 'key' = 'Discount' then
      return '"Discount" is reserved';
    end if;
    if (category ->> 'key') = any(keys) then
      return format('Two items share the key "%s"', category ->> 'key');
    end if;
    keys := keys || (category ->> 'key');

    if jsonb_typeof(category -> 'price') is distinct from 'number'
       or (category ->> 'price')::numeric not between 0 and max_price then
      return format('%s: price must be from 0 to %s', category ->> 'label', max_price);
    end if;
    if jsonb_typeof(category -> 'visible') is distinct from 'boolean' then
      return format('%s: visible must be true or false', category ->> 'label');
    end if;
    if jsonb_typeof(category -> 'optionGroups') is distinct from 'array' then
      return format('%s: optionGroups must be a list', category ->> 'label');
    end if;

    for grp in select * from jsonb_array_elements(category -> 'optionGroups') loop
      if coalesce(grp ->> 'role', '') not in ('name', 'modifier')
         or jsonb_typeof(grp -> 'options') is distinct from 'array'
         or jsonb_array_length(grp -> 'options') = 0 then
        return format('%s: every choice needs a role and at least one option', category ->> 'label');
      end if;
      for opt in select * from jsonb_array_elements(grp -> 'options') loop
        if jsonb_typeof(opt -> 'value') is distinct from 'string' or btrim(opt ->> 'value') = ''
           or jsonb_typeof(opt -> 'price') is distinct from 'number'
           or (opt ->> 'price')::numeric not between 0 and max_price then
          return format('%s: every option needs a name and a price from 0 to %s', category ->> 'label', max_price);
        end if;
      end loop;
    end loop;
  end loop;

  return null;
end;
$function$;

-- ============================================================
-- save_menu: same signature and permissions; now validates in the database
-- and archives the menu it replaces.
-- ============================================================
create or replace function public.save_menu(
  p_employee_id uuid,
  p_pin_hash    text,
  p_config      jsonb
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $function$
declare
  editor_name text;
  problem     text;
  saved_at    timestamptz;
begin
  select name into editor_name
  from employees
  where id = p_employee_id and pin_hash = p_pin_hash and role = 'admin';

  if editor_name is null then
    raise exception 'Only an admin can edit the menu' using errcode = '42501';
  end if;

  problem := menu_config_problem(p_config);
  if problem is not null then
    raise exception '%', problem using errcode = '22023';
  end if;

  insert into menu_config_history (config, saved_at, saved_by)
  select config, updated_at, updated_by from menu_config where id = 1;

  insert into menu_config (id, config, updated_at, updated_by)
  values (1, p_config, now(), editor_name)
  on conflict (id) do update
    set config = excluded.config,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
  returning updated_at into saved_at;

  return saved_at;
end;
$function$;

revoke all on function public.menu_config_problem(jsonb) from public;
