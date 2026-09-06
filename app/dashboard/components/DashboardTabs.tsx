"use client";

import { motion, useReducedMotion } from "framer-motion";

export type DashboardTab = "log" | "recommendations" | "graph";

const TABS: { value: DashboardTab; label: string }[] = [
  { value: "log", label: "Waste Log" },
  { value: "recommendations", label: "Recommendations" },
  { value: "graph", label: "Graph" },
];

export default function DashboardTabs({
  active,
  onChange,
}: {
  active: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label="Dashboard sections"
      className="relative flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-900"
    >
      {TABS.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={active === t.value}
          onClick={() => onChange(t.value)}
          className={`relative z-10 flex-1 rounded-md px-3 py-2.5 text-center transition-colors duration-200 ${
            active === t.value ? "text-black dark:text-white" : "text-zinc-500"
          }`}
        >
          {active === t.value && (
            <motion.span
              layoutId="dashboard-tab-indicator"
              className="absolute inset-0 -z-10 rounded-md bg-white shadow-sm dark:bg-zinc-700"
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 35 }}
            />
          )}
          {t.label}
        </button>
      ))}
    </div>
  );
}
