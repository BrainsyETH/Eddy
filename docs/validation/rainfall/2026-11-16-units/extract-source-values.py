"""Read NOAA's own MRMS source files at the rain gauges in this capture.

Evidence helper, not part of the collector. It answers one question the saved
raster cannot answer by itself: is the hosted image service's raw value the
same number as NOAA's published RadarOnly_QPE product, whose unit is documented
as millimetres? It also reads the gauge-corrected MultiSensor products at the
same gauges so the radar-only product's bias can be seen beside them.

    python3 -m venv venv && venv/bin/pip install pygrib numpy
    for p in RadarOnly_QPE_24H MultiSensor_QPE_24H_Pass1 MultiSensor_QPE_24H_Pass2; do
      curl -O https://noaa-mrms-pds.s3.amazonaws.com/CONUS/${p}_00.00/20261116/MRMS_${p}_00.00_20261116-180000.grib2.gz
    done; gunzip *.grib2.gz
    venv/bin/python extract-source-values.py . GRIB_DIRECTORY > source-comparison.json
"""
import gzip, hashlib, json, sys
import pygrib

evidence, grib_dir = sys.argv[1], sys.argv[2]
capture = json.load(open(f"{evidence}/capture.json"))
usgs = json.loads(gzip.open(f"{evidence}/usgs-precipitation.json.gz").read())
where = {f["properties"]["monitoring_location_id"].removeprefix("USGS-"): f["geometry"]["coordinates"] for f in usgs["features"]}
stamp = capture["raster"]["end"].replace("-", "").replace(":", "")[:13].replace("T", "-") + "00"
products = ["RadarOnly_QPE_24H", "MultiSensor_QPE_24H_Pass1", "MultiSensor_QPE_24H_Pass2"]
files, readers = {}, {}
for product in products:
    name = f"MRMS_{product}_00.00_{stamp}.grib2"
    path = f"{grib_dir}/{name}"
    message = pygrib.open(path)[1]
    values, (lats, lons) = message.values, message.latlons()
    lat0, lon0 = float(lats[0, 0]), float(lons[0, 0])
    dlat, dlon = float(lats[1, 0] - lats[0, 0]), float(lons[0, 1] - lons[0, 0])
    files[product] = {"url": f"https://noaa-mrms-pds.s3.amazonaws.com/CONUS/{product}_00.00/{stamp[:8]}/{name}.gz",
                      "sha256Uncompressed": hashlib.sha256(open(path, "rb").read()).hexdigest(), "validTime": message.validDate.isoformat() + "Z"}
    readers[product] = lambda lon, lat, v=values, a=lat0, b=lon0, c=dlat, d=dlon: float(v[int(round((lat - a) / c)), int(round((lon % 360 - b) / d))])
sites = []
for site in capture["sites"]:
    at = where[site["site"]]
    sites.append({"site": site["site"], **{p: round(readers[p](at[0], at[1]), 3) for p in products}})
print(json.dumps({"window": capture["raster"], "unitDocumentedByNoaa": "mm", "files": files, "sites": sites}, indent=2))
