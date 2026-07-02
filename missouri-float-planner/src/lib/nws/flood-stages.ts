// src/lib/nws/flood-stages.ts
//
// Official NWS flood/action stages via the National Water Prediction Service (NWPS).
// This is the successor to AHPS (retired 2024). Unlike src/lib/nws/alerts.ts (which
// only fetches active alerts), this fetches the per-gauge stage thresholds we use to
// anchor level_dangerous/level_high to real hydrology instead of editorial guesses
// (audit F4). Keyed by NWS Location ID (LID, 5 letters, e.g. "VBNM7" for the Current
// River at Van Buren) — stored in gauge_stations.nws_lid.

export interface NwpsFloodStages {
  lid: string;
  /** Minor flood stage (ft) — the primary "flood_stage". */
  floodStageFt: number | null;
  /** Action / bankfull stage (ft) — early caution. */
  actionStageFt: number | null;
  moderateStageFt: number | null;
  majorStageFt: number | null;
  /** USGS site id reported by NWPS, for cross-checking the LID mapping. */
  usgsSiteId: string | null;
}

const NWPS_BASE = 'https://api.water.noaa.gov/nwps/v1/gauges';

function toStage(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Fetches official flood/action stages for one NWS gauge by LID.
 * Returns null on any error (never throws) so a backfill can continue.
 *
 * The NWPS gauge document exposes flood categories under `flood.categories`
 * (action/minor/moderate/major → { stage, flow }). We read defensively because
 * the schema varies by gauge (some fields are absent).
 */
export async function fetchNwpsFloodStages(lid: string): Promise<NwpsFloodStages | null> {
  const url = `${NWPS_BASE}/${encodeURIComponent(lid)}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
      next: { revalidate: 86400 }, // stages change rarely; cache a day
    });
    if (!res.ok) {
      console.warn(`[NWPS] ${lid}: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const flood = (data.flood ?? {}) as Record<string, unknown>;
    const cats = (flood.categories ?? {}) as Record<string, { stage?: unknown }>;

    return {
      lid,
      actionStageFt: toStage(cats.action?.stage),
      floodStageFt: toStage(cats.minor?.stage) ?? toStage(flood.stage),
      moderateStageFt: toStage(cats.moderate?.stage),
      majorStageFt: toStage(cats.major?.stage),
      usgsSiteId:
        (typeof data.usgsId === 'string' && data.usgsId) ||
        (typeof (data as { usgs_id?: string }).usgs_id === 'string' && (data as { usgs_id?: string }).usgs_id) ||
        null,
    };
  } catch (e) {
    console.error(`[NWPS] ${lid}: fetch failed`, e);
    return null;
  }
}

/**
 * Auto-discover the USGS-site → NWS-LID mapping from NWPS itself: query all NWPS
 * gauges in a Missouri bounding box and index them by the `usgsId` each record
 * carries. This replaces hand-guessed LIDs entirely — every mapping comes from
 * NWPS's own cross-reference, so it can't be wrong the way a guessed LID can.
 * Returns an empty map on error (callers fall back to USGS_TO_NWS_LID).
 */
export async function fetchNwpsLidMap(): Promise<Record<string, string>> {
  // Missouri bbox with margin (covers all Ozark float-river gauges).
  const params = new URLSearchParams({
    'bbox.xmin': '-95.9',
    'bbox.ymin': '35.8',
    'bbox.xmax': '-89.0',
    'bbox.ymax': '40.7',
    srid: 'EPSG_4326',
  });
  const url = `${NWPS_BASE}?${params.toString()}`;
  const map: Record<string, string> = {};
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[NWPS] gauge list: HTTP ${res.status}`);
      return map;
    }
    const data = (await res.json()) as { gauges?: Array<Record<string, unknown>> };
    for (const g of data.gauges ?? []) {
      const lid = typeof g.lid === 'string' ? g.lid : null;
      const usgs =
        (typeof g.usgsId === 'string' && g.usgsId) ||
        (typeof (g as { usgs_id?: string }).usgs_id === 'string' && (g as { usgs_id?: string }).usgs_id) ||
        null;
      if (lid && usgs) map[usgs] = lid;
    }
  } catch (e) {
    console.error('[NWPS] gauge list fetch failed', e);
  }
  return map;
}

/**
 * Fallback USGS-site → NWS-LID mapping, used only if auto-discovery fails.
 * Only Van Buren is independently confirmed; the per-gauge cross-check in the
 * backfill script rejects any entry whose NWPS record reports a different USGS id.
 */
export const USGS_TO_NWS_LID: Record<string, string> = {
  '07067000': 'VBNM7', // Current River at Van Buren (confirmed)
};
