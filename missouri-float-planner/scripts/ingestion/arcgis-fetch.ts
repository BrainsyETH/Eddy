/**
 * Small read-only helpers shared by the November 2026 one-off scripts:
 * ArcGIS feature queries that refuse truncated answers, and paged Supabase
 * selects. Nothing here writes anywhere.
 */
import type { LngLat } from './access-enrichment-2026-11';

const USER_AGENT = 'eddy-float-planner/1.0 (one-off access enrichment; https://eddy.guide)';

export interface ArcFeature { attributes: Record<string, unknown>; geometry?: { x?: number; y?: number; paths?: number[][][] } }

export async function arcgis(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ f: 'json', ...params });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${url}/query`, {
        method: 'POST', body, headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Record<string, unknown>;
      if (json.error) throw new Error(`ArcGIS error ${JSON.stringify(json.error)}`);
      return json;
    } catch (error) {
      if (attempt >= 4) throw new Error(`${url}: ${(error as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
}

/** Every feature matching `filter`, by ID inventory then batches — record limits are not pagination. */
export async function fetchAll(source: { url: string; fields: string }, filter: Record<string, string> = { where: '1=1' }) {
  const listing = await arcgis(source.url, { ...filter, returnIdsOnly: 'true' });
  const ids = (listing.objectIds as number[] | null) ?? [];
  const oidField = String(listing.objectIdFieldName ?? 'OBJECTID');
  const features: ArcFeature[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const want = ids.slice(i, i + 200);
    const page = await arcgis(source.url, {
      objectIds: want.join(','), outFields: source.fields, returnGeometry: 'true', outSR: '4326',
    });
    const got = (page.features as ArcFeature[]) ?? [];
    if (page.exceededTransferLimit || got.length !== want.length) {
      throw new Error(`${source.url}: batch returned ${got.length} of ${want.length}; rerun`);
    }
    features.push(...got);
  }
  return { features, oidField };
}

export const envelope = ([lng, lat]: LngLat, meters: number) => {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { xmin: lng - dLng, ymin: lat - dLat, xmax: lng + dLng, ymax: lat + dLat };
};

export const envelopeFilter = (e: { xmin: number; ymin: number; xmax: number; ymax: number }) => ({
  where: '1=1', geometry: JSON.stringify({ ...e, spatialReference: { wkid: 4326 } }),
  geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
});

export const featureUrl = (layer: string, oid: unknown) => `${layer}/query?objectIds=${oid}&outFields=*&outSR=4326&f=pjson`;

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

export async function selectAll<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw error;
    const rows = (data as T[]) ?? [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
