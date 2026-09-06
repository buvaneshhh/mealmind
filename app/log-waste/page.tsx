"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, type Profile } from "@/lib/profile";
import AppHeader from "@/app/components/AppHeader";
import SpotlightCard from "@/app/components/SpotlightCard";

type MealType = "breakfast" | "lunch" | "dinner";

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

const REASONS = [
  { value: "over_preparation", label: "Over-preparation" },
  { value: "disliked_item", label: "Disliked item" },
  { value: "low_turnout", label: "Low turnout" },
  { value: "quality_issue", label: "Quality issue" },
  { value: "other", label: "Other" },
];

// Green (#16a34a) at 0kg, fading to red (#dc2626) by WASTE_SCALE_KG —
// a rough visual "how much is this" cue, not a precise metric.
const WASTE_SCALE_KG = 15;

function wasteColor(kg: number): string {
  const t = Math.min(Math.max(kg / WASTE_SCALE_KG, 0), 1);
  const r = Math.round(22 + t * (220 - 22));
  const g = Math.round(163 + t * (38 - 163));
  const b = Math.round(74 + t * (38 - 74));
  return `rgb(${r}, ${g}, ${b})`;
}

function WasteLevelBar({ kg }: { kg: number }) {
  const pct = Math.min(Math.max((kg / WASTE_SCALE_KG) * 100, 0), 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
      <motion.div
        className="h-full rounded-full"
        animate={{ width: `${pct}%`, backgroundColor: wasteColor(kg) }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
    </div>
  );
}

function SuccessCheck() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none">
        <motion.circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
        <motion.path
          d="M7 12.5l3 3 7-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: 0.35, ease: "easeOut" }}
        />
      </svg>
      Waste record logged. Thank you!
    </motion.div>
  );
}

export default function LogWastePage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [kitchenWasteKg, setKitchenWasteKg] = useState("");
  const [plateWasteKg, setPlateWasteKg] = useState("");
  const [reason, setReason] = useState(REASONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getCurrentProfile().then((p) => {
      if (!p) {
        router.replace("/login");
        return;
      }
      setProfile(p);
      setCheckingAuth(false);
    });
  }, [router]);

  // Supabase syncs sign-in/sign-out across every tab of the same origin
  // (e.g. an admin checking the dashboard in another tab). Without this,
  // this tab's session can go stale underneath it — bounce back through
  // /login so the right identity loads fresh.
  useEffect(() => {
    if (!profile) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== profile.id) {
        router.replace("/login");
      }
    });
    return () => subscription.unsubscribe();
  }, [profile, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setSuccess(false);

    const kitchen = Number(kitchenWasteKg);
    const plate = Number(plateWasteKg);
    if (!Number.isFinite(kitchen) || kitchen < 0 || !Number.isFinite(plate) || plate < 0) {
      setError("Waste amounts must be zero or a positive number.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("waste_records").insert({
        meal_type: mealType,
        kitchen_waste_kg: kitchen,
        plate_waste_kg: plate,
        reason,
        logged_by: profile.id,
        hostel_id: profile.hostel_id,
      });
      if (error) throw error;

      setSuccess(true);
      setKitchenWasteKg("");
      setPlateWasteKg("");
      setReason(REASONS[0].value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log waste.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingAuth) {
    return <p className="p-6 text-sm text-zinc-500">Loading…</p>;
  }

  const inputClassName =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-200 focus:border-green-500 focus:shadow-[0_0_0_3px_rgba(34,197,94,0.25)] focus-visible:border-green-500 focus-visible:shadow-[0_0_0_3px_rgba(34,197,94,0.25)] dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader title="Log Waste" subtitle={profile?.email} />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
        <SpotlightCard className="rounded-xl p-6 shadow-sm" glowColor="rgba(34, 197, 94, 0.32)">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm">
            Meal
            <div className="relative flex rounded-lg bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-900">
              {MEAL_TYPES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMealType(m.value)}
                  className={`relative z-10 flex-1 rounded-md py-1.5 transition-colors duration-200 ${
                    mealType === m.value ? "text-black dark:text-white" : "text-zinc-500"
                  }`}
                >
                  {mealType === m.value && (
                    <motion.span
                      layoutId="meal-indicator"
                      className="absolute inset-0 -z-10 rounded-md bg-white shadow-sm dark:bg-zinc-700"
                      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            Kitchen waste (kg)
            <motion.input
              whileFocus={reduceMotion ? undefined : { scale: 1.01 }}
              type="number"
              required
              min={0}
              step={0.1}
              value={kitchenWasteKg}
              onChange={(e) => setKitchenWasteKg(e.target.value)}
              className={inputClassName}
              placeholder="0.0"
            />
            <WasteLevelBar kg={Number(kitchenWasteKg) || 0} />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            Plate waste (kg)
            <motion.input
              whileFocus={reduceMotion ? undefined : { scale: 1.01 }}
              type="number"
              required
              min={0}
              step={0.1}
              value={plateWasteKg}
              onChange={(e) => setPlateWasteKg(e.target.value)}
              className={inputClassName}
              placeholder="0.0"
            />
            <WasteLevelBar kg={Number(plateWasteKg) || 0} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Reason
            <motion.select
              whileFocus={reduceMotion ? undefined : { scale: 1.01 }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClassName}
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </motion.select>
          </label>

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
            {success && <SuccessCheck key="success" />}
          </AnimatePresence>

          <motion.button
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            type="submit"
            disabled={submitting}
            className="shine-sweep relative overflow-hidden rounded-md bg-green-600 py-2 text-sm font-medium text-white shadow-lg shadow-green-600/30 transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            <AnimatePresence mode="wait" initial={false}>
              {submitting ? (
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
                  Submitting…
                </motion.span>
              ) : (
                <motion.span
                  key="label"
                  initial={reduceMotion ? undefined : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                >
                  Submit
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </form>
        </SpotlightCard>
        </motion.div>
      </main>
    </div>
  );
}
