-- Paste this into the Supabase SQL Editor and run it once.
--
-- Same PostgREST stale schema-cache incident as
-- 20260906000400_recommendations_baseline_workaround.sql, now hitting
-- hostels.is_test (added in 20260906000600_hostels_is_test.sql): the
-- column exists and is populated, but PostgREST 400s ("42703"/"PGRST204")
-- on any query that references it. Drop/re-add forces a fresh catalog
-- entry, which resolved it for baseline_kitchen_avg_kg last time.

alter table hostels drop column if exists is_test;
alter table hostels add column is_test boolean not null default false;

update hostels set is_test = true where name = 'Synthetic Test Hostel';
