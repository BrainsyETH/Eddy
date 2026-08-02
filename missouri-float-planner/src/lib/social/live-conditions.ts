// src/lib/social/live-conditions.ts
// Overlays live gauge-derived condition codes onto eddy_updates rows before
// they flow into captions / composition props. Without this, scheduled posts
// can run with up to ~25 hours of staleness because condition_code is frozen
// when the daily /api/cron/generate-eddy-updates writes the row.
//
// Mirrors the pattern in /api/og/social generateDigestImage — query
// river_gauges for thresholds + primary gauge station, pull the latest
// gauge_readings row per station, run computeCondition, and replace the
// stored condition_code / gauge_height_ft.
//
// The eddy_update's AI-generated text (quote_text, summary_text) is kept
// as-is — re-generating copy is out of scope and needs the Anthropic call
// anyway. Only the condition code + current height move.

import { computeCondition, getFloatabilityClass, type ConditionThresholds } from '@/lib/conditions';
import { toNum } from '@/lib/utils/num';

export interface LiveCondition {
  condition_code: string;
  gauge_height_ft: number | null;
  discharge_cfs: number | null;
  /** Age of the underlying reading in hours (null = no timestamp available). */
  reading_age_hours: number | null;
  /** True when the "live" reading is itself stale (> STALE_READING_HOURS). */
  stale: boolean;
  reading_timestamp: string | null;
  gauge_station_id: string;
  threshold_unit: 'ft' | 'cfs';
  snapshot_id: string;
}

/**
 * A reading older than this isn't "live" — the overlay must not present it
 * (or AI prose written about it) as current. Matches the 6 h accuracy-warning
 * threshold used by the condition RPCs and the plan endpoint.
 */
export const STALE_READING_HOURS = 6;

/**
 * Prose-blanking ceiling for user-facing website surfaces (the river cards and
 * the full report). Readings are refreshed hourly, so anything under a day old
 * still describes essentially the current river; blanking the whole quote for a
 * routine multi-hour gap needlessly drops the reader to the static one-liner.
 * A day-plus gap means a dead gauge, which blanks anyway. Social keeps the
 * stricter 6 h default.
 */
export const WEBSITE_PROSE_STALE_HOURS = 24;

interface RiverGaugeRow {
  rivers: { slug: string } | null;
  gauge_stations: { id: string } | null;
  level_too_low: number | null;
  level_low: number | null;
  level_optimal_min: number | null;
  level_optimal_max: number | null;
  level_high: number | null;
  level_dangerous: number | null;
  threshold_unit: string | null;
}

interface ReadingRow {
  gauge_station_id: string;
  gauge_height_ft: number | null;
  discharge_cfs: number | null;
  reading_timestamp: string | null;
}

/**
 * Build a slug → live condition map from the latest gauge readings. Returns
 * an empty map on any DB error so the caller falls back to whatever the
 * eddy_update row already has (fail open, not closed).
 */
