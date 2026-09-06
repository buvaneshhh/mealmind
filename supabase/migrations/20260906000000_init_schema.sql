-- MealMind initial schema + RLS
-- Paste this whole file into the Supabase SQL Editor and run it once.

create extension if not exists pgcrypto;

-- ============================================================
-- SCHEMA
-- ============================================================

create table if not exists hostels (
  id   uuid primary key default gen_random_uuid(),
  name text not null
);

-- One row per auth user, holding app-specific profile data (role, hostel).
-- id is the same uuid as auth.users.id so `auth.uid()` identifies this row directly.
create table if not exists users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null check (role in ('student', 'admin')),
  hostel_id  uuid references hostels(id)
);

create table if not exists waste_records (
  id                 uuid primary key default gen_random_uuid(),
  meal_type          text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  kitchen_waste_kg   numeric not null,
  plate_waste_kg     numeric not null,
  reason             text,
  logged_by          uuid references users(id),
  hostel_id          uuid references hostels(id),
  timestamp          timestamptz not null default now(),
  compliance_met     boolean
);

create table if not exists recommendations (
  id                          uuid primary key default gen_random_uuid(),
  meal_type                   text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  message                     text not null,
  suggested_adjustment_pct    numeric,
  generated_at                timestamptz not null default now(),
  hostel_id                   uuid references hostels(id)
);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================
-- A policy on `users` that queries `users` again (e.g. "am I an admin in
-- this hostel?") would need RLS applied to that inner query too. Supabase's
-- documented fix is a SECURITY DEFINER function: it runs as the function
-- owner (postgres, which bypasses RLS), so it can look up the caller's own
-- role/hostel without re-triggering policy checks or recursing.
-- These only ever return facts about the CALLING user (auth.uid()), so
-- they don't leak any other user's data.

create or replace function current_role_name()
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select role from users where id = auth.uid();
$$;

create or replace function current_hostel_id()
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select hostel_id from users where id = auth.uid();
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table hostels enable row level security;
alter table users enable row level security;
alter table waste_records enable row level security;
alter table recommendations enable row level security;

-- ---------- hostels ----------
-- Every logged-in user needs to read the hostel list (e.g. signup form,
-- displaying a hostel name) but never create/edit/delete one from the client.
-- No insert/update/delete policy = those are denied by default once RLS is on.
create policy "hostels_select_authenticated"
  on hostels for select
  to authenticated
  using (true);

-- ---------- users ----------
-- Read your own profile row (needed on every page to know your own role/hostel).
create policy "users_select_own"
  on users for select
  to authenticated
  using (id = auth.uid());

-- Admins can additionally read every user row in their own hostel
-- (e.g. an admin roster view), but not other hostels.
create policy "users_select_admin_same_hostel"
  on users for select
  to authenticated
  using (current_role_name() = 'admin' and hostel_id = current_hostel_id());

-- Update only your own row (e.g. changing your own display fields later).
-- Admins were NOT given update rights on other users' rows here — the
-- spec only asked for admin READ access to hostel-mates.
create policy "users_update_own"
  on users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Not in the original spec, but required for the app to function: on
-- signup, the client inserts this user's own profile row right after
-- auth.signUp(). Without this, no student or admin could ever get a
-- row created for them. Restricted to inserting your own id only.
create policy "users_insert_own"
  on users for insert
  to authenticated
  with check (id = auth.uid());

-- ---------- waste_records ----------
-- Any authenticated user can log waste, but only attributed to themselves —
-- prevents one user from logging records under someone else's name.
create policy "waste_records_insert_own"
  on waste_records for insert
  to authenticated
  with check (logged_by = auth.uid());

-- Students (and admins) can read back the records they personally logged.
create policy "waste_records_select_own"
  on waste_records for select
  to authenticated
  using (logged_by = auth.uid());

-- Admins can read every record in their own hostel (needed for the dashboard).
create policy "waste_records_select_admin_same_hostel"
  on waste_records for select
  to authenticated
  using (current_role_name() = 'admin' and hostel_id = current_hostel_id());

-- Admins can correct/annotate records in their hostel (e.g. fixing a typo,
-- or setting compliance_met).
create policy "waste_records_update_admin_same_hostel"
  on waste_records for update
  to authenticated
  using (current_role_name() = 'admin' and hostel_id = current_hostel_id())
  with check (current_role_name() = 'admin' and hostel_id = current_hostel_id());

-- Admins can delete bad/duplicate records in their hostel.
create policy "waste_records_delete_admin_same_hostel"
  on waste_records for delete
  to authenticated
  using (current_role_name() = 'admin' and hostel_id = current_hostel_id());

-- ---------- recommendations ----------
-- Any authenticated user can read recommendations for their own hostel only
-- (a student shouldn't see another hostel's prep adjustments).
create policy "recommendations_select_same_hostel"
  on recommendations for select
  to authenticated
  using (hostel_id = current_hostel_id());

-- Deliberately no insert/update/delete policy for `authenticated` or `anon`.
-- With RLS enabled and no write policy, the client can never write here.
-- The Python analysis script uses the service role key, which bypasses
-- RLS entirely, so it can still write recommendations.
