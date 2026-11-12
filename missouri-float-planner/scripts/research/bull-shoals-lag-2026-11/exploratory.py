"""Checks added AFTER the results were seen. Not part of the locked protocol.

Nothing here changes a verdict. It answers follow-up questions the locked run
raised: which way the misses fall, and whether the delay depends on the
0.10 ft arrival mark. Writes results/exploratory.json.
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

import lagstudy as ls
import run_study

HERE = Path(__file__).parent


def main():
    protocol = json.loads((HERE / "protocol.json").read_text())
    releases, tributaries, stages = run_study.load(protocol)
    test_start = pd.Timestamp(protocol["periods"]["locked_test"]["start"])
    cfg = run_study.event_config(protocol)
    out = {"note": "Post hoc. Not pre-registered; no verdict depends on these."}

    cv = pd.read_csv(HERE / "results" / "cv_errors_norfork.csv")
    error = cv["cv_error_flow"].dropna().to_numpy()
    out["norfork_flow_model_miss_direction_cv"] = {
        "n": int(len(error)),
        "arrived_more_than_2h_earlier_than_predicted": int((error > 2).sum()),
        "arrived_more_than_2h_later_than_predicted": int((error < -2).sum()),
        "largest_early_arrival_h": float(error.max()),
        "largest_late_arrival_h": float(-error.min()),
        "share_arriving_no_more_than_1h_early": float((error <= 1).mean()),
        "share_arriving_no_more_than_2h_early": float((error <= 2).mean()),
    }
    guide = cv["cv_error_guides"].to_numpy()
    units = cv["qpeak"].to_numpy() / 3300
    out["resort_table_error_by_generators_worth"] = {
        label: {"n": int(rows.sum()), "mean_hours_table_is_late": float(guide[rows].mean())}
        for label, rows in (("up to 2", units <= 2), ("2 to 4", (units > 2) & (units <= 4)),
                            ("4 to 6", (units > 4) & (units <= 6)), ("over 6", units > 6)) if rows.sum()}

    sensitivity = {}
    for threshold in (0.05, 0.10, 0.20):
        events = ls.build_events(releases["bull_shoals_cfs"], stages["norfork"], tributaries, "rise",
                                 (5, 24), {**cfg, "threshold_ft": threshold})
        good = ls.usable(events)
        dev = good[good["onset_time"] < test_start]
        test = good[good["onset_time"] >= test_start]
        errors = ls.cross_validate("flow", dev, 41.5)
        test_error = ls.predict("flow", test, ls.fit_flow(dev)) - test["delay_h"].to_numpy()
        sensitivity[f"{threshold:.2f} ft"] = {
            "development_events": int(len(dev)), "median_delay_h": float(dev["delay_h"].median()),
            "cv_share_within_2h": float((np.abs(errors[np.isfinite(errors)]) <= 2).mean()),
            "locked_test_events": int(len(test)),
            "locked_test_share_within_2h": float((np.abs(test_error) <= 2).mean()) if len(test) else None}
    out["norfork_arrival_mark_sensitivity"] = sensitivity

    events = pd.read_csv(HERE / "results" / "events_norfork_rise.csv")
    good = events[events["exclude"].isna() & (events["status"] == "matched") & (events["period"] == "development")]
    cuts = np.quantile(good["qpeak"], [1 / 3, 2 / 3])
    band = np.digitize(good["qpeak"], cuts)
    out["norfork_implied_speed_mph"] = {name: float(41.5 / good["delay_h"][band == k].median())
                                        for k, name in enumerate(("low", "middle", "high"))}
    (HERE / "results" / "exploratory.json").write_text(json.dumps(run_study.clean(out), indent=1) + "\n")
    print(json.dumps(run_study.clean(out), indent=1))


if __name__ == "__main__":
    main()
