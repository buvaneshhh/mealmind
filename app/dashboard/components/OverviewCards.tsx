"use client";

import { motion, useReducedMotion } from "framer-motion";
import SpotlightCard from "@/app/components/SpotlightCard";
import AnimatedNumber from "./AnimatedNumber";
import type { Recommendation, WasteRecord } from "../types";
import { sumWasteKg, todayKey } from "../utils";

const cardHover = "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md";

function Stat({
  label,
  value,
  suffix = "",
  index,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  index: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: "easeOut" }}
    >
      <SpotlightCard className={`rounded-xl p-4 ${cardHover}`} glowColor="rgba(34, 197, 94, 0.3)">
        <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="text-2xl font-semibold">
          {value === null ? (
            <span className="text-base font-normal text-zinc-400">—</span>
          ) : (
            <AnimatedNumber value={value} suffix={suffix} />
          )}
        </p>
      </SpotlightCard>
    </motion.div>
  );
}

export default function OverviewCards({
  records,
  recordsError,
  totalRecordCount,
  recommendations,
}: {
  records: WasteRecord[] | null;
  recordsError: string | null;
  totalRecordCount: number | null;
  recommendations: Recommendation[] | null;
}) {
  const hasRecords = records !== null && !recordsError;
  const today = hasRecords ? sumWasteKg(records!, todayKey()) : null;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekAgoKey = weekAgo.toISOString().slice(0, 10);
  const week = hasRecords ? sumWasteKg(records!, weekAgoKey) : null;

  const complianceRated = hasRecords ? records!.filter((r) => r.compliance_met !== null) : [];
  const complianceRate =
    hasRecords && complianceRated.length > 0
      ? Math.round((complianceRated.filter((r) => r.compliance_met).length / complianceRated.length) * 100)
      : null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Stat label="Today's waste" value={today} suffix="kg" index={0} />
      <Stat label="This week" value={week} suffix="kg" index={1} />
      <Stat label="Total records" value={totalRecordCount} index={2} />
      <Stat label="Compliance rate" value={complianceRate} suffix="%" index={3} />
      <Stat label="Active recommendations" value={recommendations?.length ?? null} index={4} />
    </div>
  );
}
