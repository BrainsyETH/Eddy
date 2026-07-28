// src/lib/alerts/gauge-readings.ts
// The newest reading per station, across BOTH gauge tiers.
//
// ── Why two sources ─────────────────────────────────────────────────────────
//
// 00196 split gauge storage deliberately. The ~46 curated stations append to
// gauge_readings — real history, written hourly by update-gauges and every 15
// minutes when a river is rising fast. The ~16,500 national stations get one
// row each in gauge_latest, overwritten in place by sync-gauge-latest at :20,
// because appending 14,000 rows an hour for readings nobody grades would cost
// ~145M rows a year.
//
// sync-gauge-latest covers every active USGS station, curated ones included, so
// gauge_latest alone would "work" — and would quietly make curated alerts an
// hour slower than the app that shows them, throwing away the 15-minute
// high-frequency polling that exists precisely for rising water. So both are
// read and the newer timestamp wins.
//
// The merge itself is pure and exported, so the tie-breaking is testable
// without a database.

import type { StationReading } from './gauge-threshold';

/** A gauge_latest row, or the newest gauge_readings row, as PostgREST returns it. */
export interface RawReadingRow {
  gauge_station_id: string;
  reading_timestamp: string | null;
  gauge_height_ft: number | string | null;
  discharge_cfs: number | string | null;
  qualifiers?: string[] | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toReading(row: RawReadingRow, provider: string | null): StationReading {
  return {
    gauge_station_id: row.gauge_station_id,
    // numeric(10,2) arrives as a STRING over PostgREST. Left as-is, every
    // comparison in gauge-threshold would be a string comparison, and "9.00"
    // > "10.00" is true.
    gauge_height_ft: toNumber(row.gauge_height_ft),
    discharge_cfs: toNumber(row.discharge_cfs),
    qualifiers: row.qualifiers ?? null,
    reading_at: row.reading_timestamp,
    provider,
  };
}

/**
 * The newer of two readings for the same station.
 *
 * A row with no timestamp loses to one that has it and wins only over nothing:
 * the gate treats a null readingAt as "cannot judge staleness" and lets it
 * through, so preferring an undated row over a dated one would be a way to
 * smuggle stale water past a check that exists to catch it.
 */
export function pickNewerReading(
  a: StationReading | undefined,
  b: StationReading | undefined,
): StationReading | undefined {
  if (!a) return b;
  if (!b) return a;
  if (!a.reading_at) return b.reading_at ? b : a;
  if (!b.reading_at) return a;
  return new Date(b.reading_at).getTime() > new Date(a.reading_at).getTime() ? b : a;
}

/** Fold raw rows from both tiers into one map, newest per station. */
export function mergeReadingRows(
  latest: RawReadingRow[],
  history: RawReadingRow[],
  providerByStation: Map<string, string | null>,
): Map<string, StationReading> {
  const out = new Map<string, StationReading>();
  for (const row of [...latest, ...history]) {
    const reading = toReading(row, providerByStation.get(row.gauge_station_id) ?? null);
    out.set(row.gauge_station_id, pickNewerReading(out.get(row.gauge_station_id), reading)!);
  }
  return out;
}

/** PostgREST caps a response at 1,000 rows, and `.in()` at a sane URL length. */
const CHUNK = 500;

function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Load the newest reading for each station id.
 *
 * Chunked because `.in()` on several hundred uuids builds a URL long enough to
 * be rejected, and because a truncated 1,000-row page would look like "those
 * stations have no reading" — which the evaluator would count as `no_reading`
 * and silently decline to alert on.
 */
export async function loadLatestReadings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  stationIds: string[],
): Promise<Map<string, StationReading>> {
  if (stationIds.length === 0) return new Map();

  const providerByStation = new Map<string, string | null>();
  const curated: string[] = [];

  for (const ids of chunk(stationIds)) {
    const { data } = await supabase
      .from('gauge_stations')
      .select('id, provider, curated')
      .in('id', ids);
    for (const row of data ?? []) {
      providerByStation.set(row.id, row.provider ?? 'usgs');
      if (row.curated) curated.push(row.id);
    }
  }

  const latestRows: RawReadingRow[] = [];
  for (const ids of chunk(stationIds)) {
    const { data } = await supabase
      .from('gauge_latest')
      .select('gauge_station_id, reading_timestamp, gauge_height_ft, discharge_cfs, qualifiers')
      .in('gauge_station_id', ids);
    latestRows.push(...((data ?? []) as RawReadingRow[]));
  }

  // Curated stations only, and one query per station: "newest row per station"
  // has no single-statement form in PostgREST, and the curated set subscribed to
  // is small. Running this over the national tier would be thousands of round
  // trips for rows that do not exist — gauge_readings holds only curated history.
  const historyRows: RawReadingRow[] = [];
  for (const id of curated) {
    const { data } = await supabase
      .from('gauge_readings')
      .select('gauge_station_id, reading_timestamp, gauge_height_ft, discharge_cfs, qualifiers')
      .eq('gauge_station_id', id)
      .order('reading_timestamp', { ascending: false })
      .limit(1);
    if (data?.[0]) historyRows.push(data[0] as RawReadingRow);
  }

  return mergeReadingRows(latestRows, historyRows, providerByStation);
}
