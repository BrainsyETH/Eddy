"""Synthetic checks for lagstudy.py. Run by hand: `python -m pytest test_lagstudy.py`.

Not part of `make check`: the repo's CI has no Python step, so these protect
only whoever runs them. Each test builds a river whose answer is known.
"""

import numpy as np
import pandas as pd

import lagstudy as ls

DAM_RULE = {"steady_cfs": 600, "first_hour_rise_cfs": 1000, "peak_window_hours": 3, "peak_rise_cfs": 2000}
CFG = {"dam_rule": DAM_RULE, "threshold_ft": 0.10, "lookback_hours": 3, "refractory_hours": 2,
       "max_stage_gap_hours": 0.5, "tributary_range_cfs": 500, "norfork_range_cfs": 600}
START = pd.Timestamp("2026-01-01", tz="UTC")


def true_lag(level):
    return 14.0 * (level / 6000.0) ** -0.3


def synthetic(days=150, seed=1):
    """One pulse a day; the river answers later, and sooner for bigger pulses."""
    rng = np.random.default_rng(seed)
    hours_index = pd.date_range(START, periods=days * 24, freq="1h")
    release = np.full(len(hours_index), 800.0)
    minutes = pd.date_range(START, periods=days * 96, freq="15min")
    tm = np.arange(len(minutes)) / 4.0
    stage = np.full(len(minutes), 3.0)
    truth = []
    for day in range(1, days - 2):
        start = day * 24 + int(rng.integers(8, 15))
        length = int(rng.integers(4, 7))
        level = float(rng.choice([3000, 6000, 12000, 20000]))
        release[start:start + length] = level
        lag = true_lag(level)
        height = 0.0002 * (level - 800)
        up = np.clip((tm - (start + lag)) / 1.0, 0, 1)
        down = np.clip((tm - (start + length + lag * 1.3)) / 4.0, 0, 1)
        stage += height * (up - down)
        truth.append((start, level, lag))
    stage += rng.normal(0, 0.004, len(stage))
    return (pd.Series(release, index=hours_index), pd.Series(stage, index=minutes), truth)


def flat(index, value=100.0):
    return pd.Series(np.full(len(index), value), index=index)


def test_period_ending_shift_moves_stamp_back_one_hour():
    s = pd.Series([5.0], index=[pd.Timestamp("2026-08-14T13:00Z")])
    assert ls.period_ending_to_hour_begin(s).index[0] == pd.Timestamp("2026-08-14T12:00Z")


def test_hourly_mean_needs_three_samples():
    idx = pd.to_datetime(["2026-01-01T00:00Z", "2026-01-01T00:15Z", "2026-01-01T01:00Z",
                          "2026-01-01T01:15Z", "2026-01-01T01:30Z"])
    out = ls.hourly_mean(pd.Series([1.0, 2.0, 3.0, 4.0, 5.0], index=idx))
    assert np.isnan(out.iloc[0]) and out.iloc[1] == 4.0


def test_dam_onsets_found_once_per_pulse():
    release, _, truth = synthetic()
    found = ls.dam_onsets(release, "rise", DAM_RULE)
    expected = [release.index[start] for start, _, _ in truth]
    assert list(found["hour"]) == expected
    falls = ls.dam_onsets(release, "fall", DAM_RULE)
    assert len(falls) == len(truth)


def test_unsteady_baseline_is_not_an_onset():
    release, _, _ = synthetic(days=10)
    release.iloc[100:106] = [800, 1500, 800, 1500, 800, 1500]
    release.iloc[106:110] = 9000
    found = ls.dam_onsets(release.iloc[90:130], "rise", DAM_RULE)
    assert release.index[106] not in list(found["hour"])


def test_match_requires_one_candidate_claimed_once():
    status, delay = ls.match_onsets(np.array([0.0, 100.0, 200.0, 203.0]),
                                    np.array([12.0, 110.0, 115.0, 214.0]), 5, 24)
    assert list(status) == ["matched", "ambiguous", "ambiguous", "ambiguous"]
    assert delay[0] == 12.0
    status, _ = ls.match_onsets(np.array([0.0]), np.array([40.0]), 5, 24)
    assert list(status) == ["none"]


def test_events_recover_a_flow_dependent_delay():
    release, stage, truth = synthetic()
    trib = {"a": flat(release.index), "b": flat(release.index)}
    events = ls.build_events(release, stage, trib, "rise", (5, 24), CFG)
    good = ls.usable(events)
    assert len(good) >= 0.9 * len(truth)
    lag = np.array([true_lag(q) for q in good["qpeak"]])
    # Onset is timed mid-hour (+0.5 h) and the mark is crossed part-way up the rise.
    assert np.abs(good["delay_h"].to_numpy() - lag).max() < 1.5
    coef = ls.fit_flow(good)
    assert -0.4 < coef[2] < -0.2
    flow = ls.score(ls.cross_validate("flow", good, 41.5), 2.0)
    constant = ls.score(ls.cross_validate("constant", good, 41.5), 2.0)
    assert flow["share_within_tolerance"] > 0.95
    assert flow["half_width_80_h"] < constant["half_width_80_h"]


