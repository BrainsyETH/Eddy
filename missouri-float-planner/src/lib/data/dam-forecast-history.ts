// src/lib/data/dam-forecast-history.ts
// Keeps each distinct forecast Eddy served so its accuracy can be measured
// later against dam_metric_readings. Nothing here is read by a route. See the
// migration 20261012030607_dam_forecast_history.sql and ADR 0013.
//
// ── What counts as "the same forecast" ─────────────────────────────────────
//
// The snapshot cron rebuilds every hour, so the hash must ignore what changes
// hourly without the forecast changing:
//
//   - retrievedAt, on both sources: when Eddy fetched, not what was said.
//   - the START of the first CWMS window. buildForecastWindows slices at now,
//     so the window that is currently running starts at the current hour and
//     moves every rebuild. Its end, state and peak are kept: a change to any of
//     those is a change to the forecast.
//
// The stored payload is the object as served, unmodified.

import { createHash } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import type { DamSnapshot } from '@shared/dam-types';

export type ForecastSource = 'cwms_generation_forecast' | 'swpa_schedule';

export interface ForecastHistoryRow {
  dam_id: string;
  source: ForecastSource;
  content_hash: string;
  payload: unknown;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** One row per source the snapshot actually carries. Pure. */
export function forecastHistoryRows(snapshot: DamSnapshot): ForecastHistoryRow[] {
  const rows: ForecastHistoryRow[] = [];
  const forecast = snapshot.generationForecast;
  if (forecast && forecast.windows.length > 0) {
    const windows = forecast.windows.map((w, i) =>
      i === 0
        ? { endUtc: w.endUtc, generating: w.generating, peakCfs: w.peakCfs }
        : { startUtc: w.startUtc, endUtc: w.endUtc, generating: w.generating, peakCfs: w.peakCfs },
    );
    rows.push({
      dam_id: snapshot.id,
      source: 'cwms_generation_forecast',
      content_hash: hash({ windows, timeZone: forecast.timeZone, source: forecast.source }),
      payload: forecast,
    });
  }
  if (snapshot.schedule.length > 0) {
    const days = snapshot.schedule.map((d) => ({ scheduleDate: d.scheduleDate, hours: d.hours, idle: d.idle }));
    rows.push({
      dam_id: snapshot.id,
      source: 'swpa_schedule',
      content_hash: hash(days),
      payload: snapshot.schedule,
    });
  }
  return rows;
}

/**
 * Record the forecasts in this run's snapshots. Never throws: losing one
 * hour's history must not fail the cron that serves the dam pages.
 */
export async function recordForecastHistory(
  supabase: ReturnType<typeof createAdminClient>,
  snapshots: DamSnapshot[],
  now = Date.now(),
): Promise<{ inserted: number; extended: number } | null> {
  const rows = snapshots.flatMap(forecastHistoryRows);
  if (rows.length === 0) return { inserted: 0, extended: 0 };
  try {
    const { data, error } = await supabase.rpc('record_dam_forecasts', {
      p_rows: rows,
      p_seen_at: new Date(now).toISOString(),
    });
    if (error) throw new Error(error.message);
    return { inserted: Number(data?.inserted ?? 0), extended: Number(data?.extended ?? 0) };
  } catch (err) {
    logger.warn('dam-forecast-history: record failed', {
      error: err instanceof Error ? err.message : String(err),
      rows: rows.length,
    });
    return null;
  }
}
