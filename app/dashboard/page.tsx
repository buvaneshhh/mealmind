"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, type Profile } from "@/lib/profile";
import AppHeader from "@/app/components/AppHeader";
import SpotlightCard from "@/app/components/SpotlightCard";
import DashboardTabs, { type DashboardTab } from "./components/DashboardTabs";
import OverviewCards from "./components/OverviewCards";
import WasteLogSection from "./components/WasteLogSection";
import RecommendationsSection from "./components/RecommendationsSection";
import WasteGraphSection from "./components/WasteGraphSection";
import { fetchRecommendations, fetchWasteRecordCount, fetchWasteRecords } from "./data";
import { buildChartPoints } from "./utils";
import type { Recommendation, WasteRecord } from "./types";

const DAYS = 14;
const cardHover = "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md";

export default function DashboardPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [tab, setTab] = useState<DashboardTab>("log");

  const [records, setRecords] = useState<WasteRecord[] | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [totalRecordCount, setTotalRecordCount] = useState<number | null>(null);

  // Each source tracks its own error so one failing query never blocks the
  // others, and each section can tell "genuinely empty" apart from "failed
  // to load" instead of hanging on a loading state forever.
  const loadData = useCallback(async (hostelId: string) => {
    const since = new Date();
    since.setDate(since.getDate() - (DAYS - 1));
    const sinceIso = since.toISOString();

    const [recordsResult, recommendationsResult, countResult] = await Promise.allSettled([
      fetchWasteRecords(hostelId, sinceIso),
      fetchRecommendations(hostelId),
      fetchWasteRecordCount(hostelId),
    ]);

    if (recordsResult.status === "fulfilled") {
      setRecords(recordsResult.value);
      setRecordsError(null);
    } else {
      console.error("[dashboard] failed to load waste records", recordsResult.reason);
      setRecordsError("Unable to load waste records. Please try again.");
    }

    if (recommendationsResult.status === "fulfilled") {
      setRecommendations(recommendationsResult.value);
      setRecommendationsError(null);
    } else {
      console.error("[dashboard] failed to load recommendations", recommendationsResult.reason);
      setRecommendationsError("Unable to load recommendations. Please try again.");
    }

    if (countResult.status === "fulfilled") {
      setTotalRecordCount(countResult.value);
    } else {
      console.error("[dashboard] failed to load waste record count", countResult.reason);
    }
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
      loadData(p.hostel_id);
    });
  }, [router, loadData]);

  // Supabase syncs sign-in/sign-out across every tab of the same origin
  // (e.g. testing as a student in another tab while this one is open as
  // admin). Without this, this tab's session goes stale underneath it —
  // it keeps showing "admin1@..." while its queries silently start
  // running as whoever is now signed in elsewhere, or as no one at all.
  // Bounce back through /login so the right identity/role loads fresh.
  useEffect(() => {
    if (!profile) return; // still loading the initial session — nothing to compare against yet

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== profile.id) {
        router.replace("/login");
      }
    });
    return () => subscription.unsubscribe();
  }, [profile, router]);

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
        (payload) => {
          console.log("[realtime] waste_records event received", payload);
          loadData(profile.hostel_id);
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
        (payload) => {
          console.log("[realtime] recommendations event received", payload);
          loadData(profile.hostel_id);
        },
      )
      .subscribe((status, err) => console.log("[realtime] channel status", status, err));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, loadData]);

  const chartData = useMemo(() => (records ? buildChartPoints(records, DAYS) : []), [records]);

  if (checkingAuth) {
    return <p className="p-6 text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader title="Dashboard" subtitle={profile?.email} />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        <OverviewCards
          records={records}
          recordsError={recordsError}
          totalRecordCount={totalRecordCount}
          recommendations={recommendations}
        />

        <DashboardTabs active={tab} onChange={setTab} />

        <motion.div
          key={tab}
          initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <SpotlightCard className={`rounded-xl p-4 ${cardHover}`} glowColor="rgba(34, 197, 94, 0.3)">
            {tab === "log" && <WasteLogSection records={records} error={recordsError} />}
            {tab === "recommendations" && (
              <RecommendationsSection recommendations={recommendations} error={recommendationsError} />
            )}
            {tab === "graph" && (
              <WasteGraphSection
                chartData={chartData}
                hasRecords={(records?.length ?? 0) > 0}
                loading={records === null}
                error={recordsError}
              />
            )}
          </SpotlightCard>
        </motion.div>
      </main>
    </div>
  );
}
