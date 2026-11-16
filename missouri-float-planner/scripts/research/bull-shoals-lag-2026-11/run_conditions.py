"""Study 3: freeze models on development data, then score the untouched years.

  python run_conditions.py freeze   # development only; writes frozen_models.json
  python run_conditions.py score    # needs data_conditions/test; scored once
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import conditions as c
from run_study import clean

HERE = Path(__file__).parent
OUT = HERE / "results_conditions"
MODELS = {
    "conditions": ["ln_qpeak", "stage0", "ln_tributary"],
    "study 2": ["ln_q24", "ln_qpeak"],
    "height only added": ["ln_qpeak", "stage0"],
    "gauge flow instead of stage": ["ln_qpeak", "ln_gauge_cfs0"],
}
EXPLORED = {**MODELS, "q24 + qpeak + stage": ["ln_q24", "ln_qpeak", "stage0"],
            "q24 + qpeak + gauge flow": ["ln_q24", "ln_qpeak", "ln_gauge_cfs0"],
            "stage only": ["stage0"], "qpeak only": ["ln_qpeak"]}
BANDS = [0, 5, 6, 7, 8.5, 99]
BAND_NAMES = ["under 5 ft", "5 to 6 ft", "6 to 7 ft", "7 to 8.5 ft", "over 8.5 ft"]
FEATURES = ["stage0", "gauge_cfs0", "tributary_cfs"]


def scored(events: pd.DataFrame) -> pd.DataFrame:
    out = events[events["scored"] & events[FEATURES].notna().all(axis=1)].copy()
    out["band"] = pd.cut(out["stage0"], BANDS, labels=BAND_NAMES).astype(str)
    out["rain"] = np.where(out["rain_4d_in"] >= 0.5, "0.5 inch or more", "under 0.5 inch")
    out["year"] = [str(t.year) for t in out["onset_time"]]
    return out


def describe(events: pd.DataFrame) -> dict:
    if len(events) == 0:
        return {"n": 0}
    q = events["delay_h"].quantile([0.1, 0.5, 0.9])
    return {"n": int(len(events)), "median_delay_h": q[0.5], "p10_delay_h": q[0.1], "p90_delay_h": q[0.9],
            "median_qpeak_cfs": events["qpeak"].median(), "median_stage_ft": events["stage0"].median(),
            "median_tributary_cfs": events["tributary_cfs"].median()}


def observed_tables(events: pd.DataFrame) -> dict:
    tables = {}
    for label, column, order in (("by_river_height", "band", BAND_NAMES), ("by_weather", "weather", None),
                                 ("by_rain", "rain", None), ("by_stepped", "stepped", None), ("by_year", "year", None)):
        keys = order or sorted(events[column].unique(), key=str)
        tables[label] = {str(k): describe(events[events[column] == k]) for k in keys}
    return tables


def stepped_analysis(events: pd.DataFrame, release: pd.Series, coef, offset: float) -> dict:
    """Bump-first events: how far apart the two rises are at the dam and at the gauge."""
    rows = []
    hour = pd.Timedelta(hours=1)
    for _, e in events[events["stepped"]].iterrows():
        prior = release.loc[e["hour"] - 20 * hour:e["hour"] - hour]
        after = prior.loc[prior.idxmin():]
        up = after[after >= prior.min() + 500]
        gap = (e["hour"] - up.index[0]) / hour if len(up) else np.nan
        predicted = float(c.predict(pd.DataFrame([e]), MODELS["conditions"], coef)[0])
        rows.append({"gap_at_dam_h": gap, "first_rise_h": e["delay_h"], "surge_h": e["surge_delay_h"],
                     "gap_at_gauge_h": e["surge_delay_h"] - e["delay_h"],
                     "first_rise_minus_prediction_h": e["delay_h"] - predicted,
                     "surge_minus_expected_h": e["surge_delay_h"] - (predicted + offset),
                     "crowded": bool(e["crowded"])})
    frame = pd.DataFrame(rows)
    if frame.empty:
        return {"n": 0}
    quiet = frame[~frame["crowded"]]
    summary = lambda s: {"median": s.median(), "p10": s.quantile(0.1), "p90": s.quantile(0.9)}
    return {"n": int(len(frame)), "n_not_crowded": int(len(quiet)),
            **{column: summary(quiet[column].dropna()) for column in
               ("gap_at_dam_h", "gap_at_gauge_h", "first_rise_minus_prediction_h", "surge_minus_expected_h")}}


def freeze():
    data = c.load(HERE / "data_conditions" / "development")
    events = c.event_table(data)
    good = scored(events)
    fit_on = good[~good["stepped"]]
    frozen = {name: {"terms": terms, "coefficients": [float(v) for v in c.fit(fit_on, terms)]}
              for name, terms in MODELS.items()}
    offset_rows = fit_on[~fit_on["crowded"]]
    offset = float((offset_rows["surge_delay_h"] - offset_rows["delay_h"]).median())
    comparison = {}
    for subset_name, subset in (("all scored", good), ("not stepped", fit_on),
                                ("not stepped, tributaries steady", fit_on[fit_on["weather"] == "tributaries steady"])):
        comparison[subset_name] = {name: c.score(c.cross_validate(subset, terms)) for name, terms in EXPLORED.items()}
    reference = {"gauge_cfs_band": [2000, 3000],
                 "median_stage_ft": float(data["stage"].resample("1h").mean().reindex(data["flows"].index)[
                     data["flows"]["gauge_cfs"].between(2000, 3000)].median())}
    out = {"fitted_on_events": int(len(fit_on)), "first_rise_to_surge_offset_h": offset, "models": frozen,
           "stage_reference": reference,
           "development": {"release_increases": int(len(events)), "scored": int(len(good)),
                           "model_comparison_leave_one_month_out": comparison,
                           "observed": observed_tables(good),
                           "stepped": stepped_analysis(good, data["release"], np.array(frozen["conditions"]["coefficients"]), offset)}}
    OUT.mkdir(exist_ok=True)
    (OUT / "frozen_models.json").write_text(json.dumps(clean(out), indent=1) + "\n")
    events.to_csv(OUT / "events_development.csv", index=False, float_format="%.3f")
    print(json.dumps(clean({k: out[k] for k in ("fitted_on_events", "first_rise_to_surge_offset_h", "models", "stage_reference")}), indent=1))


def score():
    frozen = json.loads((OUT / "frozen_models.json").read_text())
    protocol = json.loads((HERE / "protocol_conditions.json").read_text())
    data = c.load(HERE / "data_conditions" / "test")
    stage_now = float(data["stage"].resample("1h").mean().reindex(data["flows"].index)[
        data["flows"]["gauge_cfs"].between(2000, 3000)].median())
    shift = stage_now - frozen["stage_reference"]["median_stage_ft"]
    events = c.event_table(data)
    good = scored(events)
    primary = good[~good["stepped"]].copy()
    errors = {}
    for name, model in frozen["models"].items():
        errors[name] = c.predict(primary, model["terms"], np.array(model["coefficients"])) - primary["delay_h"].to_numpy()
        primary[f"error_{name}"] = errors[name]
    marks = protocol["pass_marks"]
    main = c.score(errors["conditions"])
    if main["n"] < marks["minimum_events"]:
        verdict = "INCONCLUSIVE"
    else:
        verdict = "HOLDS" if main["share_within_2h"] >= 0.80 and main["share_more_than_2h_early"] <= 0.05 else "DOES_NOT_HOLD"

    def split(column, keys=None):
        keys = keys or sorted(primary[column].unique(), key=str)
        return {str(k): {name: c.score(errors[name][(primary[column] == k).to_numpy()]) for name in errors} for k in keys}

    study2_rules = good[good["weather"] == "tributaries steady"]
    s2 = frozen["models"]["study 2"]
    s2_error = c.predict(study2_rules, s2["terms"], np.array(s2["coefficients"])) - study2_rules["delay_h"].to_numpy()
    coef = np.array(frozen["models"]["conditions"]["coefficients"])
    out = {"period": [protocol["status_of_each_period"]["untouched_test"]["start"],
                      protocol["status_of_each_period"]["untouched_test"]["end_exclusive"]],
           "datum_check": {"development_median_stage_ft": frozen["stage_reference"]["median_stage_ft"],
                           "test_median_stage_ft": stage_now, "difference_ft": shift,
                           "stage_comparable": bool(abs(shift) <= 0.3)},
           "funnel": {"release_increases": int(len(events)),
                      "gauge_gap": int((events["exclude"] == "stage_gap").sum()),
                      "no_match": int(((events["status"] == "none") & (events["exclude"] != "stage_gap")).sum()),
                      "ambiguous": int(((events["status"] == "ambiguous") & (events["exclude"] != "stage_gap")).sum()),
                      "scored": int(len(good)), "stepped": int(good["stepped"].sum()), "not_stepped": int(len(primary))},
           "verdict": verdict, "all_models_not_stepped": {name: c.score(e) for name, e in errors.items()},
           "by_river_height": split("band", BAND_NAMES), "by_weather": split("weather"), "by_rain": split("rain"),
           "by_year": split("year"),
           "study_2_model_on_study_2_rules": c.score(s2_error),
           "observed": observed_tables(good),
           "stepped": stepped_analysis(good, data["release"], coef, frozen["first_rise_to_surge_offset_h"])}
    (OUT / "results.json").write_text(json.dumps(clean(out), indent=1) + "\n")
    events.to_csv(OUT / "events_test.csv", index=False, float_format="%.3f")
    primary.to_csv(OUT / "scored_test.csv", index=False, float_format="%.3f")
    print(verdict, json.dumps(clean(out["all_models_not_stepped"]), indent=1))


if __name__ == "__main__":
    {"freeze": freeze, "score": score}[sys.argv[1]]()
