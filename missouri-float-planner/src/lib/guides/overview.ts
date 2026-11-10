export interface GuideMapRoute { id: number; number: number; label: string; miles: string; path: string; start: number[]; end: number[] }
export interface GuideMap {
  routes: GuideMapRoute[];
  /** The rest of the river, drawn faintly behind the featured stretches. */
  river: string | null;
  /** The same stretches as longitude/latitude, for the interactive map. */
  geo: { id: number; coordinates: number[][] }[];
  /** [west, south, east, north] of the featured stretches, padded a little. */
  bounds: [number, number, number, number] | null;
}

type Line = { id: number; number: number; label: string; miles: string; geometry: unknown };

function lineCoords(geometry: unknown): number[][] | null {
  const geom = geometry as { type?: string; coordinates?: unknown } | null;
  if (geom?.type !== 'LineString' || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) return null;
  const coords = geom.coordinates as number[][];
  if (coords.some(p => !Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) return null;
  return coords;
}

/** The stored river line is coarse and sometimes steps past a bend and back.
 * At overview scale that reads as a stray tick beside an endpoint. Drop a
 * vertex when the line reverses on itself there and the detour is tiny.
 * Endpoints are never moved: they are the access points. */
function withoutSpurs(points: number[][], maxSpur = 10): number[][] {
  let pts = points;
  for (let pass = 0; pass < 4; pass++) {
    const kept = pts.filter((b, i) => {
      if (i === 0 || i === pts.length - 1) return true;
      const a = pts[i - 1], c = pts[i + 1];
      const ab = [b[0] - a[0], b[1] - a[1]], bc = [c[0] - b[0], c[1] - b[1]];
      const lab = Math.hypot(ab[0], ab[1]), lbc = Math.hypot(bc[0], bc[1]);
      if (lab === 0 || lbc === 0) return false;
      const cos = (ab[0] * bc[0] + ab[1] * bc[1]) / (lab * lbc);
      return !(cos < -0.5 && Math.min(lab, lbc) < maxSpur);
    });
    if (kept.length === pts.length) break;
    pts = kept;
  }
  return pts;
}

const toPath = (coords: number[][]) => coords.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

/** Compact north-up projection of the planner's actual route geometry. Invalid
 * or missing lines are omitted; no decorative replacement river is invented.
 * The view is fitted to the featured stretches; the optional river line is real
 * geometry too and is simply clipped by the frame. */
export function guideOverviewMap(lines: Line[], riverGeometry?: unknown): GuideMap {
  const valid = lines.flatMap(line => { const coords = lineCoords(line.geometry); return coords ? [{ ...line, coords }] : []; });
  if (!valid.length) return { routes: [], river: null, geo: [], bounds: null };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const line of valid) for (const [x, y] of line.coords) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const cos = Math.cos((minY + maxY) / 2 * Math.PI / 180);
  const width = (maxX - minX) * cos, height = maxY - minY;
  if (!(width > 0 || height > 0)) return { routes: [], river: null, geo: [], bounds: null };
  const scale = Math.min(550 / Math.max(width, 0.000001), 260 / Math.max(height, 0.000001));
  const project = (p: number[]) => [300 + ((p[0] - (minX + maxX) / 2) * cos * scale), 150 - (p[1] - (minY + maxY) / 2) * scale];
  // Limit client payload while retaining endpoints. This is an overview,
  // never the navigation geometry supplied by the planner.
  const thin = (coords: number[][], cap: number) => {
    const stride = Math.max(1, Math.ceil(coords.length / cap));
    return coords.filter((_, i) => i % stride === 0 || i === coords.length - 1);
  };
  const routes = valid.map(line => {
    const coords = withoutSpurs(thin(line.coords, 1200).map(project));
    return { id: line.id, number: line.number, label: line.label, miles: line.miles,
      path: toPath(coords), start: coords[0], end: coords[coords.length - 1] };
  });
  const riverCoords = lineCoords(riverGeometry);
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  const geo = valid.map(line => ({ id: line.id, coordinates: thin(line.coords, 400).map(p => [round(p[0]), round(p[1])]) }));
  const padX = Math.max((maxX - minX) * 0.08, 0.005), padY = Math.max((maxY - minY) * 0.08, 0.005);
  return { routes, river: riverCoords ? toPath(withoutSpurs(thin(riverCoords, 1500).map(project))) : null,
    // Extra room to the south keeps the plan button, which sits at the bottom of the map, off the floats.
    geo, bounds: [round(minX - padX), round(minY - padY * 4), round(maxX + padX), round(maxY + padY)] };
}

export function guideOverview(lines: Line[]): GuideMapRoute[] {
  return guideOverviewMap(lines).routes;
}
