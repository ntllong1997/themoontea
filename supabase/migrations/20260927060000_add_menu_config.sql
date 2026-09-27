-- An editable menu.
--
-- The whole menu is ONE jsonb document in a single-row table, so a save is
-- atomic: a till never sees half of an edit. Its shape is parsed and
-- validated by lib/menu/menuConfig.js (web) and MenuConfig.swift (iPad); a
-- missing or invalid row makes both fall back to the menu built into the app.
--
-- Anyone may read the menu (the tills run on the anon key). Nobody may write
-- the table directly: saves go through save_menu, which checks an ADMIN
-- employee's PIN hash server-side before replacing the document.

create table public.menu_config (
  id         integer primary key default 1 constraint menu_config_single_row check (id = 1),
  config     jsonb not null constraint menu_config_has_categories
             check (jsonb_typeof(config -> 'categories') = 'array'),
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.menu_config enable row level security;

create policy menu_config_read on public.menu_config
  for select to anon, authenticated using (true);

-- ============================================================
-- save_menu: replace the menu, admins only.
-- p_pin_hash is the same SHA-256 hex the web client already computes for
-- verifyPin (lib/employeesDb.js).
-- ============================================================
create function public.save_menu(
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
  saved_at    timestamptz;
begin
  select name into editor_name
  from employees
  where id = p_employee_id and pin_hash = p_pin_hash and role = 'admin';

  if editor_name is null then
    raise exception 'Only an admin can edit the menu' using errcode = '42501';
  end if;

  if jsonb_typeof(p_config -> 'categories') is distinct from 'array' then
    raise exception 'Menu must contain a categories list' using errcode = '22023';
  end if;

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

revoke all on function public.save_menu(uuid, text, jsonb) from public;
grant execute on function public.save_menu(uuid, text, jsonb) to anon, authenticated;
