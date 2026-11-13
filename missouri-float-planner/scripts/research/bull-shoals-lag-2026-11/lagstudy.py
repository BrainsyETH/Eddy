"""Analysis functions for the Bull Shoals lag study. Pure: no network, no files.

Every rule here implements a line of protocol.json; the thresholds are passed
in from that file by run_study.py and are not defaults to tune.

Time convention: hourly series are indexed by the UTC hour they COVER
([h, h+1)). Stage series keep their own 15-minute stamps.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

EPOCH = pd.Timestamp("1970-01-01", tz="UTC")
HOUR = pd.Timedelta(hours=1)


def hours(index) -> np.ndarray:
    """Timestamps as float hours since the epoch (resolution-independent)."""
    return np.asarray((pd.DatetimeIndex(index) - EPOCH) / HOUR, dtype=float)


def from_hours(values) -> pd.DatetimeIndex:
    return EPOCH + pd.to_timedelta(np.asarray(values, dtype=float), unit="h")


# ── Series preparation ───────────────────────────────────────────────────────

def period_ending_to_hour_begin(series: pd.Series) -> pd.Series:
    """CWMS hourly means are stamped at the END of the hour they average."""
    out = series.copy()
    out.index = pd.DatetimeIndex(series.index) - HOUR
    return out


def regular_hourly(series: pd.Series, start=None, end=None) -> pd.Series:
    """Reindex onto a gap-free hourly grid; missing hours become NaN."""
    series = series[~series.index.duplicated()].sort_index()
    start = series.index[0] if start is None else start
    end = series.index[-1] if end is None else end
    return series.reindex(pd.date_range(start, end, freq="1h"))


def hourly_mean(samples: pd.Series, min_samples: int = 3) -> pd.Series:
    """Mean of the samples inside each [h, h+1) hour; NaN below min_samples."""
    samples = samples.dropna()
    grouped = samples.groupby(samples.index.floor("1h"))
    mean = grouped.mean()
    mean[grouped.count() < min_samples] = np.nan
    return regular_hourly(mean)


def regular_samples(series: pd.Series) -> tuple[pd.Series, int]:
    """Stage on a regular grid at its own cadence. Returns (series, minutes)."""
    series = series.dropna()
    series = series[~series.index.duplicated()].sort_index()
    step = int(round(float(np.median(np.diff(hours(series.index)))) * 60))
    step = max(step, 1)
    rounded = series.groupby(series.index.round(f"{step}min")).mean()
    grid = pd.date_range(rounded.index[0], rounded.index[-1], freq=f"{step}min")
    return rounded.reindex(grid), step


# ── Part A: onsets ───────────────────────────────────────────────────────────

def dam_onsets(release: pd.Series, direction: str, rule: dict) -> pd.DataFrame:
    """Release onsets on a regular hourly series. One row per onset hour."""
    r = release.to_numpy(dtype=float)
    n = len(r)
    rise = direction == "rise"
    base_hours = 6 if rise else 3
    first, peak = rule["first_hour_rise_cfs"], rule["peak_rise_cfs"]
    window = rule["peak_window_hours"]
    rows = []
    for i in range(max(base_hours, 24), n):
        prev = r[i - base_hours:i]
        if not np.isfinite(r[i]) or not np.all(np.isfinite(prev)):
            continue
        base = float(np.median(prev))
        spread = float(prev.max() - prev.min())
        steady = rule["steady_cfs"] if rise else max(rule["steady_cfs"], 0.15 * base)
        if spread > steady:
            continue
        ahead = r[i:i + window]
        ahead = ahead[np.isfinite(ahead)]
        if rise:
            extreme = float(ahead.max())
            if r[i] - base < first or extreme - base < peak:
                continue
        else:
            extreme = float(ahead.min())
            if base - r[i] < first or base - extreme < peak:
                continue
        day = r[i - 24:i]
        if np.isfinite(day).sum() < 20:
            continue
        rows.append({
            "hour": release.index[i],
            "onset_time": release.index[i] + pd.Timedelta(minutes=30),
            "baseline": base,
            "qpeak": extreme if rise else base,
            "qend": extreme,
            "q24": float(np.nanmean(day)),
        })
    return pd.DataFrame(rows, columns=["hour", "onset_time", "baseline", "qpeak", "qend", "q24"])


def gauge_onsets(stage: pd.Series, direction: str, threshold_ft: float,
                 lookback_hours: float, refractory_hours: float) -> pd.DatetimeIndex:
    """Times the stage first moves threshold_ft off its recent extreme."""
    grid, step = regular_samples(stage)
    per_hour = 60 / step
    v = grid.to_numpy(dtype=float) * (1.0 if direction == "rise" else -1.0)
    look = max(int(round(lookback_hours * per_hour)), 1)
    quiet = max(int(round(refractory_hours * per_hour)), 1)
    floor = pd.Series(v).rolling(look + 1, min_periods=look // 2 + 1).min().to_numpy()
    with np.errstate(invalid="ignore"):
        above = np.nan_to_num((v - floor) >= threshold_ft, nan=0.0).astype(bool)
    finite = np.isfinite(v)
    c_above = np.concatenate([[0], np.cumsum(above)])
    c_finite = np.concatenate([[0], np.cumsum(finite)])
    idx = np.arange(quiet, len(v))
    prior_above = c_above[idx] - c_above[idx - quiet]
    prior_finite = c_finite[idx] - c_finite[idx - quiet]
    keep = above[idx] & (prior_above == 0) & (prior_finite >= 0.75 * quiet)
    return grid.index[idx[keep]]


def match_onsets(dam_t: np.ndarray, gauge_t: np.ndarray, wmin: float, wmax: float):
    """Mutual-unique matching. Returns (status array, delay-hours array)."""
    dam_t = np.asarray(dam_t, dtype=float)
    gauge_t = np.asarray(gauge_t, dtype=float)
    lo = np.searchsorted(gauge_t, dam_t + wmin, "left")
    hi = np.searchsorted(gauge_t, dam_t + wmax, "right")
    claims = (np.searchsorted(dam_t, gauge_t - wmin, "right")
              - np.searchsorted(dam_t, gauge_t - wmax, "left"))
    status = np.empty(len(dam_t), dtype=object)
    delay = np.full(len(dam_t), np.nan)
    for i in range(len(dam_t)):
        count = hi[i] - lo[i]
        if count == 0:
            status[i] = "none"
        elif count > 1 or claims[lo[i]] > 1:
            status[i] = "ambiguous"
        else:
            status[i] = "matched"
            delay[i] = gauge_t[lo[i]] - dam_t[i]
    return status, delay


def _span_range(values: np.ndarray, t0: float, start: float, end: float, min_share: float):
    """max - min of an hourly array over [start, end] hours; NaN if too sparse."""
    a = int(np.floor(start - t0))
    b = int(np.ceil(end - t0)) + 1
    total = b - a
    a, b = max(a, 0), min(b, len(values))
    part = values[a:b] if b > a else np.array([])
    part = part[np.isfinite(part)]
    if total <= 0 or len(part) < min_share * total or len(part) == 0:
        return np.nan
    return float(part.max() - part.min())


def build_events(release: pd.Series, stage: pd.Series, tributaries: dict,
                 direction: str, window: tuple, cfg: dict,
                 norfork_release: pd.Series | None = None) -> pd.DataFrame:
    """Every dam onset with its match status, delay and exclusion reason.

    `tributaries` maps name -> regular hourly discharge. `norfork_release`
    turns on the Norfork-quiet rule (Calico Rock).
    """
    onsets = dam_onsets(release, direction, cfg["dam_rule"])
    if onsets.empty:
        return onsets.assign(status=[], delay_h=[], exclude=[])
    dam_t = hours(onsets["onset_time"])
    g = gauge_onsets(stage, direction, cfg["threshold_ft"], cfg["lookback_hours"],
                     cfg["refractory_hours"])
    status, delay = match_onsets(dam_t, hours(g), window[0], window[1])

    stage = stage.dropna()
    stage_t = hours(stage.index)
    trib = {k: (v.to_numpy(dtype=float), hours(v.index[:1])[0]) for k, v in tributaries.items()}
    nf = None
    if norfork_release is not None:
        nf = (norfork_release.to_numpy(dtype=float), hours(norfork_release.index[:1])[0])

    reasons = []
    trib_total = []
    for t in dam_t:
        end = t + window[1]
        reason = ""
        a = np.searchsorted(stage_t, t - 3, "left")
        b = np.searchsorted(stage_t, end, "right")
        marks = np.concatenate([[t - 3], stage_t[a:b], [end]])
        if np.diff(marks).max() > cfg["max_stage_gap_hours"] + 1e-9:
            reason = "stage_gap"
        total = 0.0
        for values, t0 in trib.values():
            total += _span_range(values, t0, t - 12, end, 0.5)
        trib_total.append(total)
        if not reason and not (total <= cfg["tributary_range_cfs"]):
            reason = "tributary"
        if not reason and nf is not None:
            span = _span_range(nf[0], nf[1], t - 0.5, t - 0.5 + 32, 0.9)
            if not (span <= cfg["norfork_range_cfs"]):
                reason = "norfork_dam"
        reasons.append(reason)

    out = onsets.copy()
    out["status"] = status
    out["delay_h"] = delay
    out["exclude"] = reasons
    out["tributary_range"] = trib_total
    out["month"] = [f"{t.year:04d}-{t.month:02d}" for t in out["onset_time"]]
    return out


def usable(events: pd.DataFrame) -> pd.DataFrame:
    return events[(events["exclude"] == "") & (events["status"] == "matched")]


def funnel(events: pd.DataFrame) -> dict:
    """Counts at each step, in the order the protocol applies them."""
    kept = events[events["exclude"] == ""]
    return {
        "dam_onsets": int(len(events)),
        "excluded_stage_gap": int((events["exclude"] == "stage_gap").sum()),
        "excluded_tributary": int((events["exclude"] == "tributary").sum()),
        "excluded_norfork_dam": int((events["exclude"] == "norfork_dam").sum()),
        "eligible": int(len(kept)),
        "no_gauge_response": int((kept["status"] == "none").sum()),
        "ambiguous": int((kept["status"] == "ambiguous").sum()),
        "matched": int((kept["status"] == "matched").sum()),
    }


# ── Part A: models ───────────────────────────────────────────────────────────

GUIDE_SPEEDS = [(1, 1.875), (2, 2.375), (4, 2.875), (6, 3.375), (np.inf, 4.25)]


def _features(events: pd.DataFrame) -> np.ndarray:
    q24 = np.log(np.maximum(events["q24"].to_numpy(dtype=float), 50.0))
    qpk = np.log(np.maximum(events["qpeak"].to_numpy(dtype=float), 50.0))
    return np.column_stack([np.ones(len(events)), q24, qpk])


def fit_flow(events: pd.DataFrame) -> np.ndarray:
    coef, *_ = np.linalg.lstsq(_features(events), np.log(events["delay_h"].to_numpy(dtype=float)),
                               rcond=None)
    return coef


def predict(model: str, events: pd.DataFrame, fitted=None, miles: float | None = None,
            cfs_per_unit: float = 3300.0) -> np.ndarray:
    if model == "flow":
        return np.exp(_features(events) @ fitted)
    if model == "constant":
        return np.full(len(events), float(fitted))
    if model == "guides":
        units = events["qpeak"].to_numpy(dtype=float) / cfs_per_unit
        speed = np.array([next(s for limit, s in GUIDE_SPEEDS if u <= limit) for u in units])
        return miles / speed
    raise ValueError(model)


def fit(model: str, events: pd.DataFrame):
    if model == "flow":
        return fit_flow(events)
    if model == "constant":
        return float(np.median(events["delay_h"]))
    return None


def score(errors, tolerance: float) -> dict:
    errors = np.asarray(errors, dtype=float)
    if len(errors) == 0:
        return {"n": 0}
    absolute = np.abs(errors)
    return {
        "n": int(len(errors)),
        "share_within_tolerance": float((absolute <= tolerance).mean()),
        "median_abs_error_h": float(np.median(absolute)),
        "mean_signed_error_h": float(errors.mean()),
        "half_width_80_h": float(np.quantile(absolute, 0.80)),
        "half_width_90_h": float(np.quantile(absolute, 0.90)),
    }


def cross_validate(model: str, events: pd.DataFrame, miles: float, min_train: int = 10) -> np.ndarray:
    """Leave-one-month-out errors (predicted - observed), aligned to `events`."""
    errors = np.full(len(events), np.nan)
    months = events["month"].to_numpy()
    for month in np.unique(months):
        held = months == month
        train = events[~held]
        if len(train) < min_train:
            continue
        pred = predict(model, events[held], fit(model, train), miles)
        errors[held] = pred - events.loc[held, "delay_h"].to_numpy(dtype=float)
    return errors


# ── Part B: distributed lag ──────────────────────────────────────────────────

def lagged(x: np.ndarray, max_lag: int) -> np.ndarray:
    """Columns k = 0..max_lag hold x shifted k steps into the past."""
    out = np.full((len(x), max_lag + 1), np.nan)
    for k in range(max_lag + 1):
        out[k:, k] = x[:len(x) - k]
    return out


def lag_table(release: pd.Series, stage_hourly: pd.Series, tributaries: dict,
              max_lag: int, tributary_range_cfs: float, regime_hours: int = 36,
              norfork_release: pd.Series | None = None, norfork_lag: int = 24) -> dict:
    """Aligned arrays for the regression. All share the release's hourly index."""
    index = release.index
    r = release.to_numpy(dtype=float)
    s = stage_hourly.reindex(index).to_numpy(dtype=float)
    y = np.concatenate([[np.nan], np.diff(s)])
    x = np.concatenate([[np.nan], np.diff(r)]) / 1000.0
    X = lagged(x, max_lag)
    Z = None
    if norfork_release is not None:
        z = np.concatenate([[np.nan], np.diff(norfork_release.reindex(index).to_numpy(dtype=float))]) / 1000.0
        Z = lagged(z, norfork_lag)
    q = pd.Series(r).shift(1).rolling(regime_hours, min_periods=int(regime_hours * 0.9)).mean().to_numpy()
    total = np.zeros(len(index))
    for series in tributaries.values():
        roll = series.reindex(index).rolling(25, min_periods=12)
        total = total + (roll.max() - roll.min()).to_numpy()
    complete = np.all(np.isfinite(X), axis=1) & np.isfinite(q)
    if Z is not None:
        complete &= np.all(np.isfinite(Z), axis=1)
    with np.errstate(invalid="ignore"):
        trib_ok = total <= tributary_range_cfs
    return {"index": index, "t": hours(index), "y": y, "x": x, "X": X, "Z": Z, "q": q,
            "complete": complete, "valid": complete & trib_ok & np.isfinite(y)}


