"""Regression-based recommendation engine — an alternative to the
rule-based thresholds in analysis.py, kept side-by-side as a comparison
point for the project report against Kodors et al. 2024 (reported
RMSE +/-3%, MAPE 10.15%). Does not replace or modify the rule-based path.

Trains a simple per (hostel_id, meal_type) LinearRegression on:
  - day_of_week (0=Monday..6=Sunday)
  - rolling_avg_kitchen_waste (mean of the previous 5 records)
  - record_count_so_far (position in the sequence, captures trend)
to predict kitchen_waste_kg, then derives a suggested prep-reduction %
using the same threshold/cap logic as the rule-based engine so the two
approaches are directly comparable in the recommendations table.

Needs at least MIN_RECORDS_FOR_REGRESSION records for a hostel+meal_type
combination — analysis.py falls back to rule-based thresholds otherwise.

Run standalone to see RMSE/MAPE per group: .venv/bin/python python/regression_model.py
"""

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error

MIN_RECORDS_FOR_REGRESSION = 10
ROLLING_WINDOW = 5
KITCHEN_WASTE_THRESHOLD_KG = 10
MIN_PREP_REDUCTION_PCT = 5
MAX_PREP_REDUCTION_PCT = 20

FEATURE_COLUMNS = ["day_of_week", "rolling_avg_kitchen_waste", "record_count_so_far"]


def build_features(records: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(records).sort_values("timestamp").reset_index(drop=True)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["day_of_week"] = df["timestamp"].dt.dayofweek
    # shift(1) so a record's own waste never leaks into its own feature;
    # min_periods=1 lets early records use however many prior ones exist.
    df["rolling_avg_kitchen_waste"] = (
        df["kitchen_waste_kg"].shift(1).rolling(ROLLING_WINDOW, min_periods=1).mean()
    )
    df["record_count_so_far"] = range(len(df))
    # the first row has no prior record for the rolling average
    return df.dropna(subset=["rolling_avg_kitchen_waste"])


def evaluate(df: pd.DataFrame) -> dict | None:
    """Chronological 80/20 train/test split. Returns None if there's too
    little data to hold out a test set."""
    split = int(len(df) * 0.8)
    if split < 1 or split >= len(df):
        return None

    X, y = df[FEATURE_COLUMNS], df["kitchen_waste_kg"]
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]

    model = LinearRegression().fit(X_train, y_train)
    y_pred = model.predict(X_test)

    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    # ponytail: MAPE is undefined for zero-actual rows, so they're
    # dropped rather than adding an epsilon fudge — fine at this data
    # volume, revisit if zero-waste records become common.
    nonzero = y_test != 0
    mape = (
        float(np.mean(np.abs((y_test[nonzero] - y_pred[nonzero]) / y_test[nonzero])) * 100)
        if nonzero.any()
        else None
    )
    return {"rmse": rmse, "mape": mape, "test_size": len(y_test)}


def predict_recommendation(hostel_id: str, meal_type: str, records: list[dict]) -> dict | None:
    """Returns a recommendation dict (same shape the rule-based engine
    inserts) if there's enough data and the prediction exceeds the
    threshold, else None. Prints RMSE/MAPE for this group either way."""
    if len(records) < MIN_RECORDS_FOR_REGRESSION:
        return None

    df = build_features(records)
    metrics = evaluate(df)
    if metrics is None:
        return None

    mape_str = f"{metrics['mape']:.1f}%" if metrics["mape"] is not None else "n/a"
    print(
        f"  [regression] {meal_type} @ {hostel_id[:8]}: "
        f"RMSE={metrics['rmse']:.2f}kg, MAPE={mape_str} (test set: {metrics['test_size']} record(s))"
    )

    # Refit on all available data for the actual forecast — the
    # train/test split above is purely for the accuracy numbers.
    model = LinearRegression().fit(df[FEATURE_COLUMNS], df["kitchen_waste_kg"])
    next_day_of_week = (int(df["day_of_week"].iat[-1]) + 1) % 7
    next_rolling_avg = df["kitchen_waste_kg"].tail(ROLLING_WINDOW).mean()
    next_features = pd.DataFrame([{
        "day_of_week": next_day_of_week,
        "rolling_avg_kitchen_waste": next_rolling_avg,
        "record_count_so_far": len(df),
    }])
    predicted_kg = float(model.predict(next_features[FEATURE_COLUMNS])[0])

    if predicted_kg <= KITCHEN_WASTE_THRESHOLD_KG:
        return None

    reduction_pct = min(
        max(round((predicted_kg - KITCHEN_WASTE_THRESHOLD_KG) / 10 * 10), MIN_PREP_REDUCTION_PCT),
        MAX_PREP_REDUCTION_PCT,
    )
    return {
        "hostel_id": hostel_id,
        "meal_type": meal_type,
        "message": (
            f"[Regression model] Predicted kitchen waste for {meal_type} is "
            f"{predicted_kg:.1f}kg for the next occurrence — consider reducing "
            f"prep by {reduction_pct}%."
        ),
        "suggested_adjustment_pct": -reduction_pct,
        "baseline_kitchen_avg_kg": predicted_kg,
        "method": "regression",
    }


def main() -> None:
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from analysis import load_env
    from supabase import create_client

    env = load_env(Path(__file__).resolve().parent.parent / ".env")
    supabase = create_client(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    records = (
        supabase.table("waste_records")
        .select("hostel_id,meal_type,kitchen_waste_kg,timestamp")
        .execute()
        .data
    )
    if not records:
        print("No waste_records found.")
        return

    df = pd.DataFrame(records)
    for (hostel_id, meal_type), group in df.groupby(["hostel_id", "meal_type"]):
        group_records = group.to_dict("records")
        if len(group_records) < MIN_RECORDS_FOR_REGRESSION:
            print(
                f"[{meal_type} @ {hostel_id[:8]}] only {len(group_records)} record(s) "
                f"— skipping regression, needs {MIN_RECORDS_FOR_REGRESSION}+"
            )
            continue

        rec = predict_recommendation(hostel_id, meal_type, group_records)
        if rec:
            print(f"    -> {rec['message']}")
        else:
            print("    -> predicted waste within threshold, no recommendation needed")


if __name__ == "__main__":
    main()