export async function buildLiveConditionsMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Map<string, LiveCondition>> {
  const LOG = '[LiveConditions]';
  const result = new Map<string, LiveCondition>();

  const { data: riverGauges, error: rgError } = await supabase
    .from('river_gauges')
    .select(`
      level_too_low, level_low, level_optimal_min, level_optimal_max,
      level_high, level_dangerous, threshold_unit,
      rivers!inner(slug),
      gauge_stations!inner(id)
    `)
    .eq('is_primary', true);

  if (rgError) {
    console.error(`${LOG} river_gauges query failed:`, rgError.message);
    return result;
  }

  type Thresholds = { thresholds: ConditionThresholds; stationId: string };
  const thresholdMap = new Map<string, Thresholds>();
  for (const rg of (riverGauges || []) as RiverGaugeRow[]) {
    const slug = rg.rivers?.slug;
    const stationId = rg.gauge_stations?.id;
    if (!slug || !stationId) continue;
    thresholdMap.set(slug, {
      stationId,
      thresholds: {
        levelTooLow: rg.level_too_low,
        levelLow: rg.level_low,
        levelOptimalMin: rg.level_optimal_min,
        levelOptimalMax: rg.level_optimal_max,
        levelHigh: rg.level_high,
        levelDangerous: rg.level_dangerous,
        thresholdUnit: (rg.threshold_unit || 'ft') as 'ft' | 'cfs',
      },
    });
  }

  const stationIds = Array.from(thresholdMap.values()).map((t) => t.stationId);
  if (stationIds.length === 0) return result;

  // Latest reading PER station via a DISTINCT ON RPC (migration 00161). The old
  // `.in(stationIds).order(desc)` had no LIMIT and PostgREST caps result sets
  // (~1000 rows); once gauge_readings grew past that for the primary stations,
  // some station's newest reading fell outside the window, so it looked stale
  // and its Eddy prose got blanked. The RPC returns exactly one (newest) row
  // per station, so coverage can't degrade with table size.
  const { data: readings, error: rError } = await supabase.rpc('latest_readings_for_stations', {
    p_station_ids: stationIds,
  });

  if (rError) {
    console.error(`${LOG} latest_readings_for_stations RPC failed:`, rError.message);
    return result;
  }

  const readingByStation = new Map<string, ReadingRow>();
  for (const r of (readings || []) as ReadingRow[]) {
    if (!readingByStation.has(r.gauge_station_id)) readingByStation.set(r.gauge_station_id, r);
  }

  thresholdMap.forEach(({ thresholds, stationId }, slug) => {
    const reading = readingByStation.get(stationId);
    const heightFt = reading?.gauge_height_ft ?? null;
    const dischargeCfs = reading?.discharge_cfs ?? null;
    const ageHours = reading?.reading_timestamp
      ? (Date.now() - new Date(reading.reading_timestamp).getTime()) / (1000 * 60 * 60)
      : null;
    // ── strictUnit: a dead sensor may not be graded against the other unit ──
    //
    // computeCondition's default is a CROSS-UNIT FALLBACK — a gauge with no
    // value in its rated unit is graded against whatever number it does carry.
    // That is a reasonable default for a display call site, which wants to show
    // something. This is not one. What comes out of here decides whether a
    // river's prose is still true and whether the statewide summary is served,
    // and for those "we cannot say" is an answer while a number compared to the
    // wrong ladder is a lie.
    //
    // It has already told one. The Elk River is rated in feet, its stage sensor
    // returned USGS's -999999 no-data sentinel on 27 April and has published
    // nothing since, and the fallback graded its last estimated discharge —
    // 1,720 cfs — against a 6-FOOT flood line and returned 'dangerous'. Every
    // request, for months. That verdict is what withheld the statewide summary
    // from the app's launch screen until the gate learned to ignore stale
    // readings; this stops it being manufactured in the first place.
    //
    // SAME RULE, SAME WORDS as elevatedGauges in /api/high-water, which is the
    // other place a bad grade here becomes a safety claim. The two must not
    // disagree about what a dead sensor means.
    //
    // The river stays IN the map with an 'unknown' verdict rather than being
    // dropped from it, which matters: overlayLiveConditions passes an unmatched
    // row through UNCHANGED, so removing a river here would serve its prose with
    // no live reconciliation at all. 'unknown' is a wildcard for the class
    // comparison and the reading is still aged, so a dead gauge's prose is
    // blanked by proseTooStale exactly as it was.
    const live = computeCondition(heightFt, thresholds, dischargeCfs, { strictUnit: true });
    result.set(slug, {
      condition_code: live.code,
      gauge_height_ft: toNum(heightFt),
      discharge_cfs: toNum(dischargeCfs),
      reading_age_hours: ageHours,
      stale: ageHours == null || ageHours > STALE_READING_HOURS,
      reading_timestamp: reading?.reading_timestamp ?? null,
      gauge_station_id: stationId,
      threshold_unit: thresholds.thresholdUnit || 'ft',
      snapshot_id: `${slug}:${stationId}:${reading?.reading_timestamp ?? 'unavailable'}`,
    });
  });

  return result;
}

export interface OverlayOptions {
  /**
   * When the live condition_code disagrees with the stored one, blank out
   * quote_text / summary_text. The AI prose was written about a different
   * state (e.g. "sweet spot, dialed in" while the gauge has since climbed
   * into high water) and showing it next to the live badge produces the
   * exact contradictions users see in the wild. Defaults to true so every
   * surface presents internally-consistent copy. Pass `false` only if the
   * caller has its own staleness handling.
   */
  clearProseOnConditionChange?: boolean;
  /**
   * Reading-age (hours) beyond which prose is blanked for staleness ALONE
   * (independent of a condition change). Defaults to STALE_READING_HOURS (6),
   * which is right for social posts — a scheduled tweet shouldn't narrate
   * six-hour-old specifics as current. Website surfaces pass a larger value:
   * a reading gap of a few hours shouldn't nuke the whole quote (forecast,
   * safety notes, and float tips stay valid) and drop the reader to the bland
   * static one-liner. A genuinely dead gauge still blanks two ways — via this
   * ceiling, and because a very old reading usually computes a different
   * condition bucket than the morning snapshot (classChanged).
   */
  proseStaleHours?: number;
  /** Optional tag for the diagnostic log line (e.g. 'eddy-updates'). */
  logLabel?: string;
  /**
   * A live map the caller has already built, used instead of querying again.
   *
   * For callers that need the live conditions for something ELSE as well —
   * /api/eddy-updates gates the statewide summary on whether any river has
   * flooded since the summary was written, which is the same data this
   * overlay reads. Without this they would issue the identical query twice
   * per cache miss and, worse, could disagree with each other across the gap
   * between the two reads.
   */
  liveConditions?: Map<string, LiveCondition>;
}

