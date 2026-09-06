-- Paste this into the Supabase SQL Editor and run it once.
--
-- Tags which engine generated a recommendation: the original rule-based
-- thresholds, or the new regression model (python/regression_model.py),
-- kept side-by-side as a comparison point for the project report. Lets
-- the dashboard and report show which approach is currently active per
-- meal type. Nullable + no default so old rows are simply untagged
-- rather than misleadingly backfilled.

alter table recommendations
  add column if not exists method text check (method in ('rule_based', 'regression'));
