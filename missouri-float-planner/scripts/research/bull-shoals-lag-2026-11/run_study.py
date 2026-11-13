"""Run the study on the data snapshot and write results/results.json.

Reads protocol.json for every threshold. Run fetch_data.py first.
Run: python run_study.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

import lagstudy as ls

HERE = Path(__file__).parent
DATA = HERE / "data"
OUT = HERE / "results"
REGIME_NAMES = ["low", "middle", "high"]


def clean(value):
    """Make numpy values JSON-safe; NaN becomes null."""
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, np.ndarray)):
        return [clean(v) for v in value]
    if isinstance(value, (np.floating, float)):
        return None if not np.isfinite(value) else round(float(value), 4)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")
    return value


def load(protocol):
    releases = pd.read_csv(DATA / "release_hourly.csv.gz", index_col=0, parse_dates=True)
    releases.index = pd.DatetimeIndex(releases.index).tz_convert("UTC")
    releases = releases.asfreq("1h")
    tributaries = pd.read_csv(DATA / "tributary_hourly.csv.gz", index_col=0, parse_dates=True)
    tributaries.index = pd.DatetimeIndex(tributaries.index).tz_convert("UTC")
    tributaries = tributaries.reindex(releases.index)
    stages = {}
    for key, gauge in protocol["sources"]["gauges"].items():
        frame = pd.read_csv(DATA / f"stage_{key}_{gauge['usgs_site']}.csv.gz", index_col=0, parse_dates=True)
        frame.index = pd.DatetimeIndex(frame.index).tz_convert("UTC")
        stages[key] = frame["gage_height_ft"]
    return releases, {c: tributaries[c] for c in tributaries.columns}, stages


def event_config(protocol):
    a = protocol["part_a_events"]
    rise = a["dam_rise_onset"]
    return {
        "dam_rule": {"steady_cfs": rise["baseline_must_be_steady_cfs"],
                     "first_hour_rise_cfs": rise["first_hour_rise_cfs"],
                     "peak_window_hours": rise["peak_window_hours"],
                     "peak_rise_cfs": rise["peak_rise_cfs"]},
        "threshold_ft": a["gauge_onset"]["threshold_ft"],
        "lookback_hours": a["gauge_onset"]["lookback_hours"],
        "refractory_hours": a["gauge_onset"]["refractory_hours"],
        "max_stage_gap_hours": 0.5,
        "tributary_range_cfs": 500,
        "norfork_range_cfs": 600,
    }


def describe(values):
    values = np.asarray(values, dtype=float)
    if len(values) == 0:
        return {"n": 0}
    q = np.quantile(values, [0.1, 0.25, 0.5, 0.75, 0.9])
    return {"n": int(len(values)), "p10": q[0], "p25": q[1], "median": q[2], "p75": q[3], "p90": q[4]}


def part_a(protocol, key, releases, tributaries, stage, test_start):
    a = protocol["part_a_events"]
    cfg = event_config(protocol)
    miles = protocol["sources"]["gauges"][key]["river_mile_below_dam"]
    tolerance = a["pass_mark"]["tolerance_hours"][key]
    norfork = releases["norfork_cfs"] if key == "calico" else None
    out = {}
    for direction in ("rise", "fall"):
        window = tuple(a["search_windows_hours"][key][direction])
        events = ls.build_events(releases["bull_shoals_cfs"], stage, tributaries, direction,
                                 window, cfg, norfork_release=norfork)
        events["period"] = np.where(events["onset_time"] < test_start, "development", "locked_test")
        OUT.mkdir(exist_ok=True)
        events.to_csv(OUT / f"events_{key}_{direction}.csv", index=False, float_format="%.3f")
        dev_all, test_all = (events[events["period"] == p] for p in ("development", "locked_test"))
        dev, test = ls.usable(dev_all), ls.usable(test_all)
        block = {"window_hours": window,
                 "funnel": {"development": ls.funnel(dev_all), "locked_test": ls.funnel(test_all)},
                 "observed_delay_h": {"development": describe(dev["delay_h"]),
                                      "locked_test": describe(test["delay_h"])},
                 "release_level_cfs": {"development_qpeak": describe(dev["qpeak"]),
                                       "locked_test_qpeak": describe(test["qpeak"]),
                                       "development_q24": describe(dev["q24"]),
                                       "locked_test_q24": describe(test["q24"])}}
        if len(dev) >= 6:
            cuts = np.quantile(dev["qpeak"], [1 / 3, 2 / 3])
            tercile = np.digitize(dev["qpeak"], cuts)
            block["delay_by_release_tercile"] = {
                "cut_points_cfs": cuts,
                **{REGIME_NAMES[k]: describe(dev["delay_h"][tercile == k]) for k in range(3)}}
        if direction == "fall" or len(dev) < 12:
            out[direction] = block
            continue

        models = {}
        cv_errors = {}
        for model in ("flow", "constant", "guides"):
            fitted = ls.fit(model, dev)
            cv = ls.cross_validate(model, dev, miles)
            cv_errors[model] = cv
            test_err = (ls.predict(model, test, fitted, miles) - test["delay_h"].to_numpy(dtype=float)
                        if len(test) else np.array([]))
            models[model] = {"cross_validation": ls.score(cv[np.isfinite(cv)], tolerance),
                             "locked_test": ls.score(test_err, tolerance)}
            if model == "flow":
                models[model]["coefficients"] = {"intercept": fitted[0], "ln_q24": fitted[1], "ln_qpeak": fitted[2]}
                grid = pd.DataFrame([(q24, qpk) for q24 in (1000, 3000, 8000) for qpk in (3300, 6600, 13200, 26400)],
                                    columns=["q24", "qpeak"])
                grid["delay_h"] = ls.predict("flow", grid, fitted)
                models[model]["example_predictions"] = grid.to_dict("records")
                models[model]["cv_error_by_release_tercile"] = {
                    REGIME_NAMES[k]: ls.score(cv[(tercile == k) & np.isfinite(cv)], tolerance) for k in range(3)}
            if model == "constant":
                models[model]["delay_h"] = fitted
        block["models"] = models
        pd.DataFrame({"onset_time": dev["onset_time"].to_numpy(), "qpeak": dev["qpeak"].to_numpy(),
                      "q24": dev["q24"].to_numpy(), "delay_h": dev["delay_h"].to_numpy(),
                      **{f"cv_error_{m}": e for m, e in cv_errors.items()}}
                     ).to_csv(OUT / f"cv_errors_{key}.csv", index=False, float_format="%.3f")

        mark = a["pass_mark"]
        flow = models["flow"]
        enough = (len(dev) >= mark["minimum_events"]["development"]
                  and len(test) >= mark["minimum_events"]["locked_test"])
        if not enough:
            verdict = "INCONCLUSIVE"
        else:
            ok = (flow["cross_validation"]["share_within_tolerance"] >= mark["share_within_tolerance"]
                  and flow["locked_test"]["share_within_tolerance"] >= mark["share_within_tolerance"])
            verdict = "PASS" if ok else "FAIL"
        block["pass_mark"] = {"tolerance_hours": tolerance, "required_share": mark["share_within_tolerance"],
                              "development_events": len(dev), "locked_test_events": len(test),
                              "verdict": verdict}
        out[direction] = block
    return out


def part_b(protocol, key, releases, tributaries, stage, test_start):
    b = protocol["part_b_distributed_lag"]
    K = b["max_lag_hours"][key]
    tolerance = b["pass_mark"]["tolerance_hours"][key]
    norfork = releases["norfork_cfs"] if key == "calico" else None
    table = ls.lag_table(releases["bull_shoals_cfs"], ls.hourly_mean(stage), tributaries, K, 500,
                         norfork_release=norfork)
    is_test = table["t"] >= ls.hours([test_start])[0]
    dev = table["valid"] & ~is_test
    test = table["valid"] & is_test
    cuts = np.quantile(table["q"][dev], [1 / 3, 2 / 3])
    regime = np.where(np.isfinite(table["q"]), np.digitize(table["q"], cuts), -1)

    out = {"max_lag_hours": K, "regime_cut_points_cfs": cuts,
           "valid_hours": {"development": int(dev.sum()), "locked_test": int(test.sum())},
           "locked_test_hours_by_regime": {REGIME_NAMES[k]: int((test & (regime == k)).sum()) for k in range(3)},
           "responses": {}}
    coefs = {}
    for k, name in list(enumerate(REGIME_NAMES)) + [(None, "pooled")]:
        rows = dev if k is None else dev & (regime == k)
        fit = ls.fit_response(table, rows, K, resamples=300, seed=11)
        coefs[name] = fit["coef"]
        entry = {x: fit[x] for x in fit if x not in ("coef", "beta")}
        entry["ft_per_1000cfs_by_lag"] = fit["beta"]
        entry["total_ft_per_1000cfs"] = float(fit["beta"].sum())
        if norfork is not None:
            gamma = fit["coef"][K + 2:]
            entry["norfork_ft_per_1000cfs_by_lag"] = gamma
            entry["norfork_peak_lag_h"] = int(np.argmax(gamma))
        out["responses"][name] = entry

    parts = {"regime": ls.components(table, {k: coefs[REGIME_NAMES[k]] for k in range(3)}, regime, K),
             "pooled": ls.components(table, {0: coefs["pooled"]}, np.zeros(len(regime), dtype=int), K)}
    y_test = np.where(test, table["y"], np.nan)
    y_dev = np.where(dev, table["y"], np.nan)
    skill = {}
    for name, part in parts.items():
        pred = ls.shifted_prediction(part, 0)
        skill[name] = {"development_r": ls.correlation(pred, y_dev),
                       "locked_test_r": ls.correlation(pred, y_test),
                       "locked_test_r_ci95": ls.block_bootstrap_correlation(pred, y_test, table["t"], seed=7)}
    out["skill"] = skill

    shifts = {s: ls.correlation(ls.shifted_prediction(parts["regime"], s), y_test) for s in range(-6, 7)}
    finite = {s: r for s, r in shifts.items() if np.isfinite(r)}
    n_test = int(test.sum())
    if n_test < b["pass_mark"]["minimum_valid_test_hours"] or not finite:
        verdict, best = "INCONCLUSIVE", None
    else:
        best = max(finite, key=finite.get)
        verdict = "PASS" if abs(best) <= tolerance else "FAIL"
    out["lag_stability"] = {"locked_test_r_by_shift_h": shifts, "best_shift_h": best,
                            "tolerance_hours": tolerance, "valid_test_hours": n_test, "verdict": verdict}

    lags = range(-12, 49)
    phi = ls.ar_fit(table["x"], 50, dev)
    ex, ey = ls.ar_filter(table["x"], phi), ls.ar_filter(table["y"], phi)
    checks = {}
    subsets = [("pooled", dev)] + [(REGIME_NAMES[k], dev & (regime == k)) for k in range(3)] + [("locked_test", test)]
    for name, rows in subsets:
        entry = {}
        for label, (a, c) in {"prewhitened": (ex, ey), "raw": (table["x"], table["y"])}.items():
            cc = ls.cross_correlation(a, np.where(rows, c, np.nan), lags, rows)
            positive = {k: v for k, v in cc.items() if k >= 0 and np.isfinite(v)}
            if not positive:
                continue
            peak = max(positive, key=positive.get)
            negative = max(abs(v) for k, v in cc.items() if k < 0 and np.isfinite(v))
            entry[label] = {"peak_lag_h": peak, "peak_r": positive[peak],
                            "largest_negative_lag_abs_r": negative,
                            "negative_to_peak_ratio": negative / positive[peak] if positive[peak] > 0 else None,
                            "r_by_lag": cc}
        checks[name] = entry
    out["cross_check"] = checks
    return out


def main():
    protocol = json.loads((HERE / "protocol.json").read_text())
    snapshot = json.loads((DATA / "snapshot.json").read_text())
    releases, tributaries, stages = load(protocol)
    test_start = pd.Timestamp(protocol["periods"]["locked_test"]["start"])
    results = {"study": protocol["study"], "protocol_locked_on": protocol["locked_on"],
               "snapshot": {k: snapshot[k] for k in ("fetched_at_utc", "start_utc", "end_exclusive_utc", "hours")},
               "periods": {"development": [snapshot["start_utc"], protocol["periods"]["locked_test"]["start"]],
                           "locked_test": [protocol["periods"]["locked_test"]["start"], snapshot["end_exclusive_utc"]]},
               "gauges": {}}
    for key, gauge in protocol["sources"]["gauges"].items():
        a = part_a(protocol, key, releases, tributaries, stages[key], test_start)
        b = part_b(protocol, key, releases, tributaries, stages[key], test_start)
        event_verdict = a["rise"].get("pass_mark", {}).get("verdict", "INCONCLUSIVE")
        stability = b["lag_stability"]["verdict"]
        if "FAIL" in (event_verdict, stability):
            verdict = "NOT_APPROVED"
        elif event_verdict == "PASS" and stability == "PASS":
            verdict = "SUPPORTED"
        else:
            verdict = "INCONCLUSIVE"
        results["gauges"][key] = {"usgs_site": gauge["usgs_site"], "name": gauge["name"],
                                  "river_mile_below_dam": gauge["river_mile_below_dam"],
                                  "verdict": verdict, "part_a_events": a, "part_b_distributed_lag": b}
    OUT.mkdir(exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(clean(results), indent=1) + "\n")
    for key, g in results["gauges"].items():
        rise = g["part_a_events"]["rise"]
        print(key, g["verdict"], "| events:", rise.get("pass_mark", rise["funnel"]),
              "| stability:", g["part_b_distributed_lag"]["lag_stability"]["verdict"])


if __name__ == "__main__":
    main()
