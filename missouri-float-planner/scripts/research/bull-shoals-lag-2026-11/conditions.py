"""Event table and models for the conditions study (study 3). Pure functions.

Builds on lagstudy.py: the same release onsets and the same gauge-rise rule,
with river level, tributary flow, rainfall and stepped releases recorded for
each event instead of being reasons to drop it.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

import lagstudy as ls

H = pd.Timedelta(hours=1)
WINDOW = (5, 24)
MILES = 41.5
EVENT_CFG = {
    "dam_rule": {"steady_cfs": 600, "first_hour_rise_cfs": 1000, "peak_window_hours": 3, "peak_rise_cfs": 2000},
    "threshold_ft": 0.10, "lookback_hours": 3, "refractory_hours": 2,
    "max_stage_gap_hours": 0.5, "tributary_range_cfs": 500, "norfork_range_cfs": 600,
}


def load(folder: Path) -> dict:
    def utc(frame):
        frame.index = pd.DatetimeIndex(frame.index).tz_convert("UTC")
        return frame
    releases = utc(pd.read_csv(folder / "release_hourly.csv.gz", index_col=0, parse_dates=True)).asfreq("1h")
    flows = utc(pd.read_csv(folder / "flows_hourly.csv.gz", index_col=0, parse_dates=True)).reindex(releases.index)
    stage = utc(pd.read_csv(folder / "stage_norfork.csv.gz", index_col=0, parse_dates=True))["gage_height_ft"]
    rain = pd.read_csv(folder / "rain_daily.csv", index_col=0, parse_dates=True)["rain_in"]
    return {"release": releases["bull_shoals_cfs"], "flows": flows, "stage": stage, "rain": rain}


def surge_times(stage: pd.Series, onset_hours: np.ndarray, window=WINDOW):
    """Time and size of the steepest one-hour rise in each event's window."""
    grid, step = ls.regular_samples(stage)
    per_hour = int(round(60 / step))
    values = grid.to_numpy(dtype=float)
    rise = np.full(len(values), np.nan)
    rise[per_hour:] = values[per_hour:] - values[:-per_hour]
    t = ls.hours(grid.index)
    when, size = [], []
    for onset in onset_hours:
        a, b = np.searchsorted(t, onset + window[0]), np.searchsorted(t, onset + window[1], "right")
        part = rise[a:b]
        if len(part) == 0 or not np.isfinite(part).any():
            when.append(np.nan); size.append(np.nan)
            continue
        i = int(np.nanargmax(part))
        when.append(t[a + i] - 0.5 - onset)
        size.append(part[i])
    return np.array(when), np.array(size)


def event_table(data: dict) -> pd.DataFrame:
    """One row per release increase, with its conditions. Nothing is dropped."""
    release, flows, stage, rain = data["release"], data["flows"], data["stage"], data["rain"]
    tributaries = {"buffalo": flows["buffalo_cfs"], "crooked": flows["crooked_cfs"]}
    events = ls.build_events(release, stage, tributaries, "rise", WINDOW, EVENT_CFG)
    r = release.to_numpy(dtype=float)
    position = {t: i for i, t in enumerate(release.index)}
    stage_clean = stage.dropna()
    stage_t = ls.hours(stage_clean.index)
    stage_v = stage_clean.to_numpy(dtype=float)
    trib = (flows["buffalo_cfs"] + flows["crooked_cfs"]).to_numpy(dtype=float)
    gauge = flows["gauge_cfs"].to_numpy(dtype=float)
    onset_h = ls.hours(events["onset_time"])
    rows = []
    for hour, t in zip(events["hour"], onset_h):
        i = position[hour]
        a, b = np.searchsorted(stage_t, t - 1.5), np.searchsorted(stage_t, t - 0.5)
        local_day = (hour.tz_convert("America/Chicago")).normalize().tz_localize(None)
        wet = rain.reindex(pd.date_range(local_day - pd.Timedelta(days=2), local_day + pd.Timedelta(days=1)))
        rows.append({
            "stage0": float(np.median(stage_v[a:b])) if b > a else np.nan,
            "gauge_cfs0": gauge[i - 1],
            "tributary_cfs": float(np.nanmean(trib[max(i - 24, 0):i])) if np.isfinite(trib[max(i - 24, 0):i]).any() else np.nan,
            "rain_4d_in": float(wet.sum()) if wet.notna().sum() >= 3 else np.nan,
            "pre_step_cfs": float(np.median(r[i - 6:i]) - np.nanmin(r[max(i - 20, 0):i])),
        })
    events = pd.concat([events.reset_index(drop=True), pd.DataFrame(rows)], axis=1)
    events["surge_delay_h"], events["surge_ft_per_h"] = surge_times(stage, onset_h)
    gap = np.diff(onset_h)
    crowded = np.zeros(len(events), dtype=bool)
    crowded[1:] |= gap < 19
    crowded[:-1] |= gap < 19
    events["crowded"] = crowded
    events["weather"] = np.where(events["exclude"] == "tributary", "tributaries moving", "tributaries steady")
    events["stepped"] = events["pre_step_cfs"] >= 500
    events["scored"] = (events["status"] == "matched") & events["exclude"].isin(["", "tributary"])
    return events


# ── Models: ln(delay) on a chosen set of terms ───────────────────────────────

TERMS = {
    "ln_qpeak": lambda e: np.log(np.maximum(e["qpeak"], 50.0)),
    "ln_q24": lambda e: np.log(np.maximum(e["q24"], 50.0)),
    "stage0": lambda e: e["stage0"],
    "ln_gauge_cfs0": lambda e: np.log(np.maximum(e["gauge_cfs0"], 50.0)),
    "ln_tributary": lambda e: np.log(np.maximum(e["tributary_cfs"], 10.0)),
}


def design(events: pd.DataFrame, terms) -> np.ndarray:
    return np.column_stack([np.ones(len(events))] + [np.asarray(TERMS[t](events), dtype=float) for t in terms])


def fit(events: pd.DataFrame, terms) -> np.ndarray:
    return np.linalg.lstsq(design(events, terms), np.log(events["delay_h"].to_numpy(dtype=float)), rcond=None)[0]


def predict(events: pd.DataFrame, terms, coef) -> np.ndarray:
    return np.exp(design(events, terms) @ coef)


def cross_validate(events: pd.DataFrame, terms, min_train: int = 20) -> np.ndarray:
    """Leave-one-month-out errors, predicted minus observed hours."""
    errors = np.full(len(events), np.nan)
    months = events["month"].to_numpy()
    for month in np.unique(months):
        held = months == month
        if (~held).sum() < min_train:
            continue
        errors[held] = predict(events[held], terms, fit(events[~held], terms)) - events.loc[held, "delay_h"].to_numpy()
    return errors


def score(errors, tolerance: float = 2.0) -> dict:
    errors = np.asarray(errors, dtype=float)
    errors = errors[np.isfinite(errors)]
    if len(errors) == 0:
        return {"n": 0}
    return {"n": int(len(errors)),
            "share_within_2h": float((np.abs(errors) <= tolerance).mean()),
            "share_more_than_2h_early": float((errors > tolerance).mean()),
            "share_more_than_2h_late": float((errors < -tolerance).mean()),
            "median_abs_error_h": float(np.median(np.abs(errors))),
            "largest_early_h": float(errors.max()), "largest_late_h": float(-errors.min()),
            "early_edge_95_h": float(np.quantile(errors, 0.95))}
