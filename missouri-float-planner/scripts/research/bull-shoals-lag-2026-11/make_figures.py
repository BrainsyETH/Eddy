"""Draw the study's figures from results/ and the data snapshot.

Run after run_study.py: python make_figures.py
Colours are the validated light-surface palette (categorical slots 1-3 and a
single-hue ordinal ramp for release level); text stays in ink tones.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import lagstudy as ls

HERE = Path(__file__).parent
OUT = HERE / "results"
SURFACE, INK, INK2, MUTED, GRID, AXIS = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
RAMP = {"low": "#86b6ef", "middle": "#2a78d6", "high": "#104281"}

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "font.size": 10, "text.color": INK, "axes.labelcolor": INK2, "axes.edgecolor": AXIS,
    "xtick.color": MUTED, "ytick.color": MUTED, "xtick.labelcolor": INK2, "ytick.labelcolor": INK2,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "axes.axisbelow": True,
    "axes.spines.top": False, "axes.spines.right": False, "axes.spines.left": False,
    "lines.linewidth": 2, "lines.solid_capstyle": "round", "legend.frameon": False,
})


def title(ax, heading, sub=None):
    ax.set_title(heading, loc="left", fontsize=12, fontweight="bold", color=INK, pad=24 if sub else 8)
    if sub:
        ax.text(0, 1.03, sub, transform=ax.transAxes, fontsize=9.5, color=INK2, va="bottom")


def save_to(fig, path):
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def save(fig, name):
    save_to(fig, OUT / name)


def example_event(releases, stage):
    """One locked-test event: the release at the dam and the stage 41.5 miles down."""
    hour = pd.Timestamp("2026-10-23T20:00:00Z")
    a, b = hour - pd.Timedelta(hours=6), hour + pd.Timedelta(hours=26)
    events = pd.read_csv(OUT / "events_norfork_rise.csv", parse_dates=["hour", "onset_time"])
    row = events[events["hour"] == hour].iloc[0]
    onset = row["onset_time"]
    arrival = onset + pd.Timedelta(hours=float(row["delay_h"]))
    central = lambda idx: idx.tz_convert("America/Chicago").tz_localize(None)
    fig, (top, bottom) = plt.subplots(2, 1, figsize=(8.6, 5.6), sharex=True, height_ratios=[1, 1])
    r = releases.loc[a:b]
    top.step(central(r.index), r.to_numpy(), where="post", color=BLUE)
    top.set_ylabel("Release at the dam (cfs)")
    top.yaxis.set_major_formatter(lambda v, _: f"{v:,.0f}")
    s = stage.loc[a:b]
    bottom.plot(central(s.index), s.to_numpy(), color=BLUE)
    bottom.set_ylabel("Stage near Norfork (ft)")
    for ax, when, text in ((top, onset, "Release starts rising\n3:30 PM"),
                           (bottom, arrival, "River up 0.1 ft\n5:00 AM")):
        x = central(pd.DatetimeIndex([when]))[0]
        ax.axvline(x, color=INK2, linewidth=1)
        ax.annotate(text, (x, 0.95), xycoords=("data", "axes fraction"), xytext=(-6, 0),
                    textcoords="offset points", fontsize=9, color=INK, va="top", ha="right")
    bottom.annotate("", (central(pd.DatetimeIndex([arrival]))[0], 0.6), (central(pd.DatetimeIndex([onset]))[0], 0.6),
                    xycoords=("data", "axes fraction"), arrowprops={"arrowstyle": "<->", "color": INK2, "lw": 1})
    mid = central(pd.DatetimeIndex([onset + (arrival - onset) / 2]))[0]
    bottom.text(mid, 0.63, f"{row['delay_h']:.1f} hours", transform=bottom.get_xaxis_transform(),
                ha="center", va="bottom", fontsize=10, fontweight="bold")
    bottom.xaxis.set_major_formatter(matplotlib.dates.DateFormatter("%-I %p\n%b %-d"))
    bottom.set_xlabel("Central time")
    title(top, "One release, followed downstream", "Oct 23-24, 2026 (locked-test period). The gauge is 41.5 river miles below the dam.")
    save(fig, "fig1_example_event.png")


def delay_vs_release(results):
    g = results["gauges"]["norfork"]["part_a_events"]["rise"]
    events = pd.read_csv(OUT / "events_norfork_rise.csv")
    good = events[events["exclude"].isna() & (events["status"] == "matched")]
    coef = g["models"]["flow"]["coefficients"]
    fig, ax = plt.subplots(figsize=(8.6, 5.2))
    for period, colour, label in (("development", BLUE, "Development events (Jan 2025 - Oct 16, 2026)"),
                                  ("locked_test", ORANGE, "Locked-test events (Oct 17 - Nov 12, 2026)")):
        part = good[good["period"] == period]
        ax.scatter(part["qpeak"], part["delay_h"], s=44, color=colour, edgecolor=SURFACE, linewidth=1.2,
                   label=f"{label}, n = {len(part)}", zorder=3 if period == "locked_test" else 2)
    x = np.linspace(3000, 24000, 200)
    q24 = float(good["q24"].median())
    fitted = np.exp(coef["intercept"] + coef["ln_q24"] * np.log(q24) + coef["ln_qpeak"] * np.log(x))
    ax.plot(x, fitted, color=AQUA, label="Fitted delay (at a typical prior day)", zorder=4)
    guide = ls.predict("guides", pd.DataFrame({"qpeak": x}), miles=41.5)
    ax.plot(x, guide, color=MUTED, linewidth=1.5, label="Resort speed table, same distance", zorder=1)
    ax.annotate("Fitted", (x[-1], fitted[-1]), xytext=(6, 0), textcoords="offset points", va="center", fontsize=9)
    ax.annotate("Resort table", (x[-1], guide[-1]), xytext=(6, 0), textcoords="offset points", va="center", fontsize=9, color=INK2)
    ax.set_xlabel("Peak release in the first three hours (cfs). One generator's worth is about 3,300 cfs.")
    ax.set_ylabel("Hours until the river is up 0.1 ft")
    ax.xaxis.set_major_formatter(lambda v, _: f"{v:,.0f}")
    ax.set_xlim(2500, 26500)
    ax.legend(loc="upper right", fontsize=9)
    title(ax, "Bigger releases reach the Norfork gauge sooner",
          "Each dot is one release increase after six quiet hours, matched to the first rise 41.5 miles downstream.")
    save(fig, "fig2_delay_vs_release.png")


def share_within(results):
    models = results["gauges"]["norfork"]["part_a_events"]["rise"]["models"]
    names = [("flow", "Delay fitted to release level"), ("constant", "One fixed delay (12.75 h)"),
             ("guides", "Resort speed table")]
    fig, ax = plt.subplots(figsize=(8.6, 3.6))
    height = 0.3
    for i, (key, label) in enumerate(names):
        for j, (split, colour) in enumerate((("cross_validation", BLUE), ("locked_test", ORANGE))):
            value = 100 * models[key][split]["share_within_tolerance"]
            y = -i + (0.5 - j) * (height + 0.04)
            ax.barh(y, value, height=height, color=colour,
                    label={"cross_validation": "Held-out months, 2025-2026 (154 events)",
                           "locked_test": "Locked test, Oct 17 - Nov 12 (14 events)"}[split] if i == 0 else None)
            ax.text(value + 1, y, f"{value:.0f}%", va="center", fontsize=9.5)
    ax.axvline(80, color=INK2, linewidth=1)
    ax.text(79, 0.62, "Pass mark: 80%", ha="right", va="bottom", fontsize=9, color=INK2)
    ax.set_yticks([-i for i in range(len(names))], [label for _, label in names])
    ax.tick_params(axis="y", length=0)
    ax.set_xlim(0, 108)
    ax.set_ylim(-2.5, 0.95)
    ax.grid(axis="y", visible=False)
    ax.xaxis.set_major_formatter(lambda v, _: f"{v:.0f}%")
    ax.set_xlabel("Share of events predicted within 2 hours")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.24), ncol=2, fontsize=9)
    title(ax, "Only the release-dependent delay clears the pass mark both times", "Norfork gauge, first-rise events")
    save(fig, "fig3_share_within_two_hours.png")


def responses(results):
    fig, axes = plt.subplots(1, 2, figsize=(10.4, 4.2), sharey=True)
    for ax, (key, name) in zip(axes, (("norfork", "Near Norfork (mile 41.5)"), ("calico", "Calico Rock (mile 60.1)"))):
        b = results["gauges"][key]["part_b_distributed_lag"]
        cuts = b["regime_cut_points_cfs"]
        names = {"low": f"Under {cuts[0]:,.0f} cfs", "middle": "In between", "high": f"Over {cuts[1]:,.0f} cfs"}
        for regime in ("low", "middle", "high"):
            beta = np.array(b["responses"][regime]["ft_per_1000cfs_by_lag"], dtype=float)
            peak = b["responses"][regime]["peak_lag_h"]
            ax.plot(range(len(beta)), beta, color=RAMP[regime], label=f"{names[regime]}: peak at {peak} h")
            ax.scatter([peak], [beta[peak]], s=44, color=RAMP[regime], edgecolor=SURFACE, linewidth=1.2, zorder=3)
        ax.axhline(0, color=AXIS, linewidth=1)
        ax.set_xlabel("Hours after the release changed")
        ax.set_xlim(0, 36 if key == "norfork" else 44)
        ax.set_title(name, loc="left", fontsize=10.5, color=INK)
        ax.legend(title="Average release over the prior 36 h", loc="upper center", bbox_to_anchor=(0.5, -0.17),
                  fontsize=8.5, title_fontsize=8.5, alignment="left")
    axes[0].set_ylabel("Stage change (ft) per 1,000 cfs")
    fig.suptitle("The river answers later when less water has been running", x=0.065, ha="left",
                 fontsize=12, fontweight="bold", y=1.04)
    fig.text(0.065, 0.965, "Hour-by-hour response of stage to a release change, daily cycle and Norfork Dam accounted for. Development data.",
             fontsize=9.5, color=INK2)
    save(fig, "fig4_response_by_release_level.png")


def cross_check(results):
    check = results["gauges"]["norfork"]["part_b_distributed_lag"]["cross_check"]["pooled"]
    fig, ax = plt.subplots(figsize=(8.6, 4.0))
    for key, colour, label in (("raw", ORANGE, "Raw series (study 1's method)"),
                               ("prewhitened", BLUE, "Daily cycle filtered out first")):
        lags = sorted(int(k) for k in check[key]["r_by_lag"])
        ax.plot(lags, [check[key]["r_by_lag"][str(k)] for k in lags], color=colour, label=label)
    ax.axvline(0, color=AXIS, linewidth=1)
    ax.axhline(0, color=AXIS, linewidth=1)
    ax.annotate("Left of zero: the river\nmoving before the\ndam did", (-12.4, 0.52), ha="left", va="center",
                fontsize=9, color=INK2)
    ax.annotate("Both peak at 12 h", (12, check["raw"]["r_by_lag"]["12"]), xytext=(0, 6), textcoords="offset points",
                ha="center", fontsize=9)
    ax.set_ylim(-0.33, 0.62)
    ax.set_xlabel("Hours the stage change trails the release change")
    ax.set_ylabel("Correlation")
    ax.legend(loc="upper right", fontsize=9)
    title(ax, "Filtering the daily schedule removes the impossible correlations", "Norfork gauge, development data")
    save(fig, "fig5_daily_cycle_check.png")


def main():
    results = json.loads((OUT / "results.json").read_text())
    protocol = json.loads((HERE / "protocol.json").read_text())
    releases = pd.read_csv(HERE / "data" / "release_hourly.csv.gz", index_col=0, parse_dates=True)["bull_shoals_cfs"]
    releases.index = pd.DatetimeIndex(releases.index).tz_convert("UTC")
    site = protocol["sources"]["gauges"]["norfork"]["usgs_site"]
    stage = pd.read_csv(HERE / "data" / f"stage_norfork_{site}.csv.gz", index_col=0, parse_dates=True)["gage_height_ft"]
    stage.index = pd.DatetimeIndex(stage.index).tz_convert("UTC")
    example_event(releases, stage)
    delay_vs_release(results)
    share_within(results)
    responses(results)
    cross_check(results)


if __name__ == "__main__":
    main()
