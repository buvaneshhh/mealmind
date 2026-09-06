"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, type Profile } from "@/lib/profile";
import AppHeader from "@/app/components/AppHeader";

type MealType = "breakfast" | "lunch" | "dinner";

const REASONS = [
  { value: "over_preparation", label: "Over-preparation" },
  { value: "disliked_item", label: "Disliked item" },
  { value: "low_turnout", label: "Low turnout" },
  { value: "quality_issue", label: "Quality issue" },
  { value: "other", label: "Other" },
];

export default function LogWastePage() {
  const router = useRouter();
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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <AppHeader title="Log Waste" subtitle={profile?.email} />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <label className="flex flex-col gap-1 text-sm">
            Meal
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Kitchen waste (kg)
            <input
              type="number"
              required
              min={0}
              step={0.1}
              value={kitchenWasteKg}
              onChange={(e) => setKitchenWasteKg(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="0.0"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Plate waste (kg)
            <input
              type="number"
              required
              min={0}
              step={0.1}
              value={plateWasteKg}
              onChange={(e) => setPlateWasteKg(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="0.0"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              Waste record logged. Thank you!
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-green-600 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </form>
      </main>
    </div>
  );
}
