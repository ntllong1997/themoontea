-- Live updates for orders.
--
-- The iPhone app subscribes to postgres_changes on orders (SupabaseRealtime),
-- but Supabase only sends them for tables in the supabase_realtime
-- publication, and orders was never added. So the app saw other devices'
-- orders — website orders included — only on its 20 s safety refresh. With
-- this they arrive within about a second; the refresh stays as a backup.
--
-- Realtime follows the table's RLS: anon can already read orders.
-- DELETE events carry only the primary key (id), which is all the app needs.

alter publication supabase_realtime add table public.orders;