def design(table: dict, rows: np.ndarray) -> np.ndarray:
    parts = [np.ones((int(rows.sum()), 1)), table["X"][rows]]
    if table["Z"] is not None:
        parts.append(table["Z"][rows])
    return np.hstack(parts)


def solve(xtx: np.ndarray, xty: np.ndarray) -> np.ndarray:
    return np.linalg.lstsq(xtx, xty, rcond=None)[0]


def response_summary(beta: np.ndarray) -> dict:
    top = float(np.max(beta))
    if not np.isfinite(top) or top <= 0:
        return {"peak_lag_h": None, "first_response_lag_h": None}
    return {"peak_lag_h": int(np.argmax(beta)),
            "first_response_lag_h": int(np.argmax(beta >= 0.25 * top))}


def fit_response(table: dict, rows: np.ndarray, max_lag: int, block_hours: int = 168,
                 resamples: int = 300, seed: int = 0) -> dict:
    """OLS response with a calendar-block bootstrap on its lag summaries."""
    A = design(table, rows)
    y = table["y"][rows]
    blocks = np.floor(table["t"][rows] / block_hours).astype(int)
    ids = np.unique(blocks)
    xtx = {b: A[blocks == b].T @ A[blocks == b] for b in ids}
    xty = {b: A[blocks == b].T @ y[blocks == b] for b in ids}
    coef = solve(sum(xtx.values()), sum(xty.values()))
    beta = coef[1:max_lag + 2]
    rng = np.random.default_rng(seed)
    peaks, firsts = [], []
    for _ in range(resamples):
        pick = rng.choice(ids, size=len(ids), replace=True)
        boot = solve(sum(xtx[b] for b in pick), sum(xty[b] for b in pick))
        summary = response_summary(boot[1:max_lag + 2])
        if summary["peak_lag_h"] is not None:
            peaks.append(summary["peak_lag_h"])
            firsts.append(summary["first_response_lag_h"])
    out = {"n_hours": int(rows.sum()), "coef": coef, "beta": beta, **response_summary(beta)}
    if peaks:
        out["peak_lag_ci95"] = [float(np.quantile(peaks, 0.025)), float(np.quantile(peaks, 0.975))]
        out["first_response_ci95"] = [float(np.quantile(firsts, 0.025)), float(np.quantile(firsts, 0.975))]
    return out


