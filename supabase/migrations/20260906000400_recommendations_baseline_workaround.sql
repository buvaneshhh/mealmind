-- Paste this into the Supabase SQL Editor and run it once.
--
-- Workaround for an active Supabase platform incident (PostgREST stale
-- schema-cache bug, reported on status.supabase.com as of 2026-09-02) that
-- was preventing baseline_kitchen_avg_kg (added in
-- 20260906000300_recommendations_baseline.sql) from showing up over the
-- REST API even after a manual reload and a full project restart. Dropping
-- and re-adding the column forces a fresh catalog entry in case that's
-- what the stale cache is keying off of. Safe to run even though the
-- column is brand new and empty on every row.

alter table recommendations drop column if exists baseline_kitchen_avg_kg;
alter table recommendations add column baseline_kitchen_avg_kg numeric;
