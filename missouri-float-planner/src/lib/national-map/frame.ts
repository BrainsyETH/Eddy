// src/lib/national-map/frame.ts
// One recorded FRAME of national conditions: every in-scope USGS gauge's latest
// observation plus every NWS forecast point's official flood status, captured
// together at one instant.
//
// ── Why frames ──────────────────────────────────────────────────────────────
// gauge_latest is overwritten in place every 15 minutes (sync-gauge-latest) and
// gauge_readings only holds the ~46 curated stations — on purpose; 00196 sized
// full national history at ~40 GB a year. So nothing nationally could answer
// "what was this gauge yesterday", which a Change view and replay both need.
// A frame is the compact answer: ~1 MB of JSON per capture, kept on a thinning
// schedule (see retention below), so a week of national history is ~250 rows.
//
// The same frame is what the browser draws. One coherent, versioned document
// per capture means every browser sees the same instant, and history is the
// same format as now — replay is "draw an older frame", not a second pipeline.
//
// ── What a frame refuses to be ──────────────────────────────────────────────
//   * Not positions. Station coordinates and names change weekly at most; they
//     ride in the station catalog (/api/river-map/stations), not 250 times over.
//     NWS points DO carry coordinates here, because an unmatched NWS point has
//     no catalog row to borrow them from.
//   * Not judgments. Percentiles are stored raw and the reader decides whether
//     a reading was fresh enough to grade AT THE FRAME'S OWN TIME — a recorded
//     frame replayed next week must not suddenly look stale, or fresh.
//
// Pure: the recorder cron, the frame route and the browser decoder share it.

import { FLOOD_CODE, floodStatusFromCode, type FloodStatus } from './flood-status';
import { floodRowCategory, regionCountKey, type RegionCounts } from './trend';

/** Bump on any tuple change. Recorded frames keep their version; decoders branch on it. */
export const FRAME_VERSION = 1;

/**
 * USGS gauge tuple:
 * [siteId, dischargeCfs, gaugeHeightFt, observedEpochSeconds, suspect (0|1), flowPercentile]
 */
export type FrameGaugeRow = [
  string,
  number | null,
  number | null,
  number | null,
  0 | 1,
  number | null,
];

/**
 * NWS forecast-point tuple:
 * [lid, lng, lat, observedStatusCode, observedEpochSeconds, observedValue,
 *  units, forecastStatusCode, forecastValidEpochSeconds, forecastIssuedEpochSeconds,
 *  usgsSiteId | null, name]
 *
 * `name` is '' for a matched point — it is named as its USGS gauge.
 * An optional 13th element carries NOAA's state for an UNMATCHED point (a
 * matched one takes its USGS gauge's state), so regions can claim it.
 * `usgsSiteId` is the crosswalk: gauge_stations.nws_lid. A matched point is the
 * SAME physical gauge as that USGS site and is drawn once, as the USGS gauge.
 */
export type FrameNwsRow = [
  string,
  number,
  number,
  number,
  number | null,
  number | null,
  string | null,
  number,
  number | null,
  number | null,
  string | null,
  string,
  string?,
];

export interface FrameSources {
  /** Newest gauge_latest.fetched_at in the frame — when Eddy last obtained USGS data. */
  usgsFetchedAt: string | null;
  /** NOAA's own ingest time for the observed layer, when the layer reports it. */
  noaaObservedIngestAt: string | null;
  noaaForecastIngestAt: string | null;
  /** False when NOAA could not be read this capture; `n` is then empty, not "no floods". */
  noaaOk: boolean;
}

export interface NationalFrame {
  v: typeof FRAME_VERSION;
  capturedAt: string;
  sources: FrameSources;
  /**
   * NWS points in [major, moderate, minor, action] at capture, counted with the
   * map's rules (trend.ts). Absent when NOAA could not be read, and on frames
   * recorded before it existed. Stored so the 24 h trend reads four numbers
   * per frame instead of the ~1.1 MB `n` array.
   */
  fc?: [number, number, number, number];
  /**
   * The same count per region, regions with any count only: state codes
   * ('MO') and USGS water-resources regions ('huc05'). A gauge counts in its
   * USGS state and HUC; a point no gauge claims, in NOAA's state. Absent on
   * frames recorded before it existed (the regional trend leaves those out).
   */
  fcr?: RegionCounts;
  g: FrameGaugeRow[];
  n: FrameNwsRow[];
}

// ── Building ────────────────────────────────────────────────────────────────

export interface LatestInput {
  siteId: string;
  dischargeCfs: number | null;
  gaugeHeightFt: number | null;
  readingTimestamp: string | null;
  suspect: boolean;
  flowPercentile: number | null;
  fetchedAt: string | null;
}

export interface NwsInput {
  lid: string;
  lng: number;
  lat: number;
  observed: FloodStatus;
  observedAt: number | null;
  observedValue: number | null;
  units: string | null;
  forecast: FloodStatus;
  forecastValidAt: number | null;
  forecastIssuedAt: number | null;
  name: string;
  /** NOAA's state for the point (postal code), when it reports one. */
  state?: string | null;
}

