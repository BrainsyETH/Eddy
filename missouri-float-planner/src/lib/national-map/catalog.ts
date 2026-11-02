// src/lib/national-map/catalog.ts
// The national map's STATION CATALOG: where every in-scope USGS gauge is, what
// it is called, and which state it is in. Changes weekly at most (station
// metadata sync), so it is fetched once per session and CDN-cached for hours,
// while frames (readings) refresh on their own schedule.
//
// Separate from /api/gauges/points on purpose: that tuple is a wire format
// shared by hand with the iOS decoder in @eddy/types. The national map must be
// able to grow fields without moving the phone's contract.

import type { NationalStation } from './station-source';

export const CATALOG_VERSION = 1;

/** [siteId, lng, lat, stateCode | '', curated (0|1), name, waterbody | ''] */
export type CatalogRow = [string, number, number, string, 0 | 1, string, string];

export interface StationCatalog {
  v: typeof CATALOG_VERSION;
  generatedAt: string;
  rows: CatalogRow[];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function buildCatalog(stations: NationalStation[], now = new Date()): StationCatalog {
  return {
    v: CATALOG_VERSION,
    generatedAt: now.toISOString(),
    rows: stations.map((s) => [
      s.siteId,
      r4(s.lng),
      r4(s.lat),
      s.stateCode ?? '',
      s.curated ? 1 : 0,
      s.name,
      s.waterbody ?? '',
    ]),
  };
}

export interface CatalogStation {
  siteId: string;
  lng: number;
  lat: number;
  stateCode: string | null;
  curated: boolean;
  name: string;
  waterbody: string | null;
}

export function decodeCatalog(body: unknown): CatalogStation[] {
  if (!body || typeof body !== 'object') throw new Error('Catalog is not an object');
  const b = body as Partial<StationCatalog>;
  if (b.v !== CATALOG_VERSION || !Array.isArray(b.rows)) throw new Error('Unsupported station catalog');
  const out: CatalogStation[] = [];
  const seen = new Set<string>();
  for (const r of b.rows as unknown[]) {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || !/^\d{8,15}$/.test(r[0])) continue;
    if (seen.has(r[0])) continue;
    const lng = typeof r[1] === 'number' && Number.isFinite(r[1]) ? r[1] : null;
    const lat = typeof r[2] === 'number' && Number.isFinite(r[2]) ? r[2] : null;
    if (lng === null || lat === null) continue;
    seen.add(r[0]);
    out.push({
      siteId: r[0],
      lng,
      lat,
      stateCode: typeof r[3] === 'string' && r[3] ? r[3] : null,
      curated: r[4] === 1,
      name: typeof r[5] === 'string' && r[5] ? r[5] : `USGS ${r[0]}`,
      waterbody: typeof r[6] === 'string' && r[6] ? r[6] : null,
    });
  }
  return out;
}
