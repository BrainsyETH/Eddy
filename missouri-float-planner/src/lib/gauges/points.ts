// src/lib/gauges/points.ts
// The national gauge INDEX: every station, compactly, for a zoomed-out map.
//
// ── Why this exists alongside /api/gauges/map ──────────────────────────────
// /api/gauges/map answers a viewport, caps at 1,000 rows and is ordered by
// discharge, so the phone refuses to ask it anything below the zoom floor —
// a continental box would drop most of the country's creeks. That left the
// "Other USGS gauges" layer empty whenever the map was zoomed out, which is
// exactly the view every other gauge app fills with clustered counts.
//
// This is the other half of that pattern: one uncapped, CDN-cached answer that
// holds every station's position and enough of its latest reading to colour
// and filter a dot. The phone clusters it on-device (Mapbox's supercluster) and
// hands back to the viewport route once the camera is close enough to want
// names. No name, no uuid — a row is ~50 bytes instead of ~350, which is what
// makes 14,000 of them one reasonable request.
//
// Pure: the route loads rows and calls buildGaugePoints; the test suite runs
// this directly. The phone's decoder is decodeGaugePoints in @eddy/types, and
// the tuple order below is a wire format shared with it by hand — Vercel cannot
// resolve packages/, the same reason /api/gauges/map declares its own types.

import { gaugeFreshness } from '@shared/gauge-freshness';
import { classifyQualifiers } from '@/lib/usgs/gauges';
import { toNum } from '@/lib/utils/num';

/** Bump when the tuple changes; the phone ignores a version it does not know. */
export const GAUGE_POINTS_VERSION = 1;

/**
 * [siteId, lng, lat, dischargeCfs, gaugeHeightFt, readingEpochSeconds,
 *  suspect (0|1), flowPercentile]
 *
 * flowPercentile is already nulled for a reading that is not live or is
 * suspect — the identical rule /api/gauges/map applies — so the phone cannot
 * colour a dot the viewport route would have left neutral.
 */
export type GaugePointRow = [
  string,
  number,
  number,
  number | null,
  number | null,
  number | null,
  0 | 1,
  number | null,
];

export interface GaugePointsResponse {
  v: typeof GAUGE_POINTS_VERSION;
  generatedAt: string;
  rows: GaugePointRow[];
}

/** One row of the gauge_points RPC. */
export interface StationPointRow {
  id: string;
  site_id: string | null;
  curated: boolean;
  lng: number | null;
  lat: number | null;
}

/** One row of gauge_latest, as PostgREST returns it (NUMERIC as strings). */
export interface LatestPointRow {
  gauge_station_id: string;
  discharge_cfs: number | string | null;
  gauge_height_ft: number | string | null;
  reading_timestamp: string | null;
  qualifiers: string[] | null;
  flow_percentile: number | null;
}

function round(value: number | null, places: number): number | null {
  if (value === null) return null;
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/**
 * The index body.
 *
 * Curated stations are LEFT OUT: the phone drops them from this layer anyway
 * (the rated layer already paints them with a verdict), so shipping them would
 * be bytes nobody draws. A station with no latest reading is left out too —
 * gauges_in_bbox inner-joins gauge_latest, and the two tiers should agree
 * about which stations exist.
 */
export function buildGaugePoints(
  stations: StationPointRow[],
  latest: LatestPointRow[],
  now = Date.now(),
): GaugePointsResponse {
  const byStation = new Map(latest.map((row) => [row.gauge_station_id, row]));
  const rows: GaugePointRow[] = [];

  for (const station of stations) {
    if (station.curated || !station.site_id) continue;
    if (station.lng === null || station.lat === null) continue;
    if (!Number.isFinite(station.lng) || !Number.isFinite(station.lat)) continue;
    const reading = byStation.get(station.id);
    if (!reading) continue;

    const { suspect } = classifyQualifiers(reading.qualifiers);
    const time = reading.reading_timestamp ? Date.parse(reading.reading_timestamp) : NaN;
    const live = gaugeFreshness(reading.reading_timestamp, now) === 'live';

    rows.push([
      station.site_id,
      // ~11 m. A dot at continental zoom does not need a survey marker.
      round(station.lng, 4)!,
      round(station.lat, 4)!,
      round(toNum(reading.discharge_cfs), 1),
      round(toNum(reading.gauge_height_ft), 2),
      Number.isFinite(time) ? Math.floor(time / 1000) : null,
      suspect ? 1 : 0,
      live && !suspect ? reading.flow_percentile : null,
    ]);
  }

  return { v: GAUGE_POINTS_VERSION, generatedAt: new Date(now).toISOString(), rows };
}
