-- Allow logged-out (anon) users to read the hostel directory, so the
-- signup form can show a hostel picker before an account exists.
-- Hostel id/name are non-sensitive directory data (no user or waste data
-- is exposed here) — everything else on `hostels` (insert/update/delete)
-- stays denied for both anon and authenticated. The existing
-- hostels_select_authenticated policy is untouched; this just adds the
-- anon case alongside it (RLS ORs permissive policies together).
create policy "hostels_select_anon"
  on hostels for select
  to anon
  using (true);
