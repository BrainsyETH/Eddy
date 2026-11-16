"""Replay: what Eddy could have estimated using only readings available then.

Walks the record release by release. For each detected increase it decides,
three hours in, whether to issue an estimate or withhold one, using nothing
later than that moment. It then keeps watching until the water arrives and
withdraws the estimate if conditions change. Outcomes are attached afterwards
and never feed a decision. Pure functions; thresholds come from RULE.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

import conditions as c
import lagstudy as ls

RULE = {
    "steady_cfs": 600,            # six hours before the increase vary by no more than this
    "first_hour_rise_cfs": 1000,  # what counts as a detected increase
    "decide_after_hours": 3,      # hours of release data in hand when the decision is made
    "min_peak_rise_cfs": 2000,    # smaller increases get no estimate
    "max_baseline_cfs": 1500,     # release must start from a low baseline
    "max_prior_step_cfs": 500,    # no smaller increase in the previous 20 hours
    "max_stage_ft": 7.0,          # gauge near Norfork just before the increase
    "max_tributary_range_cfs": 500,  # Buffalo + Crooked Creek, 12 hours up to the decision
    "window_hours": (5, 24),
}
WITHHOLD_ORDER = ["release data missing", "increase under 2,000 cfs", "release already raised",
                  "smaller increase went first", "gauge reading missing", "river high",
                  "tributary reading missing", "tributaries moving"]


def load_many(folders) -> dict:
    parts = [c.load(Path(f)) for f in folders]
    release = pd.concat([p["release"] for p in parts]).sort_index()
    release = release[~release.index.duplicated()].asfreq("1h")
    flows = pd.concat([p["flows"] for p in parts]).sort_index()
    flows = flows[~flows.index.duplicated()].reindex(release.index)
    stage = pd.concat([p["stage"] for p in parts]).sort_index()
    rain = pd.concat([p["rain"] for p in parts]).sort_index()
    return {"release": release, "flows": flows, "stage": stage[~stage.index.duplicated()],
            "rain": rain[~rain.index.duplicated()]}


def replay(data: dict, rule: dict = RULE) -> pd.DataFrame:
    """One row per detected release increase: decision, reason and later outcome."""
    release, flows, stage_series = data["release"], data["flows"], data["stage"]
    r = release.to_numpy(dtype=float)
    t_hour = ls.hours(release.index)
    buffalo = flows["buffalo_cfs"].to_numpy(dtype=float)
    crooked = flows["crooked_cfs"].to_numpy(dtype=float)
    stage = stage_series.dropna()
    stage_t, stage_v = ls.hours(stage.index), stage.to_numpy(dtype=float)
    wait = rule["decide_after_hours"]
    wmin, wmax = rule["window_hours"]

    starts = []
    for i in range(24, len(r) - 1):
        prev = r[i - 6:i]
        if not np.isfinite(r[i]) or not np.all(np.isfinite(prev)):
            continue
        if prev.max() - prev.min() > rule["steady_cfs"]:
            continue
        if r[i] - np.median(prev) >= rule["first_hour_rise_cfs"]:
            starts.append(i)

    rows = []
    for i in starts:
        base = float(np.median(r[i - 6:i]))
        onset = t_hour[i] + 0.5
        decide = i + wait                      # first hour index whose data is NOT yet in hand
        first = r[i:decide]
        reasons = []
        if decide >= len(r) or not np.all(np.isfinite(first)):
            reasons.append("release data missing")
            peak = np.nan
        else:
            peak = float(first.max())
            if peak - base < rule["min_peak_rise_cfs"]:
                reasons.append("increase under 2,000 cfs")
        if base >= rule["max_baseline_cfs"]:
            reasons.append("release already raised")
        before = r[max(i - 20, 0):i]
        prior_step = base - float(np.nanmin(before)) if np.isfinite(before).any() else np.nan
        if prior_step >= rule["max_prior_step_cfs"]:
            reasons.append("smaller increase went first")
        a, b = np.searchsorted(stage_t, onset - 1.5), np.searchsorted(stage_t, onset - 0.5)
        stage0 = float(np.median(stage_v[a:b])) if b > a else np.nan
        if not np.isfinite(stage0):
            reasons.append("gauge reading missing")
        elif stage0 >= rule["max_stage_ft"]:
            reasons.append("river high")
        lo = max(decide - 12, 0)
        trib_range, trib_ok = 0.0, True
        for values in (buffalo, crooked):
            part = values[lo:decide]
            part = part[np.isfinite(part)]
            if len(part) < 6:
                trib_ok = False
            else:
                trib_range += float(part.max() - part.min())
        if not trib_ok:
            reasons.append("tributary reading missing")
        elif trib_range > rule["max_tributary_range_cfs"]:
            reasons.append("tributaries moving")
        day = (buffalo + crooked)[max(i - 24, 0):i]
        tributary = float(np.nanmean(day)) if np.isfinite(day).any() else np.nan
        reasons.sort(key=WITHHOLD_ORDER.index)

        # Watching after the decision: first hour whose reading changes the picture.
        withdrawn_at, withdrawn_why = np.nan, ""
        if not reasons:
            for u in range(decide, min(i + wmax + 1, len(r))):
                moved = 0.0
                for values in (buffalo, crooked):
                    part = values[lo:u + 1]
                    part = part[np.isfinite(part)]
                    if len(part):
                        moved += float(part.max() - part.min())
                if moved > rule["max_tributary_range_cfs"]:
                    withdrawn_at, withdrawn_why = t_hour[u] + 1 - onset, "tributaries started moving"
                    break

        a = np.searchsorted(stage_t, onset - 3, "left")
        b = np.searchsorted(stage_t, onset + wmax, "right")
        marks = np.concatenate([[onset - 3], stage_t[a:b], [onset + wmax]])
        rows.append({
            "hour": release.index[i], "onset_time": release.index[i] + pd.Timedelta(minutes=30),
            "baseline": base, "qpeak": peak, "q24": float(np.nanmean(r[i - 24:i])),
            "pre_step_cfs": prior_step, "stage0": stage0, "tributary_range_cfs": trib_range if trib_ok else np.nan,
            "tributary_cfs": tributary, "gauge_cfs0": flows["gauge_cfs"].iloc[i - 1],
            "decision": "withheld" if reasons else "issued", "reason": reasons[0] if reasons else "",
            "all_reasons": "; ".join(reasons),
            "withdrawn_after_h": withdrawn_at, "withdrawn_why": withdrawn_why,
            "gauge_gap": bool(np.diff(marks).max() > 0.5 + 1e-9),
        })
    table = pd.DataFrame(rows)

    # Outcomes, attached after every decision is fixed.
    rises = ls.hours(ls.gauge_onsets(stage_series, "rise", 0.10, 3, 2))
    onset_h = ls.hours(table["onset_time"])
    status, delay = ls.match_onsets(onset_h, rises, wmin, wmax)
    table["match"] = status
    table["delay_h"] = delay
    lo_i = np.searchsorted(rises, onset_h + wmin, "left")
    hi_i = np.searchsorted(rises, onset_h + wmax, "right")
    table["first_rise_any_h"] = [rises[a] - t if b > a else np.nan for a, b, t in zip(lo_i, hi_i, onset_h)]
    table["month"] = [f"{t.year:04d}-{t.month:02d}" for t in table["onset_time"]]
    table["year"] = [str(t.year) for t in table["onset_time"]]
    rain = data["rain"]
    days = [(h.tz_convert("America/Chicago")).normalize().tz_localize(None) for h in table["hour"]]
    table["rain_4d_in"] = [float(w.sum()) if w.notna().sum() >= 3 else np.nan for w in
                           (rain.reindex(pd.date_range(d - pd.Timedelta(days=2), d + pd.Timedelta(days=1))) for d in days)]
    return table


def outcome(table: pd.DataFrame, arrival: str = "delay_h") -> pd.Series:
    """Where each detected increase ends up. `arrival` picks the outcome column."""
    out = pd.Series("withheld", index=table.index)
    issued = table["decision"] == "issued"
    known = table[arrival].notna() & ~table["gauge_gap"]
    in_time = table["withdrawn_after_h"].notna() & (~known | (table["withdrawn_after_h"] < table[arrival]))
    out[issued & in_time] = "issued, then withdrawn before the rise"
    out[issued & ~in_time & known] = "issued and evaluated"
    out[issued & ~in_time & ~known] = "issued, outcome not determined"
    return out


def score(errors, low: float | None = None, high: float | None = None) -> dict:
    """errors = predicted minus observed hours. low/high are the range offsets."""
    errors = np.asarray(errors, dtype=float)
    errors = errors[np.isfinite(errors)]
    if len(errors) == 0:
        return {"n": 0}
    out = c.score(errors)
    if low is not None:
        out["share_inside_range"] = float(((errors <= low) & (errors >= -high)).mean())
        out["share_before_early_edge"] = float((errors > low).mean())
        out["share_after_late_edge"] = float((errors < -high).mean())
    return out
