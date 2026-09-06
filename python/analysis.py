"""Analyzes the last 14 days of waste_records and writes recommendations.

Run from the project root: .venv/bin/python python/analysis.py
Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from real environment
variables first (e.g. GitHub Actions secrets), falling back to .env for
local dev. Service role key bypasses RLS, which is required and expected
here — see the migration's comment on the recommendations table policies.

Compliance feedback loop (differentiates this from Kodors et al. 2024's
static, one-shot recommendations):
1. Every kitchen-waste recommendation records the average kitchen waste
   (baseline_kitchen_avg_kg) that triggered it.
2. Each run, any waste_record logged after such a recommendation (for the
   same hostel + meal_type) gets tagged compliance_met: true if its kitchen
   waste dropped to roughly the suggested target or below.
3. When generating the *next* recommendation for that hostel + meal_type,
   if the last one was complied with but the average didn't meaningfully
   improve, the suggested reduction is loosened (it was asking for
   something that didn't matter); if it improved, tightened. Not complied
   with -> left unchanged, since we have no signal on whether the target
   itself was reasonable.
"""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
from supabase import Client, create_client

KITCHEN_WASTE_THRESHOLD_KG = 10
PLATE_WASTE_THRESHOLD_KG = 1.5
MIN_PREP_REDUCTION_PCT = 5
MAX_PREP_REDUCTION_PCT = 20
ADJUSTMENT_STEP_PCT = 3
# ponytail: 3% is a somewhat arbitrary "meaningfully different" cutoff —
# revisit once there's enough real compliance history to tune it.
MEANINGFUL_IMPROVEMENT_MARGIN = 0.03
COMPLIANCE_TOLERANCE = 1.05  # 5% grace on the target — "roughly" the suggested %


def load_env(path: Path) -> dict[str, str]:
    """Real env vars (e.g. GitHub Actions secrets) win; .env fills in the
    rest for local dev, where it won't exist in CI at all."""
    env = dict(os.environ)
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env.setdefault(key.strip(), value.strip())
    return env


def latest_kitchen_rec(hostel_id: str, meal_type: str, before: str | None, kitchen_recs: list[dict]) -> dict | None:
    """Most recent kitchen-waste recommendation for this group, optionally before a given timestamp."""
    candidates = [
        r
        for r in kitchen_recs
        if r["hostel_id"] == hostel_id
        and r["meal_type"] == meal_type
        and (before is None or r["generated_at"] < before)
    ]
    return max(candidates, key=lambda r: r["generated_at"], default=None)


def tag_compliance(supabase: Client) -> list[dict]:
    """Tags untagged waste_records against the kitchen recommendation active
    when they were logged. Returns the tagging results for use in this run's
    threshold adjustment (rec_id -> whether that record complied)."""
    untagged = (
        supabase.table("waste_records")
        .select("id,hostel_id,meal_type,kitchen_waste_kg,timestamp")
        .is_("compliance_met", "null")
        .execute()
        .data
    )
    kitchen_recs = (
        supabase.table("recommendations")
        .select("id,hostel_id,meal_type,suggested_adjustment_pct,baseline_kitchen_avg_kg,generated_at")
        .not_.is_("suggested_adjustment_pct", "null")
        .not_.is_("baseline_kitchen_avg_kg", "null")
        .execute()
        .data
    )

    results = []
    for record in untagged:
        rec = latest_kitchen_rec(record["hostel_id"], record["meal_type"], record["timestamp"], kitchen_recs)
        if rec is None:
            continue

        target_kg = rec["baseline_kitchen_avg_kg"] * (1 + rec["suggested_adjustment_pct"] / 100)
        compliant = record["kitchen_waste_kg"] <= target_kg * COMPLIANCE_TOLERANCE

        supabase.table("waste_records").update({"compliance_met": compliant}).eq("id", record["id"]).execute()
        results.append({"rec_id": rec["id"], "compliance_met": compliant})

    return results


