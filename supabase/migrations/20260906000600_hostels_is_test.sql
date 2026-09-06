-- Paste this into the Supabase SQL Editor and run it once.
--
-- "Synthetic Test Hostel" (created by python/generate_synthetic_data.py
-- for testing the regression model) was showing up as a real, selectable
-- option in the signup hostel picker — it has to exist as a genuine row
-- in `hostels` because waste_records.hostel_id has a foreign key into
-- this table, so it can't just be kept out of the database entirely.
-- Instead, tag it so the app can filter it out of anything user-facing.

alter table hostels add column if not exists is_test boolean not null default false;

update hostels set is_test = true where name = 'Synthetic Test Hostel';
