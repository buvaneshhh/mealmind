"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureUserProfile, type Role } from "@/lib/profile";

type Hostel = { id: string; name: string };
type Mode = "login" | "signup";

function roleHome(role: Role) {
  return role === "admin" ? "/dashboard" : "/log-waste";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [hostelId, setHostelId] = useState("");
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Redirect away if already signed in, and load the hostel picker.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const existingRole = await ensureUserProfile().catch(() => null);
      if (existingRole) router.replace(roleHome(existingRole));
    });

    supabase
      .from("hostels")
      .select("id,name")
      .eq("is_test", false)
      .order("name")
      .then(({ data, error }) => {
        if (!error && data) {
          setHostels(data);
          return;
        }
        // ponytail: Supabase has an open platform incident where
        // PostgREST's schema cache doesn't always know about a very
        // recently added column (`is_test`) yet — fall back to showing
        // every hostel rather than breaking signup entirely over it.
        if (error?.code === "42703" || error?.code === "PGRST204") {
          supabase
            .from("hostels")
            .select("id,name")
            .order("name")
            .then(({ data, error }) => {
              if (!error && data) setHostels(data);
            });
        }
      });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === "signup" && !hostelId) {
      setError("Please select a hostel.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { role, hostel_id: hostelId } },
        });
        if (error) throw error;

        if (data.session) {
          const createdRole = await ensureUserProfile();
          router.replace(roleHome(createdRole ?? role));
        } else {
          setInfo("Account created. Check your email to confirm it, then log in below.");
          setMode("login");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const existingRole = await ensureUserProfile();
        if (!existingRole) {
          throw new Error(
            "No profile found for this account. Contact an admin to get set up.",
          );
        }
        router.replace(roleHome(existingRole));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-1 text-2xl font-semibold">MealMind</h1>
        <p className="mb-6 text-sm text-zinc-500">Track and reduce mess food waste.</p>

        <div className="mb-6 flex rounded-lg bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-900">
          {(["login", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 rounded-md py-1.5 capitalize transition-colors ${
                mode === m
                  ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white"
                  : "text-zinc-500"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="you@college.edu"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="At least 6 characters"
            />
          </label>

          {mode === "signup" && (
            <>
              <fieldset className="flex flex-col gap-1 text-sm">
                <legend className="mb-1">Role</legend>
                <div className="flex gap-4">
                  {(["student", "admin"] as Role[]).map((r) => (
                    <label key={r} className="flex items-center gap-2 capitalize">
                      <input
                        type="radio"
                        name="role"
                        value={r}
                        checked={role === r}
                        onChange={() => setRole(r)}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex flex-col gap-1 text-sm">
                Hostel
                <select
                  required
                  value={hostelId}
                  onChange={(e) => setHostelId(e.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="" disabled>
                    {hostels.length === 0 ? "No hostels available yet" : "Select a hostel"}
                  </option>
                  {hostels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || (mode === "signup" && hostels.length === 0)}
            className="rounded-md bg-green-600 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