def threshold_adjustment(
    hostel_id: str, meal_type: str, avg_kitchen: float, kitchen_recs: list[dict], tagging_results: list[dict]
) -> int:
    """+/-ADJUSTMENT_STEP_PCT based on how the last recommendation for this
    group played out, or 0 if there's nothing to go on."""
    past_rec = latest_kitchen_rec(hostel_id, meal_type, None, kitchen_recs)
    if past_rec is None:
        return 0

    outcomes = [r["compliance_met"] for r in tagging_results if r["rec_id"] == past_rec["id"]]
    if not outcomes:
        return 0
    if sum(outcomes) / len(outcomes) < 0.5:
        return 0  # not complied with — no signal on whether the target was reasonable

    improved = avg_kitchen <= past_rec["baseline_kitchen_avg_kg"] * (1 - MEANINGFUL_IMPROVEMENT_MARGIN)
    return ADJUSTMENT_STEP_PCT if improved else -ADJUSTMENT_STEP_PCT


def build_recommendations(records: list[dict], kitchen_recs: list[dict], tagging_results: list[dict]) -> list[dict]:
    if not records:
        return []

    df = pd.DataFrame(records)
    grouped = df.groupby(["hostel_id", "meal_type"])

    recommendations = []
    for (hostel_id, meal_type), group in grouped:
        avg_kitchen = float(group["kitchen_waste_kg"].mean())
        avg_plate = float(group["plate_waste_kg"].mean())

        if avg_kitchen > KITCHEN_WASTE_THRESHOLD_KG:
            # ponytail: linear heuristic (10% reduction per 10kg over
            # threshold), nudged by threshold_adjustment() and capped —
            # refine against real compliance-rate feedback as it accumulates.
            base_reduction = round((avg_kitchen - KITCHEN_WASTE_THRESHOLD_KG) / 10 * 10)
            adjustment = threshold_adjustment(hostel_id, meal_type, avg_kitchen, kitchen_recs, tagging_results)
            reduction_pct = min(max(base_reduction + adjustment, MIN_PREP_REDUCTION_PCT), MAX_PREP_REDUCTION_PCT)
            recommendations.append({
                "hostel_id": hostel_id,
                "meal_type": meal_type,
                "message": (
                    f"Kitchen waste for {meal_type} is averaging "
                    f"{avg_kitchen:.1f}kg over the last 14 days — "
                    f"consider reducing prep by {reduction_pct}%."
                ),
                "suggested_adjustment_pct": -reduction_pct,
                "baseline_kitchen_avg_kg": avg_kitchen,
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
                "baseline_kitchen_avg_kg": None,
            })

    return recommendations


def main() -> None:
    env = load_env(Path(__file__).resolve().parent.parent / ".env")
    supabase: Client = create_client(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    tagging_results = tag_compliance(supabase)

    since = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    result = (
        supabase.table("waste_records")
        .select("hostel_id,meal_type,kitchen_waste_kg,plate_waste_kg,reason")
        .gte("timestamp", since)
        .execute()
    )
    kitchen_recs = (
        supabase.table("recommendations")
        .select("id,hostel_id,meal_type,suggested_adjustment_pct,baseline_kitchen_avg_kg,generated_at")
        .not_.is_("suggested_adjustment_pct", "null")
        .not_.is_("baseline_kitchen_avg_kg", "null")
        .execute()
        .data
    )

    recommendations = build_recommendations(result.data, kitchen_recs, tagging_results)

    if recommendations:
        supabase.table("recommendations").insert(recommendations).execute()

    print(f"Tagged compliance on {len(tagging_results)} waste record(s).")
    print(f"Analyzed {len(result.data)} waste record(s) from the last 14 days.")
    if not recommendations:
        print("No recommendations generated — all averages within thresholds.")
    else:
        print(f"Generated {len(recommendations)} recommendation(s):")
        for rec in recommendations:
            print(f"  [{rec['meal_type']}] {rec['message']}")


if __name__ == "__main__":
    main()