def components(table: dict, coef_by_regime: dict, regime: np.ndarray, max_lag: int) -> dict:
    """Per-hour prediction parts for rows with complete lags."""
    n = len(table["y"])
    alpha = np.full(n, np.nan)
    bs = np.full(n, np.nan)
    nf = np.zeros(n)
    for key, coef in coef_by_regime.items():
        rows = table["complete"] & (regime == key)
        alpha[rows] = coef[0]
        bs[rows] = table["X"][rows] @ coef[1:max_lag + 2]
        if table["Z"] is not None:
            nf[rows] = table["Z"][rows] @ coef[max_lag + 2:]
    return {"alpha": alpha, "bs": bs, "nf": nf}


def shifted_prediction(parts: dict, shift: int) -> np.ndarray:
    """Bull Shoals part moved `shift` hours later; the rest left in place."""
    bs = parts["bs"]
    moved = np.full(len(bs), np.nan)
    if shift > 0:
        moved[shift:] = bs[:-shift]
    elif shift < 0:
        moved[:shift] = bs[-shift:]
    else:
        moved = bs.copy()
    return parts["alpha"] + moved + parts["nf"]


def correlation(a: np.ndarray, b: np.ndarray) -> float:
    ok = np.isfinite(a) & np.isfinite(b)
    if ok.sum() < 3 or np.std(a[ok]) == 0 or np.std(b[ok]) == 0:
        return float("nan")
    return float(np.corrcoef(a[ok], b[ok])[0, 1])


