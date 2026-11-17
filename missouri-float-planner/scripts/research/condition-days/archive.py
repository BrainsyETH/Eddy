"""Fetch the study's approved USGS daily mean discharge. One value per calendar day."""
import argparse
import calendar
import csv
import io
import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[3] / "src/data/condition-days"
START, END = 2006, 2025


def fetch_site(site):
    query = urlencode(dict(f="csv", monitoring_location_id=f"USGS-{site}",
                           parameter_code="00060", statistic_id="00003",
                           datetime=f"{START}-01-01/{END}-12-31", limit=10000,
                           properties="time,value,qualifier,approval_status,monitoring_location_id,parameter_code,statistic_id,unit_of_measure"))
    url = f"https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items?{query}"
    years = [[None] * (365 + calendar.isleap(y)) for y in range(START, END + 1)]
    seen = set()
    with urlopen(url, timeout=100) as response:
        if 'rel="next"' in response.headers.get("Link", ""):
            raise ValueError(f"Unexpected pagination for {site}")
        reader = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8-sig"))
        if "approval_status" not in (reader.fieldnames or []):
            raise ValueError(f"Unexpected USGS response for {site}")
        for row in reader:
            if (row["monitoring_location_id"], row["parameter_code"], row["statistic_id"], row["unit_of_measure"]) != (f"USGS-{site}", "00060", "00003", "ft^3/s"):
                raise ValueError(f"Unexpected series for {site}")
            day = date.fromisoformat(row["time"])
            if day in seen or not START <= day.year <= END:
                raise ValueError(f"Unexpected date for {site}: {day}")
            seen.add(day)
            if row["approval_status"] != "Approved" or row["qualifier"] or not row["value"]:
                continue
            value = float(row["value"])
            if math.isfinite(value) and value >= 0:
                years[day.year - START][(day - date(day.year, 1, 1)).days] = int(value) if value.is_integer() else value
    if not any(value is not None for year in years for value in year):
        raise ValueError(f"No eligible daily observations for {site}")
    # Keep calendar alignment (including leap days) while making annual records diffable.
    return "[\n" + ",\n".join(json.dumps(y, separators=(",", ":")) for y in years) + "\n]\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("sites", nargs="*", help="USGS site IDs; defaults to the published catalog")
    parser.add_argument("--out", type=Path, default=ROOT / "archive")
    args = parser.parse_args()
    sites = args.sites or [row["site"] for row in json.loads((ROOT / "stations.json").read_text())]
    args.out.mkdir(exist_ok=True, parents=True)

    def save(site):
        target = args.out / f"{site}.json"
        target.write_text(fetch_site(site))
        print(site, flush=True)

    with ThreadPoolExecutor(max_workers=3) as executor:
        list(executor.map(save, sorted(set(sites))))
