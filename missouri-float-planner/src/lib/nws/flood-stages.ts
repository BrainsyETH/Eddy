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
 * Known USGS-site → NWS-LID mapping for the current gauge set. gauge_stations.nws_lid
 * should be backfilled from this (and extended); NWPS/USGS cross-reference confirms it.
 * Only high-confidence LIDs are listed — leave a gauge out rather than guess a LID.
 */
export const USGS_TO_NWS_LID: Record<string, string> = {
  '07067000': 'VBNM7', // Current River at Van Buren
  '07064533': 'AKRM7', // Current River above Akers (verify)
  '07068000': 'DONM7', // Current River at Doniphan
  '07071500': 'BRDM7', // Eleven Point near Bardley (verify)
  '07018500': 'SULM7', // Meramec near Sullivan (verify)
  '07019000': 'EURM7', // Meramec near Eureka (verify)
  '07017200': 'SVLM7', // Huzzah Creek near Steelville (verify)
  '07065495': 'ASGM7', // Jacks Fork at Alley Spring (verify)
  '06923250': 'WDYM7', // Niangua at Windyville (verify)
  '06930000': 'BPYM7', // Big Piney near Big Piney (verify)
};
