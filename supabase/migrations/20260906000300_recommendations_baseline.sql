-- Paste this into the Supabase SQL Editor and run it once.
--
-- Stores the average kitchen waste (kg) that triggered a kitchen-waste
-- recommendation. Without this, analysis.py has no reference point to
-- check later whether waste actually dropped by the suggested % (compliance
-- tagging) or to tell whether a hostel+meal_type is improving over time
-- (adaptive threshold tightening/loosening). Only set for kitchen-waste
-- recommendations (suggested_adjustment_pct is not null) — plate-waste
-- recommendations aren't a % target and have no compliance concept.

alter table recommendations add column if not exists baseline_kitchen_avg_kg numeric;
