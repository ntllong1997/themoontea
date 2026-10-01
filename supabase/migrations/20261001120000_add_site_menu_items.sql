-- The customer menu site's items (/menu), managed by staff at /admin/menu.
--
-- Separate from the till's catalog (lib/menu/catalog.js): this is what
-- customers see, not what the till rings up. The older, unused public.menu
-- table is left untouched.
--
-- Security: anon (the browser's key) may only READ items that aren't hidden.
-- There are deliberately no write policies, so every change goes through the
-- staff-only API routes in app/api/admin/menu/, which use the service-role key
-- on the server. Photos live in the public "menu-photos" bucket: anyone can
-- view them by URL, only the service role can upload or delete.

create table public.site_menu_items (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  name        text not null check (length(trim(name)) > 0),
  description text not null default '',
  price       numeric(7, 2) check (price is null or price >= 0),
  price_note  text,                       -- e.g. 'from', shown before the price
  image_url   text,
  status      text not null default 'available'
              check (status in ('available', 'sold_out', 'hidden')),
  tags        text[] not null default '{}',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index site_menu_items_order_idx on public.site_menu_items (category, sort_order);

alter table public.site_menu_items enable row level security;

create policy site_menu_items_public_read on public.site_menu_items
  for select to anon, authenticated
  using (status <> 'hidden');

create or replace function public.site_menu_items_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger site_menu_items_touch
  before update on public.site_menu_items
  for each row execute function public.site_menu_items_touch();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-photos', 'menu-photos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- What the site showed before this table existed.
insert into public.site_menu_items
  (category, name, description, price, price_note, image_url, status, tags, sort_order)
values
  ('corndogs', 'Korean Corndog', 'A crispy Korean-style corndog on a stick, finished with a zig-zag of sauces. Pick what goes inside, then pick the coating.', 8, null, '/menu/korean-corndog.webp', 'available', array['Made to order'], 10),
  ('boba', 'Brown Sugar Boba Tea', 'Our signature. Creamy milk tiger-striped with caramelized brown sugar syrup, over warm, chewy tapioca pearls.', 8, null, '/menu/brown-sugar-boba.webp', 'available', array['Best seller'], 20),
  ('boba', 'Matcha Brown Sugar', 'Earthy green matcha layered over creamy milk and brown sugar pearls. Sweet, toasty and a little bit grassy.', 8, null, '/menu/matcha-brown-sugar.webp', 'available', '{}', 30),
  ('boba', 'Matcha Strawberry', 'Strawberry purée at the bottom, cold milk in the middle, matcha on top. Stir it up to turn it pink-green. Ask for it matcha-only if you like.', 8, null, '/menu/matcha-strawberry.webp', 'available', '{}', 40),
  ('boba', 'Korean Strawberry', 'Korean-style strawberry milk: chunky strawberry purée swirled into chilled fresh milk. Fruity and creamy.', 8, null, '/menu/korean-strawberry.webp', 'available', array['Caffeine-free'], 50),
  ('boba', 'Golden Taro', 'Velvety purple taro milk over a golden sweet base. Nutty, vanilla-like and smooth. Ask for it taro-only if you like.', 8, null, '/menu/golden-taro.webp', 'available', '{}', 60),
  ('boba', 'Tropical Fruit Tea', 'A bright, refreshing fruit tea loaded with sliced citrus and tropical fruit. Sunshine in a cup.', 8, null, '/menu/tropical-fruit-tea.webp', 'available', '{}', 70),
  ('boba', 'Strawberry Fruit Tea', 'Light, fruity tea shaken with real strawberry pieces. Juicy and not too sweet.', 8, null, '/menu/strawberry-fruit-tea.webp', 'available', '{}', 80),
  ('boba', 'Vietnamese Coffee', 'Bold Vietnamese-style coffee mellowed with sweet condensed milk, served iced. Strong, smooth and rich.', 8, null, '/menu/vietnamese-coffee.webp', 'available', '{}', 90),
  ('bites', 'Egg Rolls', 'Four golden, crackly egg rolls with a savory filling. Perfect for sharing.', 7, null, null, 'hidden', '{}', 100),
  ('bites', 'Spiro Papa', 'A whole potato spiral-cut onto a skewer, fried crisp and seasoned.', 6, null, null, 'hidden', '{}', 110),
  ('bites', 'Cookies', 'Freshly baked cookies. Grab one, or a pack of 3 ($14) or 5 ($23) to share.', 5, 'from', null, 'hidden', '{}', 120),
  ('bites', 'Flan', 'Silky caramel custard, cool and creamy.', 5, null, null, 'hidden', '{}', 130),
  ('bites', 'Lemonade', 'House lemonade, made with tea or topped with fizzy soda. Your pick.', 7, null, null, 'hidden', '{}', 140),
  ('bites', 'Water & Soda', 'Water $1, soda $2.', 1, 'from', null, 'hidden', '{}', 150);
