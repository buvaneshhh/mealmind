-- Paste this into the Supabase SQL Editor and run it once.
--
-- The dashboard's live-update subscription for waste_records was firing
-- inconsistently — no migration ever added this table to the realtime
-- publication (only recommendations was, in 20260906000200). It may have
-- been toggled on manually via the dashboard at some point, but a direct
-- test (insert via an isolated authenticated session while watching an
-- open dashboard tab) showed the waste_records channel event does not
-- fire, while the recommendations one does. This makes sure it's a
-- permanent, idempotent part of the schema rather than a manual toggle
-- that can silently regress.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'waste_records'
  ) then
    alter publication supabase_realtime add table waste_records;
  end if;
end $$;
