"""Exploratory Elk transfer, NOT a production rating or threshold importer.

Requires numpy, pandas and scikit-learn. All inputs are public USGS records.
Run: python research-elk-gauge-transfer.py --cache-dir /tmp/elk-transfer
Outputs JSON to stdout; raw responses stay in the disposable cache directory.
Uses daily means: this does not validate instantaneous recreational cutoffs.
"""

import argparse
import io
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LinearRegression

BASE = "https://api.waterdata.usgs.gov/ogcapi/v0/collections/"
SERIES = {
    "tiff": "558c2bea78f64a9ca51b808e784b7abe",
    "big": "ded6c4c143074b0d93feb1226aba81c2",
    "little": "4cdb80f4d26448e087560c5a8f95757c",
    "indian": "fe58ac626bed4eebaf6f104fabbd4afa",
}
PREDICTORS = ["big", "little", "indian"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=Path("/tmp/elk-transfer"))
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)

    def fetch(name, url):
        file = args.cache_dir / (name + ".txt")
        if not file.exists():
            request = Request(url, headers={"User-Agent": "Eddy Elk research"})
            with urlopen(request, timeout=60) as response:
                file.write_bytes(response.read())
        return file.read_text()

    def observations(name, collection, series, dates, limit):
        query = urlencode(dict(f="json", time_series_id=series,
                               datetime=dates, limit=limit))
        data = json.loads(fetch(name, BASE + collection + "/items?" + query))
        if any(link.get("rel") == "next" for link in data.get("links", [])):
            raise ValueError("Incomplete download: paginate before analysis")
        frame = pd.DataFrame(feature["properties"] for feature in data["features"])
        if frame.empty or frame.time.duplicated().any():
            raise ValueError("Missing or duplicate time-series observations")
        frame["value"] = pd.to_numeric(frame["value"], errors="raise")
        # Exclude estimated/unavailable/suspect qualified records; provisional
        # unqualified records remain and must not be described as approved data.
        return frame[frame.qualifier.map(lambda q: q is None or q == [])]

    flows = []
    for name, series in SERIES.items():
        frame = observations(name, "daily", series, "2023-01-01/2026-10-03", 5000)
        frame["time"] = pd.to_datetime(frame.time)
        flows.append(frame[frame.value > 0].set_index("time").value.rename(name))
    flows = pd.concat(flows, axis=1).sort_index()
    historical = flows.dropna()
    train = historical[historical.index < "2025-01-01"]
    test = historical[historical.index >= "2025-01-01"]
    model = LinearRegression().fit(np.log(train[PREDICTORS]), np.log(train.tiff))
    predicted = np.exp(model.predict(np.log(test[PREDICTORS])))
    errors_pct = np.abs(predicted / test.tiff - 1) * 100

    # Keep the historical model locked; do not refit it using the holdout.
    upstream = flows[PREDICTORS].dropna().copy()
    upstream["equivalent_cfs"] = np.exp(model.predict(np.log(upstream[PREDICTORS])))
    noel = observations("noel", "continuous", "1d9e1029c2414830b5bbe99ba1e834b3",
                        "2026-06-02T00:00:00Z/2026-10-03T23:59:59Z", 50000)
    local = pd.to_datetime(noel.time, utc=True).dt.tz_convert("America/Chicago")
    noel["day"] = local.dt.tz_localize(None).dt.normalize()
    daily = noel.groupby("day").value.agg(["mean", "count"])
    joined = upstream.join(daily[daily["count"] >= 90], how="inner")
    early = joined[joined.index < "2026-08-01"]
    late = joined[joined.index >= "2026-08-01"]
    temporal = IsotonicRegression(out_of_bounds="nan").fit(
        np.log(early.equivalent_cfs), early["mean"])
    temporal_pred = temporal.predict(np.log(late.equivalent_cfs))

    # A separate blocked interpolation check, NOT a future-season validation.
    block = (joined.index - joined.index.min()).days // 14
    errors_ft, out_of_range = [], 0
    for held in sorted(set(block)):
        fit, holdout = joined[block != held], joined[block == held]
        curve = IsotonicRegression(out_of_bounds="nan").fit(
            np.log(fit.equivalent_cfs), fit["mean"])
        predictions = curve.predict(np.log(holdout.equivalent_cfs))
        for (date, row), value in zip(holdout.iterrows(), predictions):
            if not np.isfinite(value):
                out_of_range += 1
                continue
            errors_ft.append(dict(date=str(date.date()), observed_ft=float(row["mean"]),
                                  predicted_ft=float(value), error_ft=float(abs(value-row["mean"]))))

    rating_url = "https://waterdata.usgs.gov/nwisweb/get_ratings?site_no=07189000&file_type=exsa"
    lines = [line for line in fetch("rating", rating_url).splitlines() if not line.startswith("#")]
    rating = pd.read_csv(io.StringIO("\n".join([lines[0]] + lines[2:])), sep="\t")
    curve = IsotonicRegression(out_of_bounds="nan").fit(
        np.log(joined.equivalent_cfs), joined["mean"])
    candidates = []
    for stage in [2.5, 3.5, 4.5, 5.0, 6.0, 6.5]:
        flow = float(np.interp(stage, rating.INDEP, rating.DEP))
        value = float(curve.predict(np.log([flow]))[0])
        candidates.append(dict(tiff_stage_ft=stage, archived_rating_cfs=flow,
                               candidate_noel_daily_mean_ft=round(value, 2) if np.isfinite(value) else None))
    print(json.dumps(dict(
        status="research_only_not_live_thresholds",
        historical=dict(train_days=len(train), test_days=len(test),
                        median_absolute_percent_error=float(np.median(errors_pct)),
                        p90_absolute_percent_error=float(np.percentile(errors_pct, 90))),
        noel=dict(usable_days=len(joined), temporal_test_days=len(late),
                  temporal_test_in_range_days=int(np.isfinite(temporal_pred).sum()),
                  blocked_scored_days=len(errors_ft), blocked_out_of_range_days=out_of_range,
                  blocked_mae_ft=float(np.mean([r["error_ft"] for r in errors_ft])),
                  blocked_p90_error_ft=float(np.percentile([r["error_ft"] for r in errors_ft], 90)),
                  largest_errors=sorted(errors_ft, key=lambda r: r["error_ft"], reverse=True)[:4]),
        candidates=candidates,
    ), indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
