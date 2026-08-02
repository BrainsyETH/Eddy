// src/lib/flow-providers/usgs-historical.ts
// Fetches the USGS gauge reading closest to a specific point in time — used to
// backfill a River Visual photo's gauge height / discharge from when the photo
// was actually taken (EXIF capture time), not when it was uploaded.
//
// Two sources, continuous preferred:
//   - Continuous values: a ±12h window, take the reading nearest the target
//     instant. Carries BOTH gauge height and discharge and serves data years
//     back, so it is tried first for every date.
//   - Daily means: fallback only when continuous has nothing. Coarser (one mean
//     per day) and usually discharge-only — USGS publishes a gauge-height daily
//     mean at some sites and not others (07068000 has one back to 1987;
//     07067000 has none) — so a daily result often has no stage.
//
// EXIF DateTimeOriginal carries no timezone, so callers pass a best-effort
// instant; the continuous window + nearest-match tolerates the offset, and the
// daily path is matched on the calendar date (not the instant) so an evening
// capture doesn't grab the next day's midnight-stamped mean.
//
// Both collections are the MODERN OGC API. This module used to call
// waterservices.usgs.gov directly with its own URL constants and its own copies
// of the validity filters, which is how it survived the first migration of
// ./usgs.ts untouched.

import {
  MODERN_BASE,
  PARAM_DISCHARGE,
  PARAM_GAGE_HEIGHT,
  modernHeaders,
  parseOgcValue,
  toMonitoringLocationId,
  validDischarge,
  validHeight,
  type OgcFeature,
} from './usgs';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Daily mean. Matches statistic_id on the `daily` collection. */
const STAT_DAILY_MEAN = '00003';

export interface UsgsReadingAt {
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  /** The USGS observation timestamp actually used (nearest to the target). */
  observedAt: string | null;
  /** Which USGS collection the value came from. */
  source: 'iv' | 'dv';
}

interface OgcFeatureCollection {
  features?: OgcFeature[];
}