/**
 * Coarse floatability class for a condition code. Prose is blanked only when
 * the live reading moves the river to a DIFFERENT class than the quote was
 * written for — not on every code change.
 *
 * Why: the overlay recomputes the live condition and compares it to the code
 * stored on the morning quote. Blanking on any code difference makes the whole
 * quote (weather, safety, tips) vanish over cosmetic jitter — e.g. a river
 * drifting 'good' → 'low' while both are perfectly floatable, or the overlay's
 * banding disagreeing by one notch with whatever stamped the stored code. Both
 * collapse to the bland static one-liner. Grouping the floatable codes together
 * keeps the quote through that jitter while still blanking on a real,
 * contradictory move (floatable → dangerous, or floatable → too shallow), which
 * is the case the blanking actually exists for. 'unknown' is a wildcard (lost
 * telemetry) and never counts as a class change on its own.
 */
export type LiveOverlaid<T> = T & {
  discharge_cfs: number | null;
  reading_timestamp: string | null;
  snapshot_id: string | null;
};

/**
 * Overlay live gauge-derived conditions onto an array of eddy_update rows.
 * Rows with no matching primary gauge fall through unchanged. Returns a new
 * array; does not mutate inputs.
 */
export async function overlayLiveConditions<
  T extends {
    river_slug: string;
    condition_code: string;
    gauge_height_ft: number | null;
    discharge_cfs?: number | null;
    reading_timestamp?: string | null;
    snapshot_id?: string | null;
    quote_text?: string;
    summary_text?: string | null;
  },
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  updates: T[],
  options: OverlayOptions = {},
): Promise<Array<LiveOverlaid<T>>> {
  if (updates.length === 0) return updates as Array<LiveOverlaid<T>>;
  const {
    clearProseOnConditionChange = true,
    proseStaleHours = STALE_READING_HOURS,
    logLabel,
    liveConditions,
  } = options;
  const liveMap = liveConditions ?? (await buildLiveConditionsMap(supabase));
  if (liveMap.size === 0) return updates.map((u) => ({
    ...u,
    discharge_cfs: u.discharge_cfs ?? null,
    reading_timestamp: u.reading_timestamp ?? null,
    snapshot_id: u.snapshot_id ?? null,
  })); // callers can see that no reconciled snapshot was available
  const blanked: string[] = [];
  const out = updates.map((u) => {
    const live = liveMap.get(u.river_slug);
    if (!live) return {
      ...u,
      discharge_cfs: u.discharge_cfs ?? null,
      reading_timestamp: u.reading_timestamp ?? null,
      snapshot_id: u.snapshot_id ?? null,
    };
    // Blank prose only when the floatability CLASS moves (good↔low is not a
    // class move), not on every condition-code change and not on every reading
    // tick. Blanking on any reading drift dropped nearly every river to the
    // static one-liner within hours of the daily regen, since gauge discharge
    // moves on essentially every reading. Transitions to/from 'unknown' (lost
    // telemetry) don't count — the morning quote stays the best info.
    const storedClass = getFloatabilityClass(u.condition_code);
    const liveClass = getFloatabilityClass(live.condition_code);
    const classChanged =
      storedClass !== 'unknown' && liveClass !== 'unknown' && storedClass !== liveClass;
    // Prose is "too stale" only past the caller's threshold (default 6 h; the
    // website passes 24 h). A missing reading (null age) counts as too stale;
    // but a genuinely dead gauge also computes a different condition, so a class
    // change usually fires first anyway.
    const proseTooStale =
      live.reading_age_hours == null || live.reading_age_hours > proseStaleHours;
    const next: LiveOverlaid<T> = {
      ...u,
      condition_code: live.condition_code,
      gauge_height_ft: live.gauge_height_ft ?? toNum(u.gauge_height_ft),
      discharge_cfs: live.discharge_cfs,
      reading_timestamp: live.reading_timestamp,
      snapshot_id: live.snapshot_id,
    };
    if ((classChanged || proseTooStale) && clearProseOnConditionChange) {
      if ('quote_text' in next) (next as { quote_text?: string }).quote_text = '';
      if ('summary_text' in next) (next as { summary_text?: string | null }).summary_text = null;
      const reason = classChanged
        ? `class ${u.condition_code}→${live.condition_code}`
        : `stale ${live.reading_age_hours == null ? 'no-reading' : live.reading_age_hours.toFixed(1) + 'h'}`;
      blanked.push(`${u.river_slug}(${reason})`);
    }
    return next;
  });
  // One concise line so production logs reveal exactly which rivers dropped to
  // the static fallback and why (condition change vs stale reading).
  if (blanked.length > 0) {
    console.log(
      `[LiveConditions]${logLabel ? ` ${logLabel}` : ''} blanked ${blanked.length}/${updates.length} ` +
      `(proseStaleHours=${proseStaleHours}): ${blanked.join(', ')}`,
    );
  }
  return out;
}
