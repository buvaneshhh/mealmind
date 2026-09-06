"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { WasteRecord } from "../types";

const REASON_LABELS: Record<string, string> = {
  over_preparation: "Over-preparation",
  disliked_item: "Disliked item",
  low_turnout: "Low turnout",
  quality_issue: "Quality issue",
  other: "Other",
};

function formatReason(reason: string | null): string {
  if (!reason) return "—";
  return REASON_LABELS[reason] ?? reason;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function LogSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <p className="mb-1 text-sm text-zinc-500">Loading waste data...</p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-10 w-full rounded-md" />
      ))}
    </div>
  );
}

export default function WasteLogSection({
  records,
  error,
}: {
  records: WasteRecord[] | null;
  error: string | null;
}) {
  const reduceMotion = useReducedMotion();

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        {error}
      </p>
    );
  }

  if (records === null) {
    return <LogSkeleton />;
  }

  if (records.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No waste records have been submitted yet.
      </p>
    );
  }

  // Newest first reads better as a log, even though the chart wants oldest-first.
  const sorted = [...records].reverse();

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
          <tr>
            <th className="px-3 py-2 font-medium">Student</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Meal</th>
            <th className="px-3 py-2 font-medium">Kitchen (kg)</th>
            <th className="px-3 py-2 font-medium">Plate (kg)</th>
            <th className="px-3 py-2 font-medium">Total (kg)</th>
            <th className="px-3 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <motion.tbody
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.03 } } }}
        >
          {sorted.map((r) => (
            <motion.tr
              key={r.id}
              variants={{
                hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
            >
              <td className="px-3 py-2 whitespace-nowrap">{r.users?.email ?? "Unknown"}</td>
              <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                {new Date(r.timestamp).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </td>
              <td className="px-3 py-2 capitalize">{r.meal_type}</td>
              <td className="px-3 py-2">{r.kitchen_waste_kg}</td>
              <td className="px-3 py-2">{r.plate_waste_kg}</td>
              <td className="px-3 py-2 font-medium">{round2(r.kitchen_waste_kg + r.plate_waste_kg)}</td>
              <td className="px-3 py-2 text-zinc-500">{formatReason(r.reason)}</td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}
