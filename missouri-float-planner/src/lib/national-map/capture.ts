// src/lib/national-map/capture.ts
// Capture one national frame from the database and NOAA — the work shared by
// the recorder cron (which stores it) and the frame route's first-deploy
// bootstrap (which serves it live, unstored, until the first recorded frame
// exists).
//
// Failure rules (unchanged from the recorder): a USGS read that comes back
// implausibly small throws — recording or serving it would claim most of the
// country vanished. A NOAA failure does not throw: the frame carries
// noaaOk=false and no NWS points, which the map presents as "flood status
// unavailable", never as "no flooding".

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { buildFrame, type NationalFrame, type NwsInput } from './frame';
import { fetchNoaaFloodStatus } from './noaa-flood';
import { crosswalk, loadLatestForStations, loadNationalStations } from './station-source';

/** Production holds ~14,000 latest rows; a few hundred is a broken read. */
export const MIN_PLAUSIBLE_LATEST = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export interface Capture {
  frame: NationalFrame;
  stations: number;
  noaaOk: boolean;
}

export async function captureFrame(supabase: Client, capturedAt = new Date()): Promise<Capture> {
  const stations = await loadNationalStations(supabase);
  const latest = await loadLatestForStations(supabase, stations);
  if (latest.length < MIN_PLAUSIBLE_LATEST) {
    throw new Error(`gauge_latest returned only ${latest.length} in-scope rows`);
  }

  let nws: NwsInput[] = [];
  let noaaOk = false;
  let observedIngestAt: string | null = null;
  let forecastIngestAt: string | null = null;
  try {
    const noaa = await fetchNoaaFloodStatus();
    nws = noaa.points;
    observedIngestAt = noaa.observedIngestAt;
    forecastIngestAt = noaa.forecastIngestAt;
    noaaOk = true;
  } catch (err) {
    logger.error('[national-map] NOAA read failed', { err });
  }

  const frame = buildFrame({
    capturedAt,
    latest,
    nws,
    lidToSite: crosswalk(stations),
    noaaOk,
    noaaObservedIngestAt: observedIngestAt,
    noaaForecastIngestAt: forecastIngestAt,
  });
  return { frame, stations: stations.length, noaaOk };
}
