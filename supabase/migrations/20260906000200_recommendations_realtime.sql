-- Paste this into the Supabase SQL Editor and run it once.
--
-- The dashboard subscribes to postgres_changes on both waste_records and
-- recommendations so it updates live when the Python analysis engine
-- writes a new recommendation. waste_records already emits realtime events
-- (confirmed working); recommendations was never added to the realtime
-- publication, so inserts via the service role key landed in the table but
-- never reached subscribed clients. This adds it.

alter publication supabase_realtime add table recommendations;
