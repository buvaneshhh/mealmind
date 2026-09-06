export type MealType = "breakfast" | "lunch" | "dinner";

export type WasteRecord = {
  id: string;
  timestamp: string;
  meal_type: MealType;
  kitchen_waste_kg: number;
  plate_waste_kg: number;
  reason: string | null;
  compliance_met: boolean | null;
  logged_by: string | null;
  users: { email: string } | null;
};

export type RecommendationMethod = "rule_based" | "regression" | null;

export type Recommendation = {
  id: string;
  meal_type: MealType;
  message: string;
  suggested_adjustment_pct: number | null;
  generated_at: string;
  method: RecommendationMethod;
};

export type ChartPoint = { date: string; kitchenKg: number; plateKg: number; totalKg: number };
