"""Generates synthetic historical waste_records purely for testing the
regression path in regression_model.py — regression needs 10+ records per
hostel+meal_type to train, and the real pilot data doesn't have that yet.

Writes into its own "Synthetic Test Hostel" (created if missing), never
the real "Test Hostel" used for demoing the live app, so this fake data
can never get mixed into or mistaken for real pilot numbers. To remove it
later, delete that hostel's waste_records (and the hostel row itself) —
nothing else references it.

Run from the project root: .venv/bin/python python/generate_synthetic_data.py
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from analysis import load_env
from supabase import Client, create_client

SYNTHETIC_HOSTEL_NAME = "Synthetic Test Hostel"
DAYS = 30
MEAL_TYPES = ["breakfast", "lunch", "dinner"]
REASONS = ["over_preparation", "disliked_item", "low_turnout", "quality_issue", "other"]
# Rough baseline per meal, plus a weekend bump (more guests / leftovers)
# and gaussian noise — enough day-of-week variation for the regression
# model's day_of_week feature to have something real to learn from.
BASE_KITCHEN_KG = {"breakfast": 7, "lunch": 9, "dinner": 8}
WEEKEND_BUMP_KG = 3
NOISE_STD_KG = 1.5

np.random.seed(42)  # reproducible synthetic data across runs


def get_or_create_synthetic_hostel(supabase: Client) -> str:
    existing = supabase.table("hostels").select("id").eq("name", SYNTHETIC_HOSTEL_NAME).execute().data
    if existing:
        return existing[0]["id"]
    # is_test=True keeps this out of the real signup hostel picker — it
    # still has to be a genuine row here because waste_records.hostel_id
    # has a foreign key into this table.
    created = supabase.table("hostels").insert({"name": SYNTHETIC_HOSTEL_NAME, "is_test": True}).execute().data
    return created[0]["id"]


def generate_records(hostel_id: str) -> list[dict]:
    records = []
    start = datetime.now(timezone.utc) - timedelta(days=DAYS)
    for day in range(DAYS):
        day_dt = start + timedelta(days=day)
        is_weekend = day_dt.weekday() >= 5
        for meal_type in MEAL_TYPES:
            base = BASE_KITCHEN_KG[meal_type] + (WEEKEND_BUMP_KG if is_weekend else 0)
            kitchen_kg = max(0.5, round(base + float(np.random.normal(0, NOISE_STD_KG)), 1))
            plate_kg = max(0.2, round(kitchen_kg * 0.25 + float(np.random.normal(0, 0.4)), 1))
            records.append({
                "hostel_id": hostel_id,
                "meal_type": meal_type,
                "kitchen_waste_kg": kitchen_kg,
                "plate_waste_kg": plate_kg,
                "reason": str(np.random.choice(REASONS)),
                "timestamp": day_dt.isoformat(),
            })
    return records


def main() -> None:
    env = load_env(Path(__file__).resolve().parent.parent / ".env")
    supabase: Client = create_client(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    hostel_id = get_or_create_synthetic_hostel(supabase)
    records = generate_records(hostel_id)
    supabase.table("waste_records").insert(records).execute()

    print(
        f"Inserted {len(records)} synthetic waste_record(s) into "
        f"'{SYNTHETIC_HOSTEL_NAME}' ({hostel_id}) — {DAYS} days x {len(MEAL_TYPES)} meals/day."
    )


if __name__ == "__main__":
    main()
