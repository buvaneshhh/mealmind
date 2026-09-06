"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import type { ChartPoint } from "../types";

function ChartSkeleton() {
  return (
    <div className="flex h-[320px] flex-col justify-end gap-2 px-2 pb-2">
      <p className="mb-1 text-sm text-zinc-500">Loading waste data...</p>
      <div className="skeleton h-full w-full rounded-md" />
    </div>
  );
}

export default function WasteGraphSection({
  chartData,
  hasRecords,
  loading,
  error,
}: {
  chartData: ChartPoint[];
  hasRecords: boolean;
  loading: boolean;
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

  if (loading) {
    return <ChartSkeleton />;
  }

  if (!hasRecords) {
    return (
      <p className="py-16 text-center text-sm text-zinc-500">
        Not enough waste data to display the graph yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={chartData} margin={{ left: -10 }}>
        <defs>
          <linearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis dataKey="date" fontSize={12} />
        <YAxis fontSize={12} width={40} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="totalKg"
          name="Total waste"
          stroke="#16a34a"
          strokeWidth={2}
          fill="url(#totalFill)"
          dot={false}
          isAnimationActive={!reduceMotion}
          animationDuration={900}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="kitchenKg"
          name="Kitchen waste"
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          isAnimationActive={!reduceMotion}
          animationDuration={900}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="plateKg"
          name="Plate waste"
          stroke="#d97706"
          strokeWidth={2}
          strokeDasharray="2 2"
          dot={false}
          isAnimationActive={!reduceMotion}
          animationDuration={900}
          animationEasing="ease-out"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
