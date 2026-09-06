import { supabase } from "@/lib/supabase";
import type { Recommendation, WasteRecord } from "./types";

const RECORD_COLUMNS =
  "id,timestamp,meal_type,kitchen_waste_kg,plate_waste_kg,reason,compliance_met,logged_by,users(email)";

/** Waste records for a hostel since `sinceIso`, oldest first, with the logging student's email joined in via the existing logged_by -> users FK (covered by the users_select_admin_same_hostel RLS policy). */
export async function fetchWasteRecords(hostelId: string, sinceIso: string): Promise<WasteRecord[]> {
  const { data, error } = await supabase
    .from("waste_records")
    .select(RECORD_COLUMNS)
    .eq("hostel_id", hostelId)
    .gte("timestamp", sinceIso)
    .order("timestamp", { ascending: true });

  if (error) throw error;
  return data as unknown as WasteRecord[];
}

/** All-time count of waste records for a hostel (for the "Total records" overview stat) — a head-only request, no rows transferred. */
export async function fetchWasteRecordCount(hostelId: string): Promise<number> {
  const { count, error } = await supabase
    .from("waste_records")
    .select("*", { count: "exact", head: true })
    .eq("hostel_id", hostelId);

  if (error) throw error;
  return count ?? 0;
}

const RECOMMENDATION_COLUMNS = "id,meal_type,message,suggested_adjustment_pct,generated_at,method";
const RECOMMENDATION_COLUMNS_FALLBACK = "id,meal_type,message,suggested_adjustment_pct,generated_at";
// ponytail: Supabase has an open platform incident where PostgREST's
// schema cache doesn't always know about a very recently added column
// (here: `method`) yet — fall back to the columns that have always
// worked rather than breaking the whole recommendations panel over it.
const SCHEMA_CACHE_ERROR_CODES = ["42703", "PGRST204"];

export async function fetchRecommendations(hostelId: string): Promise<Recommendation[]> {
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
