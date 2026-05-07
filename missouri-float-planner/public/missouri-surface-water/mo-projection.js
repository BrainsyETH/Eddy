// mo-projection.js — real Albers Equal Area projection for Missouri,
// plus a tiny GeoJSON → SVG path helper. This is the bridge layer that
// lets the prototype render real NHD/USGS data without a map library.
//
// Usage from a data file or a generator script:
//   const path = projectLineToSVGPath(geoJsonLineString.coordinates);
//   // path is a "M x y L x y …" string ready to drop into <path d=…>
//
// All coordinates are [lon, lat] (GeoJSON convention).
//
// SVG canvas: 1600 × 1000. Projection is fitted so Missouri's bounding box
// (-95.77, 35.99) → (-89.10, 40.61) maps with margin into the canvas.

(function () {
  const SVG_W = 1600;
  const SVG_H = 1000;
  const MARGIN = 40;

  // Albers Equal Area parameters tuned for Missouri.
  // Standard parallels chosen at the state's latitudinal extent.
  const PROJ = {
    lon0: -92.5,        // central meridian (~middle of MO)
    lat0: 38.3,         // latitude of origin (~middle of MO)
    lat1: 36.5,         // standard parallel 1 (south)
    lat2: 40.0,         // standard parallel 2 (north)
  };

  const D2R = Math.PI / 180;

  // Pre-computed Albers constants
  const sinLat1 = Math.sin(PROJ.lat1 * D2R);
  const sinLat2 = Math.sin(PROJ.lat2 * D2R);
  const n = (sinLat1 + sinLat2) / 2;
  const C = Math.cos(PROJ.lat1 * D2R) ** 2 + 2 * n * sinLat1;
  const rho0 = Math.sqrt(C - 2 * n * Math.sin(PROJ.lat0 * D2R)) / n;

  // Project [lon, lat] → unscaled (x, y) in Albers space (meters-ish, dimensionless)
  function albers(lon, lat) {
    const lonR = (lon - PROJ.lon0) * D2R;
    const latR = lat * D2R;
    const rho = Math.sqrt(C - 2 * n * Math.sin(latR)) / n;
    const theta = n * lonR;
    const x = rho * Math.sin(theta);
    const y = rho0 - rho * Math.cos(theta);
    return [x, y];
  }

  // Compute the bounding box of MO in Albers space, used to fit the canvas.
  // Missouri's geographic bounding box (rough rectangle of state extent).
  const MO_BBOX = { minLon: -95.77, maxLon: -89.10, minLat: 35.99, maxLat: 40.61 };

  // Sample the bbox corners + midpoints to get a tight Albers bbox.
  function computeAlbersBBox() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const samples = 12;
    for (let i = 0; i <= samples; i++) {
      for (let j = 0; j <= samples; j++) {
        const lon = MO_BBOX.minLon + (MO_BBOX.maxLon - MO_BBOX.minLon) * (i / samples);
        const lat = MO_BBOX.minLat + (MO_BBOX.maxLat - MO_BBOX.minLat) * (j / samples);
        const [x, y] = albers(lon, lat);
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
    return { minX, minY, maxX, maxY };
  }

  const ABBOX = computeAlbersBBox();
  const aw = ABBOX.maxX - ABBOX.minX;
  const ah = ABBOX.maxY - ABBOX.minY;
  const innerW = SVG_W - MARGIN * 2;
  const innerH = SVG_H - MARGIN * 2;
  const SCALE = Math.min(innerW / aw, innerH / ah);
  const OFFSET_X = MARGIN + (innerW - aw * SCALE) / 2 - ABBOX.minX * SCALE;
  const OFFSET_Y = MARGIN + (innerH - ah * SCALE) / 2 - ABBOX.minY * SCALE;

  // Project [lon, lat] → SVG (x, y)
  // Note: SVG Y increases downward; Albers Y increases northward.
  // We flip Y by mapping (ABBOX.maxY - ay) so north maps to small SVG-y.
  function project(lon, lat) {
    const [ax, ay] = albers(lon, lat);
    const sx = ax * SCALE + OFFSET_X;
    const sy = (ABBOX.maxY + ABBOX.minY - ay) * SCALE + OFFSET_Y;
    return [sx, sy];
  }

  function projectLineToSVGPath(coords) {
    if (!coords || coords.length === 0) return "";
    let out = "";
    for (let i = 0; i < coords.length; i++) {
      const [x, y] = project(coords[i][0], coords[i][1]);
      out += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
    }
    return out;
  }

  function projectPolygonToSVGPath(rings) {
    let out = "";
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = project(ring[i][0], ring[i][1]);
        out += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
      }
      out += "Z";
    }
    return out;
  }

  // Compute a parametric `t` (0..1) along a projected polyline closest to a lat/lon point.
  // Used to snap a USGS gauge to its parent NHD reach.
  function snapToLine(lineCoords, lon, lat) {
    if (!lineCoords || lineCoords.length < 2) return 0;
    const [px, py] = project(lon, lat);
    // Project all vertices first, then walk segments
    const pts = lineCoords.map(c => project(c[0], c[1]));
    // Cumulative length
    let totalLen = 0;
    const lens = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i-1][0];
      const dy = pts[i][1] - pts[i-1][1];
      totalLen += Math.sqrt(dx*dx + dy*dy);
      lens.push(totalLen);
    }
    let bestDist = Infinity, bestT = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i-1];
      const [x2, y2] = pts[i];
      const dx = x2 - x1, dy = y2 - y1;
      const segLen2 = dx*dx + dy*dy;
      if (segLen2 === 0) continue;
      let u = ((px - x1) * dx + (py - y1) * dy) / segLen2;
      u = Math.max(0, Math.min(1, u));
      const cx = x1 + u * dx, cy = y1 + u * dy;
      const ddx = px - cx, ddy = py - cy;
      const d = ddx*ddx + ddy*ddy;
      if (d < bestDist) {
        bestDist = d;
        const segLen = Math.sqrt(segLen2);
        const distAlong = lens[i-1] + u * segLen;
        bestT = distAlong / totalLen;
      }
    }
    return bestT;
  }

  window.MO_PROJECTION = {
    SVG_W, SVG_H,
    project,
    projectLineToSVGPath,
    projectPolygonToSVGPath,
    snapToLine,
    bbox: MO_BBOX,
  };
})();
