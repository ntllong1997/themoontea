-- Which phone holds the main-phone row, so a phone switching back to
-- Standalone only removes its own registration — never the one a phone that
-- took over since has written. The app's per-device id (the activity log's).
-- Existing rows (none in practice) get an empty id.

alter table public.booth_main_phone
  add column device_id text not null default '';
