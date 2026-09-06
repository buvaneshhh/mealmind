"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, type Profile } from "@/lib/profile";
import AppHeader from "@/app/components/AppHeader";

const DAYS = 14;

type WasteRecord = {
  timestamp: string;
  kitchen_waste_kg: number;
  plate_waste_kg: number;
  compliance_met: boolean | null;
};

type Recommendation = {
  id: string;
  meal_type: string;
  message: string;
  suggested_adjustment_pct: number | null;
  generated_at: string;
  method: "rule_based" | "regression" | null;
};

type ChartPoint = { date: string; totalKg: number };

function buildChartPoints(records: WasteRecord[]): ChartPoint[] {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const r of records) {
    const key = r.timestamp.slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, buckets.get(key)! + r.kitchen_waste_kg + r.plate_waste_kg);
    }
  }

  return Array.from(buckets.entries()).map(([date, totalKg]) => ({
    date: date.slice(5), // MM-DD
    totalKg: Math.round(totalKg * 100) / 100,
  }));
}

const RECOMMENDATION_COLUMNS = "id,meal_type,message,suggested_adjustment_pct,generated_at,method";
const RECOMMENDATION_COLUMNS_FALLBACK = "id,meal_type,message,suggested_adjustment_pct,generated_at";
// ponytail: Supabase has an open platform incident where PostgREST's
// schema cache doesn't always know about a very recently added column
// (here: `method`) yet — fall back to the columns that have always
// worked rather than breaking the whole recommendations panel over it.
const SCHEMA_CACHE_ERROR_CODES = ["42703", "PGRST204"];

async function fetchRecommendations(hostelId: string): Promise<Recommendation[]> {
  const res = await supabase
    .from("recommendations")
    .select(RECOMMENDATION_COLUMNS)
    .eq("hostel_id", hostelId)
    .order("generated_at", { ascending: false });

  if (res.error && SCHEMA_CACHE_ERROR_CODES.includes(res.error.code)) {
    const fallback = await supabase
      .from("recommendations")
      .select(RECOMMENDATION_COLUMNS_FALLBACK)
      .eq("hostel_id", hostelId)
      .order("generated_at", { ascending: false });
    if (fallback.error) throw fallback.error;
    return fallback.data.map((r) => ({ ...r, method: null })) as Recommendation[];
  }

  if (res.error) throw res.error;
  return res.data as Recommendation[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [records, setRecords] = useState<WasteRecord[] | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (hostelId: string) => {
    const since = new Date();
    since.setDate(since.getDate() - (DAYS - 1));

    const [recordsRes, recommendations] = await Promise.all([
      supabase
        .from("waste_records")
        .select("timestamp,kitchen_waste_kg,plate_waste_kg,compliance_met")
        .eq("hostel_id", hostelId)
        .gte("timestamp", since.toISOString())
        .order("timestamp", { ascending: true }),
      fetchRecommendations(hostelId),
    ]);

    if (recordsRes.error) throw recordsRes.error;

    setRecords(recordsRes.data as WasteRecord[]);
    setRecommendations(recommendations);
  }, []);

  useEffect(() => {
    getCurrentProfile().then(async (p) => {
      if (!p) {
        router.replace("/login");
        return;
      }
      if (p.role !== "admin") {
        router.replace("/log-waste");
        return;
      }
      setProfile(p);
      setCheckingAuth(false);
      try {
        await loadData(p.hostel_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
      }
    });
  }, [router, loadData]);

  // Live-update as new waste records or recommendations (e.g. from the
  // Python analysis engine, which writes via the service role key and
  // never touches the client) come in for this hostel.
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel(`dashboard_${profile.hostel_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waste_records",
          filter: `hostel_id=eq.${profile.hostel_id}`,
        },
        () => {
          loadData(profile.hostel_id).catch(() => {});
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recommendations",
          filter: `hostel_id=eq.${profile.hostel_id}`,
        },
        () => {
          loadData(profile.hostel_id).catch(() => {});
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, loadData]);

  if (checkingAuth) {
    return <p className="p-6 text-sm text-zinc-500">Loading…</p>;
  }

  const chartData = records ? buildChartPoints(records) : [];
  const complianceRated = records?.filter((r) => r.compliance_met !== null) ?? [];
  const complianceRate =
    complianceRated.length > 0
      ? Math.round(
          (complianceRated.filter((r) => r.compliance_met).length / complianceRated.length) * 100,
        )
      : null;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <AppHeader title="Dashboard" subtitle={profile?.email} />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            Total waste (kg) — last {DAYS} days
          </h2>
          {records === null ? (
            <p className="py-16 text-center text-sm text-zinc-500">Loading chart…</p>
          ) : records.length === 0 ? (
            <p className="py-16 text-center text-sm text-zinc-500">
              No waste records yet for the last {DAYS} days.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} width={40} />
                <Tooltip />
                <Line type="monotone" dataKey="totalKg" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            Recommendation compliance rate
          </h2>
          <p className="text-3xl font-semibold">
            {complianceRate === null ? (
              <span className="text-base font-normal text-zinc-500">No compliance data yet.</span>
            ) : (
              `${complianceRate}%`
            )}
          </p>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            Current recommendations
          </h2>
          {recommendations === null ? (
            <p className="py-8 text-center text-sm text-zinc-500">Loading recommendations…</p>
          ) : recommendations.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No recommendations yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recommendations.map((rec) => (
                <li
                  key={rec.id}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="font-medium capitalize">{rec.meal_type}</span>
                      {rec.method && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {rec.method === "regression" ? "Regression" : "Rule-based"}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {new Date(rec.generated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-zinc-700 dark:text-zinc-300">{rec.message}</p>
                  {rec.suggested_adjustment_pct !== null && (
                    <p className="text-xs text-zinc-500">
                      Suggested adjustment: {rec.suggested_adjustment_pct}%
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
