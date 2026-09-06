"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { ensureUserProfile, type Role } from "@/lib/profile";
import SpotlightCard from "@/app/components/SpotlightCard";

type Hostel = { id: string; name: string };
type Mode = "login" | "signup";

function roleHome(role: Role) {
  return role === "admin" ? "/dashboard" : "/log-waste";
}

function AnimatedBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-green-400/30 blur-3xl dark:bg-green-500/20"
        animate={reduceMotion ? undefined : { x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-emerald-300/30 blur-3xl dark:bg-emerald-600/20"
        animate={reduceMotion ? undefined : { x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-300/20 blur-3xl dark:bg-teal-500/10"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "40% 60%" }}
      />
      <div className="grain-overlay" />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
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
        // recently added column (`is_test`) yet. Fall back to filtering
        // by the name the synthetic hostel is seeded under (see
        // 20260906000600_hostels_is_test.sql) instead of dropping the
        // filter entirely — the whole point of is_test was to keep this
        // out of the signup picker, so the fallback has to keep doing that.
        if (error?.code === "42703" || error?.code === "PGRST204") {
          supabase
            .from("hostels")
            .select("id,name")
            .neq("name", "Synthetic Test Hostel")
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

  const inputClassName =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-200 focus:border-green-500 focus:shadow-[0_0_0_3px_rgba(34,197,94,0.25)] focus-visible:border-green-500 focus-visible:shadow-[0_0_0_3px_rgba(34,197,94,0.25)] dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <AnimatedBackground />

      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm"
      >
      <SpotlightCard className="rounded-xl p-6 shadow-xl">
        <h1 className="mb-1 text-2xl font-semibold">MealMind</h1>
        <p className="mb-6 text-sm text-zinc-500">Track and reduce mess food waste.</p>

        <div className="relative mb-6 flex rounded-lg bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-900">
          {(["login", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setInfo(null);
              }}
              className={`relative z-10 flex-1 rounded-md py-1.5 capitalize transition-colors duration-200 ${
                mode === m ? "text-black dark:text-white" : "text-zinc-500"
              }`}
            >
              {mode === m && (
                <motion.span
                  layoutId="mode-indicator"
                  className="absolute inset-0 -z-10 rounded-md bg-white shadow-sm dark:bg-zinc-700"
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <motion.input
              whileFocus={reduceMotion ? undefined : { scale: 1.01 }}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClassName}
              placeholder="you@college.edu"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Password
            <motion.input
              whileFocus={reduceMotion ? undefined : { scale: 1.01 }}
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClassName}
              placeholder="At least 6 characters"
            />
          </label>

          <AnimatePresence initial={false}>
            {mode === "signup" && (
              <motion.div
                key="signup-fields"
                initial={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex flex-col gap-4 overflow-hidden"
              >
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
                  <motion.select
                    whileFocus={reduceMotion ? undefined : { scale: 1.01 }}
                    required
                    value={hostelId}
                    onChange={(e) => setHostelId(e.target.value)}
                    className={inputClassName}
                  >
                    <option value="" disabled>
                      {hostels.length === 0 ? "No hostels available yet" : "Select a hostel"}
                    </option>
                    {hostels.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </motion.select>
                </label>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="popLayout" initial={false}>
            {error && (
              <motion.p
                key="error"
                initial={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
              >
                {error}
              </motion.p>
            )}
            {info && (
              <motion.p
                key="info"
                initial={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
              >
                {info}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            type="submit"
            disabled={loading || (mode === "signup" && hostels.length === 0)}
            className="shine-sweep relative overflow-hidden rounded-md bg-green-600 py-2 text-sm font-medium text-white shadow-lg shadow-green-600/30 transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            <AnimatePresence mode="wait" initial={false}>
              {loading ? (
                <motion.span
                  key="loading"
                  initial={reduceMotion ? undefined : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  className="flex items-center justify-center gap-2"
                >
                  <motion.span
                    className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white"
                    animate={reduceMotion ? undefined : { rotate: 360 }}
                    transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
                  />
                  Please wait…
                </motion.span>
              ) : (
                <motion.span
                  key="label"
                  initial={reduceMotion ? undefined : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                >
                  {mode === "login" ? "Log in" : "Create account"}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </form>
      </SpotlightCard>
      </motion.div>
    </div>
  );
}
