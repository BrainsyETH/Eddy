"""Download one period of inputs for the conditions study (study 3).

Adds to study 2's inputs: discharge at the Norfork gauge and daily station
rainfall from NOAA's ACIS service. Public sources, no credentials.

Run: python fetch_conditions.py --start 2022-01-01T00:00:00Z --end 2025-01-01T00:00:00Z --out data_conditions/test
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlencode

import numpy as np
import pandas as pd

import lagstudy as ls
from fetch_data import AGENT, cached, cwms_series, usgs_series

HERE = Path(__file__).parent
ACIS = "https://data.rcc-acis.org/MultiStnData?"
RAIN_BBOX = "-93.2,35.8,-92.0,36.5"  # Buffalo, Crooked Creek and the White from the dam to Calico Rock


def area_rain(raw: Path, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """Daily rainfall averaged over every reporting station in the box."""
    rows = []
    for year in range(start.year, end.year + 1):
        a = max(start.tz_localize(None), pd.Timestamp(year, 1, 1))
        b = min(end.tz_localize(None), pd.Timestamp(year, 12, 31))
        if a > b:
            continue
        query = urlencode({"bbox": RAIN_BBOX, "sdate": f"{a:%Y-%m-%d}", "edate": f"{b:%Y-%m-%d}",
                           "elems": "pcpn", "meta": "name"})
        body = json.loads(cached(raw / f"acis_{a:%Y%m%d}_{b:%Y%m%d}.json", ACIS + query, AGENT))
        days = pd.date_range(a, b, freq="1D")
        values = np.full((len(body["data"]), len(days)), np.nan)
        for i, station in enumerate(body["data"]):
            for j, cell in enumerate(station["data"][:len(days)]):
                text = cell[0] if isinstance(cell, list) else cell
                if text == "T":
                    values[i, j] = 0.0
                else:
                    try:
                        values[i, j] = float(text)
                    except ValueError:
                        pass
        count = np.isfinite(values).sum(axis=0)
        with np.errstate(invalid="ignore"):
            mean = np.where(count >= 5, np.nanmean(np.where(np.isfinite(values), values, np.nan), axis=0), np.nan)
        rows.append(pd.DataFrame({"rain_in": mean, "stations": count}, index=days))
    out = pd.concat(rows)
    out.index.name = "date"
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    protocol = json.loads((HERE / "protocol.json").read_text())
    src = protocol["sources"]
    start, end = pd.Timestamp(args.start), pd.Timestamp(args.end)
    out = HERE / args.out
    raw = out / "raw"
    raw.mkdir(parents=True, exist_ok=True)

    releases = pd.DataFrame({
        "bull_shoals_cfs": cwms_series(raw, src["bull_shoals_release"]["ts_id"], "SWL", start, end),
        "norfork_cfs": cwms_series(raw, src["norfork_release"]["ts_id"], "SWL", start, end)})
    releases.index.name = "hour_begin_utc"
    releases.to_csv(out / "release_hourly.csv.gz", float_format="%.1f")
    site = src["gauges"]["norfork"]["usgs_site"]
    stage = usgs_series(raw, site, "00065", start, end)
    stage.index.name = "time_utc"
    stage.rename("gage_height_ft").to_csv(out / "stage_norfork.csv.gz", float_format="%.2f")
    hourly = pd.DataFrame({
        "gauge_cfs": ls.hourly_mean(usgs_series(raw, site, "00060", start, end), 1),
        **{f"{key}_cfs": ls.hourly_mean(usgs_series(raw, t["usgs_site"], t["parameter"], start, end), 1)
           for key, t in src["tributaries"].items()}}).reindex(releases.index)
    hourly.index.name = "hour_begin_utc"
    hourly.to_csv(out / "flows_hourly.csv.gz", float_format="%.1f")
    rain = area_rain(raw, start, end)
    rain.to_csv(out / "rain_daily.csv", float_format="%.3f")
    summary = {"start_utc": args.start, "end_exclusive_utc": args.end,
               "fetched_at_utc": pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
               "release_hours": releases.notna().sum().to_dict(), "stage_samples": int(len(stage)),
               "hourly_flow_hours": hourly.notna().sum().to_dict(),
               "rain_days": int(rain["rain_in"].notna().sum())}
    (out / "snapshot.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
