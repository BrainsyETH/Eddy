"""Replay study: freeze the rule on 2022-2026, then score 2019-2021 once.

  python run_replay.py freeze
  python run_replay.py score     # needs data_conditions/replay_test
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import conditions as c
import replay as rp
from run_study import clean

HERE = Path(__file__).parent
OUT = HERE / "results_replay"
DEV = [HERE / "data_conditions" / "test", HERE / "data_conditions" / "development"]
CANDIDATES = {"release size": ["ln_qpeak"], "release size and gauge height": ["ln_qpeak", "stage0"],
              "release size, gauge height and tributary flow": ["ln_qpeak", "stage0", "ln_tributary"],
              "release size and prior-day release": ["ln_q24", "ln_qpeak"]}
LAGS = [0, 2, 5]


def availability(table: pd.DataFrame, arrival: str = "delay_h") -> dict:
    status = rp.outcome(table, arrival)
    counts = status.value_counts().to_dict()
    reasons = table.loc[table["decision"] == "withheld", "reason"].value_counts().to_dict()
    undetermined = table[status == "issued, outcome not determined"]
    return {"detected_increases": int(len(table)), **{k: int(v) for k, v in counts.items()},
            "withheld_by_reason": {k: int(v) for k, v in reasons.items()},
            "not_determined_because": {"gauge gap": int(undetermined["gauge_gap"].sum()),
                                       "ambiguous match": int(((undetermined["match"] == "ambiguous") & ~undetermined["gauge_gap"]).sum()),
                                       "no rise found": int(((undetermined["match"] == "none") & ~undetermined["gauge_gap"]).sum())},
            "withdrawn_because": table.loc[status == "issued, then withdrawn before the rise", "withdrawn_why"].value_counts().to_dict()}


def lead_times(evaluated: pd.DataFrame, wait: int) -> dict:
    """Hours between the estimate going out and the rise, for several data delays."""
    out = {}
    for lag in LAGS:
        lead = evaluated["delay_h"] - (wait - 0.5) - lag
        out[f"data {lag} h late"] = {"median_lead_h": float(lead.median()), "p10_lead_h": float(lead.quantile(0.1)),
                                    "share_with_3h_or_more": float((lead >= 3).mean())}
    return out


def freeze():
    table = rp.replay(rp.load_many(DEV))
    status = rp.outcome(table)
    fit_on = table[status == "issued and evaluated"]
    comparison = {name: rp.score(c.cross_validate(fit_on, terms)) for name, terms in CANDIDATES.items()}
    chosen = "release size and gauge height"
    terms = CANDIDATES[chosen]
    cv = c.cross_validate(fit_on, terms)
    cv = cv[np.isfinite(cv)]
    frozen = {"model": chosen, "terms": terms, "coefficients": [float(v) for v in c.fit(fit_on, terms)],
              "range_early_offset_h": float(np.ceil(np.quantile(cv, 0.975) * 4) / 4),
              "range_late_offset_h": float(np.ceil(-np.quantile(cv, 0.025) * 4) / 4),
              "fitted_on_events": int(len(fit_on)), "rule": rp.RULE}
    low, high = frozen["range_early_offset_h"], frozen["range_late_offset_h"]
    out = {"frozen": frozen,
           "development": {"period": ["2022-01-01", "2026-11-12"], "availability": availability(table),
                           "model_comparison_leave_one_month_out": comparison,
                           "chosen_model_cv": rp.score(cv, low, high),
                           "lead_time": lead_times(fit_on, rp.RULE["decide_after_hours"])}}
    OUT.mkdir(exist_ok=True)
    (OUT / "frozen_rule.json").write_text(json.dumps(clean(out), indent=1) + "\n")
    table.assign(outcome=status).to_csv(OUT / "replay_development.csv", index=False, float_format="%.3f")
    print(json.dumps(clean(out), indent=1))


def score():
    frozen = json.loads((OUT / "frozen_rule.json").read_text())["frozen"]
    protocol = json.loads((HERE / "protocol_replay.json").read_text())
    data = rp.load_many([HERE / "data_conditions" / "replay_test"])
    reference = c.load(HERE / "data_conditions" / "development")

    def stage_at_flow(d):
        return float(d["stage"].resample("1h").mean().reindex(d["flows"].index)[d["flows"]["gauge_cfs"].between(2000, 3000)].median())

    table = rp.replay(data)
    coef, terms = np.array(frozen["coefficients"]), frozen["terms"]
    low, high = frozen["range_early_offset_h"], frozen["range_late_offset_h"]
    issued = table["decision"] == "issued"
    table["predicted_h"] = np.nan
    table.loc[issued, "predicted_h"] = c.predict(table[issued], terms, coef)
    results = {"period": ["2019-01-01", "2022-01-01"],
               "datum_check": {"reference_ft": stage_at_flow(reference), "test_ft": stage_at_flow(data)},
               "release_hours_present": float(data["release"].notna().mean())}
    for label, arrival in (("primary", "delay_h"), ("pessimistic_first_rise_of_any_cause", "first_rise_any_h")):
        status = rp.outcome(table, arrival)
        evaluated = table[status == "issued and evaluated"]
        errors = evaluated["predicted_h"] - evaluated[arrival]
        block = {"availability": availability(table, arrival), "scores": rp.score(errors, low, high)}
        if label == "primary":
            table["outcome"] = status
            table["error_h"] = np.where(status == "issued and evaluated", table["predicted_h"] - table["delay_h"], np.nan)
            marks = protocol["pass_marks"]
            s = block["scores"]
            if s["n"] < marks["minimum_events"]:
                verdict = "INCONCLUSIVE"
            else:
                ok = (s["share_within_2h"] >= 0.80 and s["share_more_than_2h_early"] <= 0.05
                      and s["share_inside_range"] >= 0.90 and s["share_before_early_edge"] <= 0.05)
                verdict = "HOLDS" if ok else "DOES_NOT_HOLD"
            block["verdict"] = verdict
            block["by_year"] = {y: rp.score(errors[evaluated["year"] == y], low, high) for y in sorted(evaluated["year"].unique())}
            rainy = evaluated["rain_4d_in"] >= 0.5
            block["by_rain_hindsight"] = {"0.5 inch or more": rp.score(errors[rainy], low, high),
                                          "under 0.5 inch": rp.score(errors[~rainy], low, high)}
            block["lead_time"] = lead_times(evaluated, frozen["rule"]["decide_after_hours"])
            withdrawn = table[status == "issued, then withdrawn before the rise"]
            w_err = (withdrawn["predicted_h"] - withdrawn["delay_h"]).dropna()
            block["withdrawn_what_happened"] = {"n": int(len(withdrawn)), "with_known_outcome": int(len(w_err)),
                                                "would_have_been_more_than_2h_early": int((w_err > 2).sum()),
                                                "would_have_been_within_2h": int((w_err.abs() <= 2).sum())}
            unwatched = table[issued & table["delay_h"].notna() & ~table["gauge_gap"]]
            block["without_the_watch"] = rp.score(unwatched["predicted_h"] - unwatched["delay_h"], low, high)
        results[label] = block
    (OUT / "results.json").write_text(json.dumps(clean(results), indent=1) + "\n")
    table.to_csv(OUT / "replay_test.csv", index=False, float_format="%.3f")
    print(json.dumps(clean(results), indent=1))


if __name__ == "__main__":
    {"freeze": freeze, "score": score}[sys.argv[1]]()
