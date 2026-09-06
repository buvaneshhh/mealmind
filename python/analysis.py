"""Analyzes the last 14 days of waste_records and writes recommendations.

Run from the project root: .venv/bin/python python/analysis.py
Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env (service role key
bypasses RLS, which is required and expected here — see the migration's
comment on the recommendations table policies).
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
from supabase import Client, create_client

KITCHEN_WASTE_THRESHOLD_KG = 10
PLATE_WASTE_THRESHOLD_KG = 1.5
MAX_PREP_REDUCTION_PCT = 20


def load_env(path: Path) -> dict[str, str]:
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def build_recommendations(records: list[dict]) -> list[dict]:
    if not records:
        return []

    df = pd.DataFrame(records)
    grouped = df.groupby(["hostel_id", "meal_type"])

    recommendations = []
    for (hostel_id, meal_type), group in grouped:
        avg_kitchen = group["kitchen_waste_kg"].mean()
        avg_plate = group["plate_waste_kg"].mean()

        if avg_kitchen > KITCHEN_WASTE_THRESHOLD_KG:
            # ponytail: linear heuristic (10% reduction per 10kg over
            # threshold), capped at MAX_PREP_REDUCTION_PCT — refine against
            # real compliance-rate feedback once the dashboard has data.
            reduction_pct = min(
                round((avg_kitchen - KITCHEN_WASTE_THRESHOLD_KG) / 10 * 10),
                MAX_PREP_REDUCTION_PCT,
            )
            recommendations.append({
                "hostel_id": hostel_id,
                "meal_type": meal_type,
                "message": (
                    f"Kitchen waste for {meal_type} is averaging "
                    f"{avg_kitchen:.1f}kg over the last 14 days — "
                    f"consider reducing prep by {reduction_pct}%."
                ),
                "suggested_adjustment_pct": -reduction_pct,
            })

        if avg_plate > PLATE_WASTE_THRESHOLD_KG:
            top_reason = group["reason"].mode().iat[0].replace("_", " ")
            recommendations.append({
                "hostel_id": hostel_id,
                "meal_type": meal_type,
                "message": (
                    f"Plate waste for {meal_type} is averaging "
                    f"{avg_plate:.1f}kg over the last 14 days, most often "
                    f"attributed to '{top_reason}' — consider a menu/"
                    f"portioning review."
                ),
                "suggested_adjustment_pct": None,
            })

    return recommendations


def main() -> None:
    env = load_env(Path(__file__).resolve().parent.parent / ".env")
    supabase: Client = create_client(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    since = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    result = (
        supabase.table("waste_records")
        .select("hostel_id,meal_type,kitchen_waste_kg,plate_waste_kg,reason")
        .gte("timestamp", since)
        .execute()
    )

    recommendations = build_recommendations(result.data)

    if recommendations:
        supabase.table("recommendations").insert(recommendations).execute()

    print(f"Analyzed {len(result.data)} waste record(s) from the last 14 days.")
    if not recommendations:
        print("No recommendations generated — all averages within thresholds.")
    else:
        print(f"Generated {len(recommendations)} recommendation(s):")
        for rec in recommendations:
            print(f"  [{rec['meal_type']}] {rec['message']}")


if __name__ == "__main__":
    main()