def test_tributary_rise_and_stage_gap_exclude_events():
    release, stage, _ = synthetic(days=20)
    busy = flat(release.index)
    busy.iloc[24 * 5:24 * 7] = 2000.0
    gappy = stage.drop(stage.index[96 * 10 + 60:96 * 10 + 80])
    events = ls.build_events(release, gappy, {"a": busy, "b": flat(release.index)}, "rise", (5, 24), CFG)
    assert (events["exclude"] == "tributary").sum() >= 2
    assert (events["exclude"] == "stage_gap").sum() >= 1
    missing = flat(release.index) * np.nan
    events = ls.build_events(release, stage, {"a": missing, "b": flat(release.index)}, "rise", (5, 24), CFG)
    assert (events["exclude"] == "tributary").all()


def test_norfork_rule_excludes_when_norfork_moves():
    release, stage, _ = synthetic(days=20)
    trib = {"a": flat(release.index), "b": flat(release.index)}
    norfork = flat(release.index, 100.0)
    norfork.iloc[24 * 8:24 * 9] = 3000.0
    events = ls.build_events(release, stage, trib, "rise", (5, 24), CFG, norfork_release=norfork)
    assert 1 <= (events["exclude"] == "norfork_dam").sum() <= 4


def constant_lag_table(days=200, seed=2, lag=9, norfork=False):
    rng = np.random.default_rng(seed)
    index = pd.date_range(START, periods=days * 24, freq="1h")
    hour = np.arange(len(index)) % 24
    # A strict daily schedule: the case that fooled the raw cross-correlation.
    release = np.where((hour >= 14) & (hour < 20), 800 + 3000.0 * rng.integers(1, 5, len(index) // 24 + 1)[np.arange(len(index)) // 24], 800.0)
    dx = np.concatenate([[0], np.diff(release)]) / 1000.0
    dy = 0.3 * (0.6 * np.roll(dx, lag) + 0.4 * np.roll(dx, lag + 1))
    nf = None
    if norfork:
        nf_release = np.where((hour >= 13) & (hour < 18), 3000.0 * rng.integers(0, 2, len(index) // 24 + 1)[np.arange(len(index)) // 24], 100.0)
        dz = np.concatenate([[0], np.diff(nf_release)]) / 1000.0
        dy = dy + 0.5 * np.roll(dz, 4)
        nf = pd.Series(nf_release, index=index)
    stage = 3.0 + np.cumsum(dy) + rng.normal(0, 0.002, len(index))
    r = pd.Series(release, index=index)
    trib = {"a": flat(index), "b": flat(index)}
    return ls.lag_table(r, pd.Series(stage, index=index), trib, 36, 500, norfork_release=nf), nf


def test_distributed_lag_finds_the_lag_under_a_daily_schedule():
    table, _ = constant_lag_table()
    fit = ls.fit_response(table, table["valid"], 36, resamples=40)
    assert fit["peak_lag_h"] == 9 and fit["first_response_lag_h"] == 9
    assert fit["peak_lag_ci95"] == [9.0, 9.0]
    assert abs(fit["beta"][9] - 0.18) < 0.01 and abs(fit["beta"][3]) < 0.01


def test_norfork_is_separated_from_bull_shoals():
    table, _ = constant_lag_table(norfork=True)
    fit = ls.fit_response(table, table["valid"], 36, resamples=10)
    gamma = fit["coef"][38:]
    assert fit["peak_lag_h"] == 9 and int(np.argmax(gamma)) == 4
    assert abs(gamma[4] - 0.5) < 0.02


def test_lag_stability_reads_a_later_river():
    table, _ = constant_lag_table(lag=9)
    later, _ = constant_lag_table(lag=12, seed=3)
    fit = ls.fit_response(table, table["valid"], 36, resamples=5)
    regime = np.zeros(len(later["y"]), dtype=int)
    parts = ls.components(later, {0: fit["coef"]}, regime, 36)
    scores = {s: ls.correlation(np.where(later["valid"], ls.shifted_prediction(parts, s), np.nan), later["y"])
              for s in range(-6, 7)}
    assert max(scores, key=scores.get) == 3
    low, high = ls.block_bootstrap_correlation(ls.shifted_prediction(parts, 3), later["y"], later["t"], resamples=50)
    assert low > 0.5 and high <= 1.0


def test_prewhitening_removes_the_daily_echo():
    table, _ = constant_lag_table()
    rows = table["valid"]
    raw = ls.cross_correlation(table["x"], table["y"], range(-12, 37), rows)
    phi = ls.ar_fit(table["x"], 50, rows)
    clean = ls.cross_correlation(ls.ar_filter(table["x"], phi), ls.ar_filter(table["y"], phi), range(-12, 37), rows)
    peak = max(range(0, 37), key=lambda k: clean[k])
    assert peak == 9
    negative = max(abs(clean[k]) for k in range(-12, 0))
    assert negative < 0.25 * clean[peak]
    assert max(abs(raw[k]) for k in range(-12, 0)) > negative
