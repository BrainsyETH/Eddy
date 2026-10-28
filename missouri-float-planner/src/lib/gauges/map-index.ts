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
export function restoreGaugeLayers(raw: string | null): GaugeLayers {
  const defaults = { rated: true, other: true };
  try {
    const value = JSON.parse(raw ?? 'null');
    return { rated: typeof value?.rated === 'boolean' ? value.rated : defaults.rated,
      other: typeof value?.other === 'boolean' ? value.other : defaults.other };
  } catch { return defaults; }
}

/** SVG map screen grid: every visible station belongs to exactly one marker, without a row cap. */
export function clusterGaugePoints<T extends { x: number; y: number }>(points: T[], view: { x: number; y: number; w: number; h: number }, pixelWidth: number) {
  const cell = 64 * view.w / Math.max(1, pixelWidth);
  const groups = new Map<string, T[]>();
  for (const p of points) {
    if (p.x < view.x || p.x > view.x + view.w || p.y < view.y || p.y > view.y + view.h) continue;
    const key = `${Math.floor((p.x - view.x) / cell)}:${Math.floor((p.y - view.y) / cell)}`;
    const group = groups.get(key);
    if (group) group.push(p); else groups.set(key, [p]);
  }
  return [...groups.entries()].map(([key, members]) => ({ key, members,
    x: members.reduce((sum, p) => sum + p.x, 0) / members.length,
    y: members.reduce((sum, p) => sum + p.y, 0) / members.length }));
}