function round(value: number | null, places: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/**
 * Assemble a frame. `lidToSite` is the crosswalk (nws_lid → USGS site id);
 * `inScope` decides membership (territories are excluded at the map boundary).
 */
export function buildFrame(args: {
  capturedAt: Date;
  latest: LatestInput[];
  nws: NwsInput[];
  lidToSite: Map<string, string>;
  noaaOk: boolean;
  noaaObservedIngestAt?: string | null;
  noaaForecastIngestAt?: string | null;
  /** USGS site → its state and 2-digit HUC (the regions a matched point counts in). */
  siteRegions?: Map<string, { state: string | null; huc2: string | null }>;
}): NationalFrame {
  const g: FrameGaugeRow[] = [];
  const seen = new Set<string>();
  let newestFetch = -Infinity;
  for (const row of args.latest) {
    if (!/^\d{8,15}$/.test(row.siteId) || seen.has(row.siteId)) continue;
    seen.add(row.siteId);
    const t = row.readingTimestamp ? Date.parse(row.readingTimestamp) : NaN;
    const f = row.fetchedAt ? Date.parse(row.fetchedAt) : NaN;
    if (Number.isFinite(f) && f > newestFetch) newestFetch = f;
    const pct =
      row.flowPercentile !== null && Number.isFinite(row.flowPercentile)
        ? Math.max(0, Math.min(100, Math.round(row.flowPercentile)))
        : null;
    g.push([
      row.siteId,
      round(row.dischargeCfs, 1),
      round(row.gaugeHeightFt, 2),
      Number.isFinite(t) ? Math.floor(t / 1000) : null,
      row.suspect ? 1 : 0,
      pct,
    ]);
  }

  const n: FrameNwsRow[] = [];
  const lids = new Set<string>();
  for (const row of args.nws) {
    const lid = row.lid.trim().toUpperCase();
    if (!lid || lids.has(lid)) continue;
    if (!Number.isFinite(row.lng) || !Number.isFinite(row.lat)) continue;
    lids.add(lid);
    const site = args.lidToSite.get(lid) ?? null;
    const matched = !!site && seen.has(site);
    const tuple: FrameNwsRow = [
      lid,
      round(row.lng, 4)!,
      round(row.lat, 4)!,
      FLOOD_CODE[row.observed],
      row.observedAt,
      round(row.observedValue, 2),
      row.units,
      FLOOD_CODE[row.forecast],
      row.forecastValidAt,
      row.forecastIssuedAt,
      site && seen.has(site) ? site : null,
      // A matched point is drawn and named as its USGS gauge (the catalog
      // carries that name), so only unmatched points spend bytes on a name —
      // names were ~40% of the NWS payload when every row carried one.
      site && seen.has(site) ? '' : row.name,
    ];
    if (!matched && row.state) tuple.push(row.state);
    n.push(tuple);
  }

  // Flood counts at capture, national and per region (trend.ts rules).
  const capturedMs = args.capturedAt.getTime();
  const fc: [number, number, number, number] = [0, 0, 0, 0];
  const fcr: RegionCounts = {};
  if (args.noaaOk) {
    const slot = { major: 0, moderate: 1, minor: 2, action: 3 } as const;
    for (const row of n) {
      const cat = floodRowCategory(capturedMs, row);
      if (!cat) continue;
      const k = slot[cat];
      fc[k]++;
      const usgs = row[10] && seen.has(row[10]) ? row[10] : null;
      const regions = usgs ? args.siteRegions?.get(usgs) : undefined;
      const state = usgs ? (regions?.state ?? null) : (row[12] ?? null);
      const keys = [state ? regionCountKey('state', state) : null, regions?.huc2 ? regionCountKey('basin', regions.huc2) : null];
      for (const key of keys) {
        if (!key) continue;
        (fcr[key] ??= [0, 0, 0, 0])[k]++;
      }
    }
  }

  return {
    v: FRAME_VERSION,
    capturedAt: args.capturedAt.toISOString(),
    sources: {
      usgsFetchedAt: Number.isFinite(newestFetch) ? new Date(newestFetch).toISOString() : null,
      noaaObservedIngestAt: args.noaaObservedIngestAt ?? null,
      noaaForecastIngestAt: args.noaaForecastIngestAt ?? null,
      noaaOk: args.noaaOk,
    },
    ...(args.noaaOk ? { fc, fcr } : {}),
    g,
    n,
  };
}

// ── Decoding (browser) ─────────────────────────────────────────────────────

export interface DecodedGaugeReading {
  siteId: string;
  dischargeCfs: number | null;
  gaugeHeightFt: number | null;
  /** Epoch ms of the observation, or null. */
  observedAt: number | null;
  suspect: boolean;
  /** Raw stored percentile — gate it with flow eligibility before painting. */
  flowPercentile: number | null;
}

export interface DecodedNwsPoint {
  lid: string;
  lng: number;
  lat: number;
  observed: FloodStatus;
  observedAt: number | null;
  observedValue: number | null;
  units: string | null;
  forecast: FloodStatus;
  forecastValidAt: number | null;
  forecastIssuedAt: number | null;
  usgsSiteId: string | null;
  name: string;
  /** NOAA's state, carried only for a point no USGS gauge claims. */
  state: string | null;
}

export interface DecodedFrame {
  capturedAt: number;
  sources: FrameSources;
  gauges: Map<string, DecodedGaugeReading>;
  nws: DecodedNwsPoint[];
  /** USGS site → its matched NWS point (one identity, drawn once). */
  nwsBySite: Map<string, DecodedNwsPoint>;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * Decode a frame body. Throws on a version or shape it does not understand —
 * an unreadable frame must keep the previous one on screen, never become an
 * empty country.
 */
export function decodeFrame(body: unknown): DecodedFrame {
  if (!body || typeof body !== 'object') throw new Error('Frame is not an object');
  const b = body as Partial<NationalFrame>;
  if (b.v !== FRAME_VERSION) throw new Error(`Unsupported frame version ${String(b.v)}`);
  if (!Array.isArray(b.g) || !Array.isArray(b.n) || typeof b.capturedAt !== 'string') {
    throw new Error('Frame is missing its rows');
  }
  const capturedAt = Date.parse(b.capturedAt);
  if (!Number.isFinite(capturedAt)) throw new Error('Frame has no capture time');

  const gauges = new Map<string, DecodedGaugeReading>();
  for (const r of b.g as unknown[]) {
    if (!Array.isArray(r) || typeof r[0] !== 'string') continue;
    const epoch = num(r[3]);
    gauges.set(r[0], {
      siteId: r[0],
      dischargeCfs: num(r[1]),
      gaugeHeightFt: num(r[2]),
      observedAt: epoch === null ? null : epoch * 1000,
      suspect: r[4] === 1,
      flowPercentile: num(r[5]),
    });
  }

  const nws: DecodedNwsPoint[] = [];
  const nwsBySite = new Map<string, DecodedNwsPoint>();
  for (const r of b.n as unknown[]) {
    if (!Array.isArray(r) || typeof r[0] !== 'string') continue;
    const lng = num(r[1]);
    const lat = num(r[2]);
    if (lng === null || lat === null) continue;
    const obsAt = num(r[4]);
    const fcstAt = num(r[8]);
    const issued = num(r[9]);
    const point: DecodedNwsPoint = {
      lid: r[0],
      lng,
      lat,
      observed: floodStatusFromCode(r[3]),
      observedAt: obsAt === null ? null : obsAt * 1000,
      observedValue: num(r[5]),
      units: str(r[6]),
      forecast: floodStatusFromCode(r[7]),
      forecastValidAt: fcstAt === null ? null : fcstAt * 1000,
      forecastIssuedAt: issued === null ? null : issued * 1000,
      usgsSiteId: str(r[10]),
      name: str(r[11]) ?? r[0],
      state: typeof r[12] === 'string' && /^[A-Z]{2}$/.test(r[12]) ? r[12] : null,
    };
    nws.push(point);
    if (point.usgsSiteId && gauges.has(point.usgsSiteId)) nwsBySite.set(point.usgsSiteId, point);
  }

  const s = (b.sources ?? {}) as Partial<FrameSources>;
  return {
    capturedAt,
    sources: {
      usgsFetchedAt: str(s.usgsFetchedAt),
      noaaObservedIngestAt: str(s.noaaObservedIngestAt),
      noaaForecastIngestAt: str(s.noaaForecastIngestAt),
      noaaOk: s.noaaOk === true,
    },
    gauges,
    nws,
    nwsBySite,
  };
}

// ── Retention ───────────────────────────────────────────────────────────────
// Every capture is kept for a day (the 24-hour Change comparison needs a frame
// near now-24h, and 15-minute spacing gives it ±8 minutes). After that, one
// frame per UTC hour is kept for seven more days (seven-day replay), and
// everything older is deleted. ~96 + ~168 ≈ 264 rows at steady state.

export const KEEP_ALL_HOURS = 26;
export const KEEP_HOURLY_DAYS = 8;

/** The UTC hour a capture belongs to, as an ISO string — the hourly-keeper key. */
export function captureHour(at: Date): string {
  const h = new Date(at);
  h.setUTCMinutes(0, 0, 0);
  return h.toISOString();
}

export function retentionCutoffs(now: Date): { thinBefore: string; deleteBefore: string } {
  return {
    thinBefore: new Date(now.getTime() - KEEP_ALL_HOURS * 3_600_000).toISOString(),
    deleteBefore: new Date(now.getTime() - KEEP_HOURLY_DAYS * 86_400_000).toISOString(),
  };
}
