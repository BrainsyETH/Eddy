"""Download the study's inputs from public services and write a data snapshot.

No credentials. Sources: the Corps' CWMS Data API (hourly releases) and the
USGS instantaneous-values service (15-minute stage, tributary discharge).
Raw responses are cached under data/raw/ (not committed); the compact
snapshot under data/ is what run_study.py reads.

Run: python fetch_data.py [--end 2026-11-12T18:00:00Z]
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

import lagstudy as ls

HERE = Path(__file__).parent
AGENT = {"User-Agent": "tailwater-lag-study/2 (python-urllib)"}
CWMS = "https://cwms-data.usace.army.mil/cwms-data/timeseries?"
USGS = "https://waterservices.usgs.gov/nwis/iv/?"
UTC_OFFSET_HOURS = {"CST": 6, "CDT": 5, "UTC": 0}


def cached(path: Path, url: str, headers: dict) -> bytes:
    if path.exists():
        return path.read_bytes()
    for attempt in range(4):
        try:
            with urlopen(Request(url, headers=headers), timeout=180) as response:
                body = response.read()
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))
    path.write_bytes(body)
    time.sleep(0.5)
    return body


def cwms_series(raw: Path, ts_id: str, office: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    """Hourly period-ending means, re-stamped to the hour each one covers."""
    parts = []
    edges = list(pd.date_range(start, end, freq="180D")) + [end]
    for a, b in zip(edges[:-1], edges[1:]):
        # Period-ending: ask one hour past each edge so no covered hour is lost.
        query = urlencode({"name": ts_id, "office": office, "page-size": 500000,
                           "begin": a.strftime("%Y-%m-%dT%H:%M:%SZ"),
                           "end": (b + ls.HOUR).strftime("%Y-%m-%dT%H:%M:%SZ")})
        name = f"cwms_{ts_id.split('.')[0]}_{a:%Y%m%d}_{b:%Y%m%d%H}.json"
        body = json.loads(cached(raw / name, CWMS + query, {**AGENT, "Accept": "application/json;version=2"}))
        values = body.get("values") or []
        index = pd.to_datetime([v[0] for v in values], unit="ms", utc=True)
        parts.append(pd.Series([np.nan if v[1] is None else float(v[1]) for v in values], index=index))
    series = pd.concat(parts)
    series = ls.period_ending_to_hour_begin(series[~series.index.duplicated()].sort_index())
    return ls.regular_hourly(series, start, end - ls.HOUR)


def usgs_series(raw: Path, site: str, parameter: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    parts = []
    edges = list(pd.date_range(start, end, freq="60D")) + [end]
    for a, b in zip(edges[:-1], edges[1:]):
        query = urlencode({"format": "rdb", "sites": site, "parameterCd": parameter,
                           "startDT": a.strftime("%Y-%m-%dT%H:%MZ"), "endDT": b.strftime("%Y-%m-%dT%H:%MZ")})
        text = cached(raw / f"usgs_{site}_{parameter}_{a:%Y%m%d}_{b:%Y%m%d%H}.rdb", USGS + query, AGENT).decode()
        lines = [line for line in text.splitlines() if line and not line.startswith("#")]
        if len(lines) < 3:
            continue
        frame = pd.read_csv(io.StringIO("\n".join([lines[0]] + lines[2:])), sep="\t", dtype=str)
        column = next(c for c in frame.columns if c.endswith("_" + parameter))
        local = pd.to_datetime(frame["datetime"])
        offset = pd.to_timedelta(frame["tz_cd"].map(UTC_OFFSET_HOURS).astype(float), unit="h")
        index = pd.DatetimeIndex(local + offset).tz_localize("UTC")
        parts.append(pd.Series(pd.to_numeric(frame[column], errors="coerce").to_numpy(), index=index))
    series = pd.concat(parts).dropna()
    series = series[~series.index.duplicated()].sort_index()
    return series[(series.index >= start) & (series.index < end)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--end", help="Snapshot end (UTC hour). Default: the current hour.")
    args = parser.parse_args()
    protocol = json.loads((HERE / "protocol.json").read_text())
    start = pd.Timestamp(protocol["periods"]["development"]["start"])
    end = (pd.Timestamp(args.end) if args.end else pd.Timestamp.now(tz="UTC")).floor("1h")
    data = HERE / "data"
    raw = data / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    src = protocol["sources"]

    releases = pd.DataFrame({
        "bull_shoals_cfs": cwms_series(raw, src["bull_shoals_release"]["ts_id"], "SWL", start, end),
        "norfork_cfs": cwms_series(raw, src["norfork_release"]["ts_id"], "SWL", start, end),
    })
    # The newest hours can be unpublished; end the snapshot at the last complete hour.
    last = releases.dropna().index[-1]
    end = last + ls.HOUR
    releases = releases.loc[:last]
    releases.index.name = "hour_begin_utc"
    releases.to_csv(data / "release_hourly.csv", float_format="%.1f")

    files = {"release_hourly.csv": releases.notna().sum().to_dict()}
    for key, gauge in src["gauges"].items():
        stage = usgs_series(raw, gauge["usgs_site"], gauge["parameter"], start, end)
        stage.index.name = "time_utc"
        name = f"stage_{key}_{gauge['usgs_site']}.csv.gz"
        stage.rename("gage_height_ft").to_csv(data / name, float_format="%.2f")
        files[name] = {"samples": int(len(stage)), "first": str(stage.index[0]), "last": str(stage.index[-1])}

    tributaries = pd.DataFrame({
        f"{key}_cfs": ls.hourly_mean(usgs_series(raw, t["usgs_site"], t["parameter"], start, end), 1)
        for key, t in src["tributaries"].items()
    }).reindex(releases.index)
    tributaries.index.name = "hour_begin_utc"
    tributaries.to_csv(data / "tributary_hourly.csv", float_format="%.1f")
    files["tributary_hourly.csv"] = tributaries.notna().sum().to_dict()

    snapshot = {
        "fetched_at_utc": pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
        "start_utc": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_exclusive_utc": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "hours": int(len(releases)),
        "files": files,
        "sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                   for p in sorted(data.glob("*.csv*"))},
        "note": "USGS values newer than a few months are provisional and can be revised.",
    }
    (data / "snapshot.json").write_text(json.dumps(snapshot, indent=2) + "\n")
    print(json.dumps(snapshot, indent=2))


if __name__ == "__main__":
    main()
