"""Figure and yearly table for the replay. Descriptive; run after `run_replay.py score`."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

import make_figures as mf

HERE = Path(__file__).parent
OUT = HERE / "results_replay"
GROUPS = [("Estimate issued and scored", mf.BLUE, ["issued and evaluated"]),
          ("Issued, then withdrawn or not scorable", mf.AQUA, ["issued, then withdrawn before the rise", "issued, outcome not determined"]),
          ("Withheld", mf.ORANGE, ["withheld"])]


def main():
    frozen = json.loads((OUT / "frozen_rule.json").read_text())["frozen"]
    test = pd.read_csv(OUT / "replay_test.csv")
    dev = pd.read_csv(OUT / "replay_development.csv")
    both = pd.concat([test.assign(period="untouched test"), dev.assign(period="rule built here")])
    years = sorted(both["year"].unique())
    table = {}
    fig, ax = plt.subplots(figsize=(8.6, 4.6))
    for i, year in enumerate(years):
        rows = both[both["year"] == year]
        left = 0
        counts = []
        for label, colour, statuses in GROUPS:
            n = int(rows["outcome"].isin(statuses).sum())
            counts.append(n)
            if n:
                ax.barh(-i, n - 1.2, left=left + 0.6, height=0.55, color=colour)
                if n >= 12:
                    ax.text(left + n / 2, -i, str(n), ha="center", va="center", fontsize=9, color="#ffffff")
            left += n
        table[str(year)] = {"detected": int(len(rows)), "issued_and_scored": counts[0], "other_issued": counts[1],
                            "withheld": counts[2], "share_issued_and_scored": counts[0] / max(len(rows), 1)}
    ax.set_yticks([-i for i in range(len(years))],
                  [f"{y}{' *' if y <= 2021 else ''}" for y in years])
    ax.tick_params(axis="y", length=0)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Detected release increases in the year (2026 runs to Nov 12; 2019 release data is two-thirds complete)")
    handles = [matplotlib.patches.Patch(color=colour) for _, colour, _ in GROUPS]
    ax.legend(handles, [label for label, _, _ in GROUPS], loc="upper center", bbox_to_anchor=(0.45, -0.17), ncol=3, fontsize=9)
    mf.title(ax, "In most years the rule withholds more often than it estimates",
             "What happened to every detected release increase. * marks the untouched years the rule was scored on.")
    mf.save_to(fig, OUT / "fig1_what_happened_to_each_increase.png")
    (OUT / "by_year.json").write_text(json.dumps(table, indent=1) + "\n")
    for year, row in table.items():
        print(year, row)
    print("range offsets:", frozen["range_early_offset_h"], frozen["range_late_offset_h"])


if __name__ == "__main__":
    main()