def block_bootstrap_correlation(pred: np.ndarray, obs: np.ndarray, t: np.ndarray,
                                block_hours: int = 48, resamples: int = 1000, seed: int = 0) -> list:
    ok = np.isfinite(pred) & np.isfinite(obs)
    pred, obs, blocks = pred[ok], obs[ok], np.floor(t[ok] / block_hours).astype(int)
    ids = np.unique(blocks)
    members = {b: np.flatnonzero(blocks == b) for b in ids}
    rng = np.random.default_rng(seed)
    values = []
    for _ in range(resamples):
        rows = np.concatenate([members[b] for b in rng.choice(ids, size=len(ids), replace=True)])
        value = correlation(pred[rows], obs[rows])
        if np.isfinite(value):
            values.append(value)
    if not values:
        return [float("nan"), float("nan")]
    return [float(np.quantile(values, 0.025)), float(np.quantile(values, 0.975))]


# ── Part B cross-check: prewhitened cross-correlation ────────────────────────

def ar_fit(x: np.ndarray, order: int, rows: np.ndarray) -> np.ndarray:
    L = lagged(x, order)
    ok = rows & np.all(np.isfinite(L), axis=1)
    return np.linalg.lstsq(L[ok, 1:], L[ok, 0], rcond=None)[0]


def ar_filter(v: np.ndarray, phi: np.ndarray) -> np.ndarray:
    L = lagged(v, len(phi))
    return L[:, 0] - L[:, 1:] @ phi


def cross_correlation(ex: np.ndarray, ey: np.ndarray, lags, rows: np.ndarray) -> dict:
    """corr(ex[t - k], ey[t]) over the chosen rows t. Positive k = release leads."""
    n = len(ex)
    out = {}
    for k in lags:
        moved = np.full(n, np.nan)
        if k > 0:
            moved[k:] = ex[:-k]
        elif k < 0:
            moved[:k] = ex[-k:]
        else:
            moved = ex
        out[int(k)] = correlation(np.where(rows, moved, np.nan), ey)
    return out
