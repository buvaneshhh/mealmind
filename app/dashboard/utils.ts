import type { ChartPoint, WasteRecord } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** YYYY-MM-DD in the viewer's local time (toISOString would give the UTC day). */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function recordDayKey(r: WasteRecord): string {
  return dayKey(new Date(r.timestamp));
}

/** Buckets records into one point per day for the last `days` days (oldest first), zero-filling days with no records. */
export function buildChartPoints(records: WasteRecord[], days: number): ChartPoint[] {
  const buckets = new Map<string, { kitchenKg: number; plateKg: number }>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(dayKey(d), { kitchenKg: 0, plateKg: 0 });
  }

  for (const r of records) {
    const key = recordDayKey(r);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.kitchenKg += r.kitchen_waste_kg;
      bucket.plateKg += r.plate_waste_kg;
    }
  }

  return Array.from(buckets.entries()).map(([date, { kitchenKg, plateKg }]) => ({
    date: date.slice(5), // MM-DD
    kitchenKg: round2(kitchenKg),
    plateKg: round2(plateKg),
    totalKg: round2(kitchenKg + plateKg),
  }));
}

export function sumWasteKg(records: WasteRecord[], sinceKey?: string): number {
  const filtered = sinceKey ? records.filter((r) => recordDayKey(r) >= sinceKey) : records;
  return round2(filtered.reduce((sum, r) => sum + r.kitchen_waste_kg + r.plate_waste_kg, 0));
}

export function todayKey(): string {
  return dayKey(new Date());
}
