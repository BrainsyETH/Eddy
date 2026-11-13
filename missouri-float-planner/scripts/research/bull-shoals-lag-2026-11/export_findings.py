"""Write the numbers the public findings page draws.

    python export_findings.py

Reads the two replay result files (every detected release increase, 2019 to
2026, with the gauge's answer) and writes
src/data/release-timing/bull-shoals-findings.json. The page imports that file;
src/lib/release-timing/findings.test.ts recomputes the same counts and medians
from the CSVs, so the page cannot drift from the study.

What counts, in the page's own words:
  an increase   the release rose 2,000 cfs or more (smaller ones are dropped)
  scored        matched to exactly one rise, with a complete gauge record
  a normal river  release began under 1,500 cfs, gauge under 7 ft, and no
                  smaller increase of 500 cfs or more in the 20 hours before
"""
import csv
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
OUT = HERE.parents[2] / "src" / "data" / "release-timing" / "bull-shoals-findings.json"
SOURCES = ["results_replay/replay_development.csv", "results_replay/replay_test.csv"]
GENERATOR_CFS = 3300
SIZE_BANDS = [("About 1", 0, 1.5), ("About 2", 1.5, 2.5), ("About 3", 2.5, 3.5), ("About 4", 3.5, 4.5), ("5 or more", 4.5, 99)]
HEIGHT_BANDS = [("Under 5 ft", 0, 5), ("5 to 6 ft", 5, 6), ("6 to 7 ft", 6, 7), ("7 to 8.5 ft", 7, 8.5), ("Over 8.5 ft", 8.5, 99)]
BASELINE_GROUPS = [("Under 1,500 cfs", 0, 1500), ("1,500 cfs or more", 1500, 1e9), ("3,000 cfs or more", 3000, 1e9)]
# A measured release the map replays by default: about four generators' worth.
EXAMPLE_HOUR = "2026-10-23 20:00:00+00:00"


def number(row, key):
    return float(row[key]) if row[key] != "" else None


def stats(values):
    v = np.array(values, dtype=float)
    return {
        "n": int(v.size),
        "median": round(float(np.median(v)), 2),
        "p10": round(float(np.percentile(v, 10)), 2),
        "p90": round(float(np.percentile(v, 90)), 2),
        "min": float(v.min()),
        "max": float(v.max()),
    }


def main():
    rows = [row for name in SOURCES for row in csv.DictReader(open(HERE / name))]
    increases = [r for r in rows if "increase under 2,000 cfs" not in r["all_reasons"]]
    scored = [r for r in increases if r["match"] == "matched" and r["delay_h"] != "" and r["gauge_gap"] == "False"]

    def normal(r):
        step = number(r, "pre_step_cfs")
        return number(r, "baseline") < 1500 and number(r, "stage0") < 7 and (step is None or step < 500)

    points = sorted(
        [round(number(r, "qpeak")), number(r, "delay_h"), round(number(r, "stage0"), 3), round(number(r, "baseline"), 1), int(normal(r))]
        for r in scored
    )
    delays = lambda keep: [p[1] for p in points if keep(p)]
    example = next(r for r in scored if r["hour"] == EXAMPLE_HOUR)
    onset_ms = int(np.datetime64(example["onset_time"][:19], "ms").astype("int64"))
    out = {
        "source": " + ".join(SOURCES),
        "years": [min(int(r["year"]) for r in scored), max(int(r["year"]) for r in scored)],
        "generatorCfs": GENERATOR_CFS,
        "increases": len(increases),
        "scored": len(scored),
        "normal": sum(p[4] for p in points),
        "normalAll": stats(delays(lambda p: p[4] == 1)),
        "size": [
            {"label": label, "lo": lo, "hi": hi, **stats(delays(lambda p: p[4] == 1 and lo <= p[0] / GENERATOR_CFS < hi))}
            for label, lo, hi in SIZE_BANDS
        ],
        "height": [{"label": label, "lo": lo, "hi": hi, **stats(delays(lambda p: lo <= p[2] < hi))} for label, lo, hi in HEIGHT_BANDS],
        "baseline": [{"label": label, "lo": lo, **stats(delays(lambda p: lo <= p[3] < hi))} for label, lo, hi in BASELINE_GROUPS],
        "example": {"onsetMs": onset_ms, "riseMs": onset_ms + int(round(number(example, "delay_h") * 3_600_000)), "peakCfs": round(number(example, "qpeak"))},
        # [three-hour peak cfs, hours to first rise, gauge ft at the start, release cfs before, normal river]
        "points": points,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(HERE.parents[2])}: {out['increases']} increases, {out['scored']} scored, {out['normal']} on a normal river")


if __name__ == "__main__":
    main()
