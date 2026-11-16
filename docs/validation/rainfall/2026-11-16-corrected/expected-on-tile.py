"""Independent read (pygrib) of a GRIB2 file at the centres of a Web Mercator tile."""
import json, math, sys
import numpy as np, pygrib
grib, tile_json, out = sys.argv[1:4]
tile = json.load(open(tile_json))["tile"]
m = pygrib.open(grib)[1]
v = m.values; lats, lons = m.latlons()
lat0, lon0 = float(lats[0, 0]), float(lons[0, 0]); dlat = float(lats[0, 0] - lats[1, 0]); dlon = float(lons[0, 1] - lons[0, 0])
R = 6378137.0
res = np.empty((tile["height"], tile["width"]), dtype="<f4")
for y in range(tile["height"]):
    lat = math.degrees(2 * math.atan(math.exp((tile["ymax"] - (y + 0.5) * tile["dy"]) / R)) - math.pi / 2)
    r = int(round((lat0 - lat) / dlat))
    for x in range(tile["width"]):
        lon = math.degrees((tile["xmin"] + (x + 0.5) * tile["dx"]) / R) % 360
        res[y, x] = v[r, int(round((lon - lon0) / dlon))]
res.tofile(out)
print(json.dumps({"cells": int(res.size), "max": float(res.max()), "negative": int((res < 0).sum()), "wet": int((res > 0).sum())}))
