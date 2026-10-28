import { gaugeFreshness, observationAgeHours } from '@shared/gauge-freshness';
import { flowBand, FLOW_BAND_ORDER, FLOW_BAND_SYSTEM, FLOW_BAND_UNKNOWN_SOLID, type FlowBand } from '@shared/flow-band';
import type { MapGaugeLite } from '@/app/api/gauges/map/route';

export type { MapGaugeLite };
export type GaugeFilter = FlowBand | 'flow' | 'stage' | 'historical';
export const GAUGE_FILTERS: GaugeFilter[] = [...FLOW_BAND_ORDER, 'flow', 'stage', 'historical'];

const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Web decoder for the v1 iOS wire format; never turn an invalid response into an empty map. */
export function decodeMapIndex(body: unknown, now = Date.now()): MapGaugeLite[] {
  if (!body || typeof body !== 'object' || !('v' in body) || body.v !== 1 || !('rows' in body) || !Array.isArray(body.rows)) {
    throw new Error('Unsupported gauge index');
  }
  const sites = new Map<string, MapGaugeLite>();
  for (const row of body.rows) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || !/^\d{8,15}$/.test(row[0])) continue;
    const lng = finite(row[1]), lat = finite(row[2]), epoch = finite(row[5]);
    if (lng === null || lat === null || Math.abs(lng) > 180 || Math.abs(lat) > 90 || (lng === 0 && lat === 0)) continue;
    const time = epoch === null ? NaN : epoch * 1000;
    const timestamp = Number.isFinite(time) && Math.abs(time) <= 8.64e15 ? new Date(time).toISOString() : null;
    sites.set(row[0], {
      id: `index:${row[0]}`, siteId: row[0], name: `USGS ${row[0]}`, coordinates: { lng, lat },
      dischargeCfs: finite(row[3]), gaugeHeightFt: finite(row[4]), readingTimestamp: timestamp,
      readingAgeHours: observationAgeHours(timestamp, now), readingSuspect: row[6] === 1,
      curated: false, flowPercentile: finite(row[7]), freshness: gaugeFreshness(timestamp, now),
    });
  }
  return [...sites.values()];
}

export function referenceBand(g: Pick<MapGaugeLite, 'readingSuspect' | 'readingTimestamp' | 'flowPercentile'>, now = Date.now()) {
  return g.readingSuspect || gaugeFreshness(g.readingTimestamp, now) !== 'live' ? null : flowBand(g.flowPercentile);
}

/**
 * Count bubbles for grouped unrated stations. Parchment with an ink edge, so a
 * group can never be read as one station's flow comparison: every color of
 * the teal/stone ramp (FLOW_BAND_SYSTEM) is a filled dot.
 */
export const REFERENCE_CLUSTER_FILL = '#F2EAD8';
export const REFERENCE_CLUSTER_INK = '#2D2A24';

export function referenceColor(g: MapGaugeLite, now = Date.now()): string {
  const band = referenceBand(g, now);
  return band ? FLOW_BAND_SYSTEM[band].solid : FLOW_BAND_UNKNOWN_SOLID;
}

/** Same semantics as iOS: bands OR together, measurement traits AND, historical is inclusion. */
export function filterMapGauges(gauges: MapGaugeLite[], active: ReadonlySet<GaugeFilter>, now = Date.now()): MapGaugeLite[] {
  const bands = FLOW_BAND_ORDER.filter(band => active.has(band));
  return gauges.filter(g => !g.curated
    && (active.has('historical') || gaugeFreshness(g.readingTimestamp, now) !== 'historical')
    && (!active.has('flow') || g.dischargeCfs !== null)
    && (!active.has('stage') || g.gaugeHeightFt !== null)
    && (!bands.length || bands.some(band => referenceBand(g, now) === band)));
}

export interface GaugeLayers { rated: boolean; other: boolean }
export function restoreGaugeLayers(raw: string | null, legacyRaw: string | null = null): GaugeLayers {
  const defaults = { rated: true, other: true };
  try {
    if (raw === null) {
      const legacy = JSON.parse(legacyRaw ?? 'null');
      if (typeof legacy?.showGauges === 'boolean') return { rated: legacy.showGauges, other: legacy.showGauges };
    }
    const value = JSON.parse(raw ?? 'null');
    return { rated: typeof value?.rated === 'boolean' ? value.rated : defaults.rated,
      other: typeof value?.other === 'boolean' ? value.other : defaults.other };
  } catch { return defaults; }
}

