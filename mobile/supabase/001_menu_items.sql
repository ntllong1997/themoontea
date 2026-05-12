-- Menu items table for the React Native POS app.
-- Run this in your Supabase SQL editor.

create table if not exists menu_items (
  id                   text primary key,
  category             text not null default 'Other',
  name                 text not null,
  price                numeric(10, 2) not null default 0,
  description          text not null default '',
  active               boolean not null default true,
  inventory_count      integer not null default 0,
  track_inventory      boolean not null default false,
  image_url            text,
  sort_order           integer not null default 0,
  customization_groups text not null default '[]',
  created_at           timestamptz not null default now()
);

-- Row-level security (enable so only authed staff can write)
alter table menu_items enable row level security;

create policy "Public read menu items"
  on menu_items for select using (true);

create policy "Authenticated write menu items"
  on menu_items for all using (auth.role() = 'authenticated');

-- RPC to atomically adjust inventory
create or replace function adjust_menu_item_inventory(item_id text, delta integer)
returns void language plpgsql as $$
begin
  update menu_items
  set inventory_count = greatest(0, inventory_count + delta)
  where id = item_id;
end;
$$;