async function fetchOgcFeatures(url: URL): Promise<OgcFeature[] | null> {
  // Historical values never change; cache aggressively.
  const res = await fetch(url.toString(), {
    next: { revalidate: 86400 },
    headers: modernHeaders(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as OgcFeatureCollection;
  return data.features ?? null;
}

/**
 * From a flat list of OGC features (one per site × parameter × timestamp),
 * pick the height and discharge values whose timestamps are nearest the target.
 *
 * ⚠️ The modern collections do NOT return features in chronological order — a
 * `daily` page for 07068000 came back 1944, 1943, 1940. Nothing here may assume
 * ordering, which is why every candidate is compared rather than scanned until
 * a first match.
 */
function pickNearest(
  features: OgcFeature[],
  targetMs: number,
  preferDateStr?: string
): { gaugeHeightFt: number | null; dischargeCfs: number | null; observedAt: string | null } {
  let gaugeHeightFt: number | null = null;
  let dischargeCfs: number | null = null;
  let observedAt: string | null = null;

  // Best candidate per parameter, tracked separately: stage and discharge are
  // reported on their own cadences and the nearest of each may differ.
  const best = new Map<string, { diff: number; value: number; time: string }>();

  for (const feature of features) {
    const props = feature.properties;
    if (!props?.time || !props.parameter_code) continue;

    const value = parseOgcValue(props.value);
    if (isNaN(value)) continue;

    if (props.parameter_code === PARAM_GAGE_HEIGHT) {
      if (!validHeight(value)) continue;
    } else if (props.parameter_code === PARAM_DISCHARGE) {
      if (!validDischarge(value)) continue;
    } else {
      continue;
    }

    // Daily values are stamped as a bare date, so matching by nearest instant
    // grabs an adjacent day for an evening capture. When a target calendar date
    // is given (the daily path), prefer the exact-date value.
    const exactDate = preferDateStr !== undefined && props.time.slice(0, 10) === preferDateStr;
    const parsed = new Date(props.time).getTime();
    if (isNaN(parsed)) continue;
    const diff = exactDate ? 0 : Math.abs(parsed - targetMs);

    const current = best.get(props.parameter_code);
    if (!current || diff < current.diff) {
      best.set(props.parameter_code, { diff, value, time: props.time });
    }
  }

  const height = best.get(PARAM_GAGE_HEIGHT);
  const discharge = best.get(PARAM_DISCHARGE);
  if (height) gaugeHeightFt = height.value;
  if (discharge) dischargeCfs = discharge.value;

  // Report the closest observation timestamp across the parameters used.
  const closest = [height, discharge]
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .sort((a, b) => a.diff - b.diff)[0];
  if (closest) observedAt = closest.time;

  return { gaugeHeightFt, dischargeCfs, observedAt };
}

async function fetchInstantaneousAt(siteId: string, when: Date): Promise<UsgsReadingAt | null> {
  const start = new Date(when.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const end = new Date(when.getTime() + 12 * 60 * 60 * 1000).toISOString();

  const url = new URL(`${MODERN_BASE}/continuous/items`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('monitoring_location_id', toMonitoringLocationId(siteId));
  url.searchParams.set('parameter_code', `${PARAM_GAGE_HEIGHT},${PARAM_DISCHARGE}`);
  url.searchParams.set('datetime', `${start}/${end}`);
  // 24h of ~15-min data across 2 parameters is ~192 points; padded generously
  // because some stations report far more often.
  url.searchParams.set('limit', '2000');

  const features = await fetchOgcFeatures(url);
  if (!features || features.length === 0) return null;

  const { gaugeHeightFt, dischargeCfs, observedAt } = pickNearest(features, when.getTime());
  if (gaugeHeightFt === null && dischargeCfs === null) return null;
  return { gaugeHeightFt, dischargeCfs, observedAt, source: 'iv' };
}

async function fetchDailyMeanAt(siteId: string, when: Date): Promise<UsgsReadingAt | null> {
  // Widen a day on each side to tolerate the timezone-less capture instant,
  // then take the daily-mean value nearest the target.
  const start = new Date(when.getTime() - DAY_MS).toISOString().slice(0, 10);
  const end = new Date(when.getTime() + DAY_MS).toISOString().slice(0, 10);

  const url = new URL(`${MODERN_BASE}/daily/items`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('monitoring_location_id', toMonitoringLocationId(siteId));
  url.searchParams.set('parameter_code', `${PARAM_GAGE_HEIGHT},${PARAM_DISCHARGE}`);
  url.searchParams.set('statistic_id', STAT_DAILY_MEAN);
  url.searchParams.set('datetime', `${start}/${end}`);
  url.searchParams.set('limit', '100');

  const features = await fetchOgcFeatures(url);
  if (!features || features.length === 0) return null;

  const { gaugeHeightFt, dischargeCfs, observedAt } = pickNearest(
    features,
    when.getTime(),
    when.toISOString().slice(0, 10)
  );
  if (gaugeHeightFt === null && dischargeCfs === null) return null;
  return { gaugeHeightFt, dischargeCfs, observedAt, source: 'dv' };
}

/**
 * Best-effort gauge reading for `siteId` nearest `when`. Recent captures use
 * continuous data; older ones fall back to the daily mean. Returns null when
 * USGS has nothing usable (network error, gap in record, ungauged period).
 */
export async function fetchUsgsReadingAt(siteId: string, when: Date): Promise<UsgsReadingAt | null> {
  // Try continuous first for any date. It carries both gauge height and
  // discharge and serves data years back, so it gives the reading at the actual
  // capture time — and, unlike the daily mean, it has stage. Fall back only
  // when continuous returns nothing.
  const iv = await fetchInstantaneousAt(siteId, when).catch(() => null);
  if (iv) return iv;
  return fetchDailyMeanAt(siteId, when).catch(() => null);
}
