export interface GuideMapRoute { id: number; number: number; label: string; miles: string; path: string; start: number[]; end: number[] }

/** Compact north-up projection of the planner's actual route geometry. Invalid
 * or missing lines are omitted; no decorative replacement river is invented. */
export function guideOverview(lines: { id: number; number: number; label: string; miles: string; geometry: unknown }[]): GuideMapRoute[] {
  const valid = lines.flatMap(line => {
    const geom = line.geometry as { type?: string; coordinates?: unknown } | null;
    if (geom?.type !== 'LineString' || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) return [];
    const coords = geom.coordinates as number[][];
    if (coords.some(p => !Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) return [];
    return [{ ...line, coords }];
  });
  if (!valid.length) return [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const line of valid) for (const [x, y] of line.coords) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const cos = Math.cos((minY + maxY) / 2 * Math.PI / 180);
  const width = (maxX - minX) * cos, height = maxY - minY;
  if (!(width > 0 || height > 0)) return [];
  const scale = Math.min(550 / Math.max(width, 0.000001), 260 / Math.max(height, 0.000001));
  const project = (p: number[]) => [300 + ((p[0] - (minX + maxX) / 2) * cos * scale), 150 - (p[1] - (minY + maxY) / 2) * scale];
  return valid.map(line => {
    // Limit client payload while retaining endpoints. This is an overview,
    // never the navigation geometry supplied by the planner.
    const stride = Math.max(1, Math.ceil(line.coords.length / 1200));
    const coords = line.coords.filter((_, i) => i % stride === 0 || i === line.coords.length - 1).map(project);
    return { id: line.id, number: line.number, label: line.label, miles: line.miles,
      path: coords.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
      start: coords[0], end: coords[coords.length - 1] };
  });
}
