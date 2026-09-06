"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Recommendation } from "../types";

function RuleBasedIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3">
      <path d="M4 6h12M4 10h8M4 14h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function RegressionIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3">
      <path
        d="M3 14l4.5-5 3.5 3 5.5-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 5h4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MethodBadge({ method }: { method: Recommendation["method"] }) {
  if (!method) {
    return (
      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        Method unavailable
      </span>
    );
  }
  const isRegression = method === "regression";
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        isRegression
          ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
          : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      }`}
    >
      {isRegression ? <RegressionIcon /> : <RuleBasedIcon />}
      {isRegression ? "Regression" : "Rule-based"}
    </span>
  );
}

function RecommendationsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <p className="mb-1 text-sm text-zinc-500">Loading recommendations...</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-16 w-full rounded-md" />
      ))}
    </div>
  );
}

export default function RecommendationsSection({
  recommendations,
  error,
}: {
  recommendations: Recommendation[] | null;
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

  if (recommendations === null) {
    return <RecommendationsSkeleton />;
  }

  if (recommendations.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">No recommendations available yet.</p>;
  }

  return (
    <motion.ul
      className="flex flex-col gap-3"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.08 } } }}
    >
      {recommendations.map((rec) => (
        <motion.li
          key={rec.id}
          variants={{
            hidden: reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="font-medium capitalize">{rec.meal_type}</span>
              <MethodBadge method={rec.method} />
            </span>
            <span className="text-xs text-zinc-500">{new Date(rec.generated_at).toLocaleDateString()}</span>
          </div>
          <p className="text-zinc-700 dark:text-zinc-300">{rec.message}</p>
          {rec.suggested_adjustment_pct !== null && (
            <p className="text-xs text-zinc-500">Suggested adjustment: {rec.suggested_adjustment_pct}%</p>
          )}
        </motion.li>
      ))}
    </motion.ul>
  );
}
