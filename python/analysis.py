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

Recommendation engine (kitchen waste only — plate waste is always
rule-based, there's no regression target for it): a hostel+meal_type with
regression_model.MIN_RECORDS_FOR_REGRESSION+ records of *all-time* history
gets a regression_model.py prediction instead of the 14-day rolling
average; below that, the rule-based thresholds below still apply. Every
recommendation is tagged with which engine produced it (`method` column)
so the dashboard and report can compare the two side by side.
"""

import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
from postgrest.exceptions import APIError
from supabase import Client, create_client

import regression_model

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


def fetch_kitchen_recs(supabase: Client) -> list[dict]:
    """Past kitchen-waste recommendations (the ones with a baseline +
    suggested %, as opposed to plate-waste recs which have neither)."""
    try:
        return (
            supabase.table("recommendations")
            .select("id,hostel_id,meal_type,suggested_adjustment_pct,baseline_kitchen_avg_kg,generated_at")
            .not_.is_("suggested_adjustment_pct", "null")
            .not_.is_("baseline_kitchen_avg_kg", "null")
            .execute()
            .data
        )
    except APIError as e:
        # ponytail: as of writing, Supabase has an open platform incident
        # where PostgREST's schema cache doesn't always pick up new
        # columns (baseline_kitchen_avg_kg here) — degrade to "no
        # compliance/adjustment signal this run" rather than crash the
        # whole script.
        print(f"Kitchen recommendation history unavailable (schema not ready yet): {e.message}")
        return []


def tag_compliance(supabase: Client, kitchen_recs: list[dict]) -> list[dict]:
    """Tags untagged waste_records against the kitchen recommendation active
    when they were logged. Returns the tagging results for use in this run's
    threshold adjustment (rec_id -> whether that record complied)."""
    if not kitchen_recs:
        return []

    untagged = (
        supabase.table("waste_records")
        .select("id,hostel_id,meal_type,kitchen_waste_kg,timestamp")
        .is_("compliance_met", "null")
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


def build_recommendations(
    records: list[dict], full_history: list[dict], kitchen_recs: list[dict], tagging_results: list[dict]
) -> list[dict]:
    if not records:
        return []

    df = pd.DataFrame(records)
    grouped = df.groupby(["hostel_id", "meal_type"])
    history_df = (
        pd.DataFrame(full_history) if full_history else pd.DataFrame(columns=["hostel_id", "meal_type"])
    )

    recommendations = []
    for (hostel_id, meal_type), group in grouped:
        avg_kitchen = float(group["kitchen_waste_kg"].mean())
        avg_plate = float(group["plate_waste_kg"].mean())

        group_history = history_df[
            (history_df["hostel_id"] == hostel_id) & (history_df["meal_type"] == meal_type)
        ]

        if len(group_history) >= regression_model.MIN_RECORDS_FOR_REGRESSION:
            # Enough all-time history to trust the regression model's
            # judgment over the simpler 14-day average — including its
            # judgment that no recommendation is needed right now.
            reg_rec = regression_model.predict_recommendation(hostel_id, meal_type, group_history.to_dict("records"))
            if reg_rec is not None:
                recommendations.append(reg_rec)
        elif avg_kitchen > KITCHEN_WASTE_THRESHOLD_KG:
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
                "method": "rule_based",
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
                "method": "rule_based",
            })

    return recommendations


def insert_recommendations(supabase: Client, recommendations: list[dict]) -> None:
    """Inserts recommendations, stripping any column PostgREST's schema
    cache doesn't know about yet and retrying — see the ponytail note on
    fetch_kitchen_recs about the ongoing Supabase platform incident.
    Whatever's left after stripping is exactly what the already-working
    rule-based path always inserted, so it keeps working regardless."""
    pending = [dict(r) for r in recommendations]
    for _ in range(4):  # a handful of recently-added columns, generously
        try:
            supabase.table("recommendations").insert(pending).execute()
            return
        except APIError as e:
            match = re.search(r"'(\w+)' column", e.message)
            if not match:
                raise
            missing_col = match.group(1)
            print(f"'{missing_col}' column not available yet (schema cache) — inserting without it.")
            for r in pending:
                r.pop(missing_col, None)
    raise RuntimeError("Too many missing columns when inserting recommendations — check the schema cache.")


def main() -> None:
    env = load_env(Path(__file__).resolve().parent.parent / ".env")
    supabase: Client = create_client(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    kitchen_recs = fetch_kitchen_recs(supabase)
    tagging_results = tag_compliance(supabase, kitchen_recs)

    since = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    result = (
        supabase.table("waste_records")
        .select("hostel_id,meal_type,kitchen_waste_kg,plate_waste_kg,reason")
        .gte("timestamp", since)
        .execute()
    )
    # Regression needs more history than the 14-day rolling window the
    # rule-based thresholds use, so it gets its own unfiltered query.
    full_history = (
        supabase.table("waste_records").select("hostel_id,meal_type,kitchen_waste_kg,timestamp").execute().data
    )

    recommendations = build_recommendations(result.data, full_history, kitchen_recs, tagging_results)

    if recommendations:
        insert_recommendations(supabase, recommendations)

    print(f"Tagged compliance on {len(tagging_results)} waste record(s).")
    print(f"Analyzed {len(result.data)} waste record(s) from the last 14 days.")
    if not recommendations:
        print("No recommendations generated — all averages within thresholds.")
    else:
        print(f"Generated {len(recommendations)} recommendation(s):")
        for rec in recommendations:
            print(f"  [{rec['meal_type']}] ({rec.get('method', 'unknown')}) {rec['message']}")


if __name__ == "__main__":
    main()