export interface GaugeViewport { bounds: [number, number, number, number]; zoom: number }
export const GAUGE_NAME_ZOOM = 8;

/** Small padded CDN keys, split at the date line rather than requesting an invalid box. */
export function gaugeNameRequests(viewport: GaugeViewport | null): string[] {
  if (!viewport || viewport.zoom < GAUGE_NAME_ZOOM || viewport.bounds.some(n => !Number.isFinite(n))) return [];
  const [w, s, e, n] = viewport.bounds;
  const span = e >= w ? e - w : e + 360 - w;
  const pad = span * 0.2, latPad = Math.max(0, n - s) * 0.2;
  const south = Math.max(-90, Math.floor((s - latPad) * 20) / 20);
  const north = Math.min(90, Math.ceil((n + latPad) * 20) / 20);
  if (north < south || span <= 0) return [];
  if (span + 2 * pad >= 360) return [[-180, south, 180, north].join(',')];
  const west = ((w - pad + 180) % 360 + 360) % 360 - 180;
  const east = west + span + 2 * pad;
  const boxes = east > 180 ? [[west, 180], [-180, east - 360]] : [[west, east]];
  return boxes.map(([left, right]) => [Math.max(-180, Math.floor(left * 20) / 20), south,
    Math.min(180, Math.ceil(right * 20) / 20), north].join(','));
}

export function mergeGaugeNames(previous: ReadonlyMap<string, string>, rows: unknown[]): ReadonlyMap<string, string> {
  let next: Map<string, string> | null = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !('siteId' in row) || !('name' in row)) continue;
    const { siteId, name } = row;
    if (typeof siteId !== 'string' || !/^\d{8,15}$/.test(siteId) || typeof name !== 'string' || !name.trim() || name === `USGS ${siteId}`) continue;
    if ((next ?? previous).get(siteId) === name) continue;
    next ??= new Map(previous); next.set(siteId, name);
  }
  return next ?? previous;
}

/** Names never change index membership, coordinates, or the latest reading. */
export function enrichGaugeNames(index: MapGaugeLite[], names: ReadonlyMap<string, string>): MapGaugeLite[] {
  let changed = false;
  const result = index.map(gauge => {
    const name = names.get(gauge.siteId);
    if (!name || name === gauge.name) return gauge;
    changed = true; return { ...gauge, name };
  });
  return changed ? result : index;
}

/** No polling renders: wake only when an observation crosses a freshness boundary. */
export function nextFreshnessChange(gauges: MapGaugeLite[], now: number): number | null {
  let next = Infinity;
  for (const gauge of gauges) {
    const time = Date.parse(gauge.readingTimestamp ?? '');
    if (!Number.isFinite(time)) continue;
    for (const boundary of [time - 300_000, time + 6 * 3_600_000 + 1, time + 24 * 3_600_000 + 1]) {
      if (boundary > now && boundary < next) next = boundary;
    }
  }
  return Number.isFinite(next) ? next : null;
}

/** SVG map screen grid: every visible station belongs to exactly one marker, without a row cap. */
export function clusterGaugePoints<T extends { x: number; y: number }>(points: T[], view: { x: number; y: number; w: number; h: number }, pixelWidth: number) {
  // A world-anchored grid changes only when the zoom crosses a discrete step.
  // Whole edge cells keep their membership/centroid while panning. One screen
  // of overscan fills newly exposed areas before the gesture commits.
  const cell = 64 * 2 ** Math.floor(Math.log2(view.w / Math.max(1, pixelWidth)));
  const minX = Math.floor((view.x - view.w) / cell), maxX = Math.floor((view.x + 2 * view.w) / cell);
  const minY = Math.floor((view.y - view.h) / cell), maxY = Math.floor((view.y + 2 * view.h) / cell);
  const groups = new Map<string, T[]>();
  for (const p of points) {
    const x = Math.floor(p.x / cell), y = Math.floor(p.y / cell);
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    const key = `${cell}:${x}:${y}`;
    const group = groups.get(key);
    if (group) group.push(p); else groups.set(key, [p]);
  }
  return [...groups.entries()].map(([key, members]) => ({ key, members,
    x: members.reduce((sum, p) => sum + p.x, 0) / members.length,
    y: members.reduce((sum, p) => sum + p.y, 0) / members.length }));
}
