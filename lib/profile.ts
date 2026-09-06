import { supabase } from "./supabase";

export type Role = "student" | "admin";

export type Profile = {
  id: string;
  email: string;
  role: Role;
  hostel_id: string;
};

/** The signed-in user's own profile row, or null if signed out / no row yet. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id,email,role,hostel_id")
    .eq("id", user.id)
    .maybeSingle();

  return data as Profile | null;
}

/**
 * Creates this user's row in `users` from the role/hostel_id stashed in
 * auth user_metadata at signup, if it doesn't exist yet. Needed because
 * Supabase may require email confirmation before a session exists, so the
 * profile row can't always be created at signup time — this runs again
 * after login as a catch-up.
 */
export async function ensureUserProfile(): Promise<Role | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) return existing.role as Role;

  const meta = user.user_metadata as { role?: Role; hostel_id?: string };
  if (!meta.role || !meta.hostel_id) return null;

  const { error } = await supabase.from("users").insert({
    id: user.id,
    email: user.email!,
    role: meta.role,
    hostel_id: meta.hostel_id,
  });
  if (error) throw error;

  return meta.role;
}
