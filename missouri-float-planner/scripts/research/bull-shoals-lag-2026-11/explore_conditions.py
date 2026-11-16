"""Study 3 follow-up cuts and figures, made AFTER the untouched years were scored.

Post hoc: the splits here were chosen after seeing where the frozen model
missed, so they describe the data and are not validated rules. Writes
results_conditions/exploratory.json and two figures.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import conditions as c
import make_figures as mf
from run_study import clean

HERE = Path(__file__).parent
OUT = HERE / "results_conditions"
BANDS = ["under 5 ft", "5 to 6 ft", "6 to 7 ft", "7 to 8.5 ft", "over 8.5 ft"]


def main():
    t = pd.read_csv(OUT / "scored_test.csv", parse_dates=["onset_time"])
    error = t["error_conditions"]
    steady = t["weather"] == "tributaries steady"
    low = t["stage0"] < 7
    from_minimum = t["baseline"] < 1500
    dry = t["rain_4d_in"] < 0.5
    cuts = {
        "all (the pre-set pass mark)": np.ones(len(t), dtype=bool),
        "gauge under 7 ft": low,
        "gauge under 7 ft, tributaries steady": low & steady,
        "gauge under 7 ft, tributaries steady, under 0.5 in rain": low & steady & dry,
        "gauge under 7 ft, tributaries moving": low & ~steady,
        "gauge 7 ft or higher": ~low,
        "low baseline before the increase (under 1,500 cfs)": from_minimum,
        "low baseline, tributaries steady (hindsight label), gauge under 7 ft": from_minimum & steady & low,
        "dam already running (1,500 cfs or more)": ~from_minimum,
        "dam already running 3,000 cfs or more": t["baseline"] >= 3000,
    }
    out = {"note": "Post hoc cuts of the untouched-test events with the frozen conditions model. Not validated rules.",
           "cuts": {name: {**c.score(error[rows]), "median_delay_h": float(t.loc[rows, "delay_h"].median())}
                    for name, rows in cuts.items()}}
    # The "tributaries steady" label looks 24 hours past the release. This version
    # uses only the 12 hours before it, which is what could be known at the time.
    data = c.load(HERE / "data_conditions" / "test")
    hour = pd.Timedelta(hours=1)

    def before(start):
        total = 0.0
        for column in ("buffalo_cfs", "crooked_cfs"):
            part = data["flows"][column].loc[start - 12 * hour:start - hour].dropna()
            if len(part) < 6:
                return np.nan
            total += part.max() - part.min()
        return total

    prior = np.array([before(h) for h in pd.to_datetime(t["hour"])])
    known_then = from_minimum & low & (prior <= 500)
    out["gate_using_only_readings_before_the_release"] = {
        **c.score(error[known_then]), "events": int(known_then.sum()),
        "share_of_all_detected_starts": float(known_then.sum() / len(pd.read_csv(OUT / "events_test.csv"))),
        "admitted_that_the_hindsight_label_excluded": int((known_then & ~(from_minimum & steady & low)).sum())}
    events = pd.read_csv(OUT / "events_test.csv")
    out["availability"] = {"detected_starts": int(len(events)), "scored_not_stepped": int(len(t)),
                           "hindsight_normal_group": int((from_minimum & steady & low).sum()),
                           "share_of_detected_starts": float((from_minimum & steady & low).sum() / len(events))}
    out["median_delay_h_by_baseline"] = {"under 1,500 cfs": float(t.loc[from_minimum, "delay_h"].median()),
                                         "1,500 cfs or more": float(t.loc[~from_minimum, "delay_h"].median()),
                                         "3,000 cfs or more": float(t.loc[t["baseline"] >= 3000, "delay_h"].median())}
    stepped = events[events["scored"] & events["stepped"] & events[["stage0", "gauge_cfs0", "tributary_cfs"]].notna().all(axis=1)]
    gap = stepped["surge_delay_h"] - stepped["delay_h"]
    out["stepped_measure_check"] = {"events": int(len(stepped)), "steepest_rise_before_first_rise": int((gap < 0).sum()),
                                    "by_more_than_5h": int((gap < -5).sum()), "by_more_than_12h": int((gap < -12).sum())}
    (OUT / "exploratory.json").write_text(json.dumps(clean(out), indent=1) + "\n")
    print(json.dumps(clean({k: out[k] for k in out if k not in ("cuts", "note")}), indent=1))
    for name, value in out["cuts"].items():
        print(f"{name:62s} n={value['n']:3d} within={value['share_within_2h']:.3f} early={value['share_more_than_2h_early']:.3f}")

    results = json.loads((OUT / "results.json").read_text())
    fig, ax = plt.subplots(figsize=(8.6, 3.9))
    parts = (("share_more_than_2h_early", mf.ORANGE, "More than 2 h early"), ("share_within_2h", mf.BLUE, "Within 2 h"),
             ("share_more_than_2h_late", mf.AQUA, "More than 2 h late"))
    for i, band in enumerate(BANDS):
        row = results["by_river_height"][band]["conditions"]
        left = 0.0
        for key, colour, label in parts:
            width = 100 * row[key]
            if width > 0:
                ax.barh(-i, width - 0.5, left=left + 0.25, height=0.5, color=colour)
                if width >= 6:
                    ax.text(left + width / 2, -i, f"{width:.0f}%", ha="center", va="center", fontsize=9.5,
                            color="#ffffff")
            left += width
        ax.text(101.5, -i, f"{row['n']} events", va="center", fontsize=9, color=mf.INK2)
    ax.set_yticks([-i for i in range(len(BANDS))], [b.capitalize() for b in BANDS])
    ax.tick_params(axis="y", length=0)
    ax.set_xlim(0, 118)
    ax.set_xticks([0, 25, 50, 75, 100])
    ax.xaxis.set_major_formatter(lambda v, _: f"{v:.0f}%")
    ax.grid(visible=False)
    ax.set_xlabel("Share of release increases, 2022-2024")
    handles = [matplotlib.patches.Patch(color=colour) for _, colour, _ in parts]
    ax.legend(handles, [label for _, _, label in parts], loc="upper center", bbox_to_anchor=(0.45, -0.22), ncol=3, fontsize=9)
    mf.title(ax, "The estimate holds on a normal river and breaks on a high one",
             "Gauge height near Norfork just before the release. Arrival against the frozen prediction, untouched years.")
    mf.save_to(fig, OUT / "fig1_accuracy_by_river_height.png")

    fig, ax = plt.subplots(figsize=(8.6, 4.8))
    shown = t[t["stage0"] <= 14]
    for rows, colour, label in ((shown["baseline"] < 1500, mf.BLUE, "Low baseline before the increase (under 1,500 cfs)"),
                                (shown["baseline"] >= 1500, mf.ORANGE, "Dam already running (1,500 cfs or more)")):
        part = shown[rows]
        ax.scatter(part["stage0"], part["error_conditions"], s=44, color=colour, edgecolor=mf.SURFACE,
                   linewidth=1.2, label=f"{label}, n = {len(part)}")
    ax.axhspan(-2, 2, color=mf.GRID, alpha=0.6, zorder=0)
    ax.axhline(0, color=mf.AXIS, linewidth=1)
    for y, text in ((2, "2 h early"), (-2, "2 h late")):
        ax.annotate(text, (1.01, y), xycoords=("axes fraction", "data"), va="center", fontsize=9, color=mf.INK2)
    ax.set_xlabel("Gauge height near Norfork before the release (ft)")
    ax.set_ylabel("Hours the rise came ahead of the prediction")
    ax.set_ylim(-5, 10.5)
    ax.legend(loc="upper right", fontsize=9)
    hidden = int((t["stage0"] > 14).sum()) + int(((shown["error_conditions"] < -5) | (shown["error_conditions"] > 10.5)).sum())
    mf.title(ax, "Early arrivals are releases stacked on a river that is already running",
             f"Each dot is one release increase, 2022-2024. {hidden} events fall outside the frame.")
    mf.save_to(fig, OUT / "fig2_early_arrivals.png")


if __name__ == "__main__":
    main()
