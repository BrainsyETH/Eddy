// src/lib/social/gauge-thresholds.ts
//
// Resolve a river's PRIMARY gauge thresholds in STAGE FEET for the social
// reels' gauge instrument (which plots gauge_height_ft readings).
//
// Two bugs this replaces (both shipped to live reels):
//   1. Callers queried river_gauges with `.eq('river_id', slug)` — but river_id
//      is a UUID. PostgREST rejected the filter, the error was ignored, and
//      every reel silently fell back to a generic 1.5–4.0 ft "GOOD" band with
//      no high/danger lines — so a HIGH WATER alert could show its 3.0 ft
//      reading sitting inside a green "GOOD" zone.
//   2. After the discharge migration, primary thresholds on CFS gauges are in
//      CFS (threshold_unit='cfs'; e.g. high=600 CFS). Drawing those numbers on
//      a feet bar is nonsense, so unit awareness is mandatory: use the primary
//      levels only when they're in ft; on cfs gauges fall back to the
//      alt_level_* mirror (the ft set) when present.
//
// When no trustworthy ft thresholds exist, every field is undefined — the reel
// then renders an honest level-only instrument instead of an invented band.

/** Stage thresholds are river feet — anything at or above this is CFS (the
 *  smallest CFS thresholds in the data are ~100; the largest flood stages are
 *  ~45 ft). Guards against unit mix-ups no matter what the row claims. */
const MAX_PLAUSIBLE_FT = 60;

export interface FtThresholds {
  optimalMin?: number;
  optimalMax?: number;
  levelHigh?: number;
  levelDangerous?: number;
  /** Primary gauge's station row id (for series/rise queries), if any. */
  gaugeStationId: string | null;
  /** USGS station's human name for the instrument citation. */
  stationLabel?: string;
  /** Unit the PRIMARY threshold ladder is in. 'cfs' gauges classify condition
   *  from discharge, so the reel surfaces flow for them (a shallow-looking stage
   *  can still be moving a lot of water). */
  primaryUnit: 'ft' | 'cfs';
  /** CFS-primary median (p50 = primary level_optimal_min, in cfs) — the "normal"
   *  the reel frames the live discharge against ("N× normal flow"). Undefined for
   *  ft-primary gauges. */
  flowNormalCfs?: number;
}

interface LevelSet {
  optimalMin?: number;
  optimalMax?: number;
  levelHigh?: number;
  levelDangerous?: number;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : undefined;
};

/** A set is usable only if it has at least the optimal band and every present
 *  value is plausibly feet. */
function plausibleFt(set: LevelSet): boolean {
  const values = [set.optimalMin, set.optimalMax, set.levelHigh, set.levelDangerous]
    .filter((v): v is number => v != null);
  if (set.optimalMin == null || set.optimalMax == null) return false;
  return values.every((v) => v > 0 && v < MAX_PLAUSIBLE_FT);
}

/**
 * Load the primary gauge's ft thresholds + station info for a river SLUG.
 * All threshold fields are undefined when nothing trustworthy exists.
 */
export async function loadFtThresholds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  riverSlug: string,
): Promise<FtThresholds> {
  const empty: FtThresholds = { gaugeStationId: null, primaryUnit: 'ft' };

  // river_gauges.river_id is a UUID — resolve through the rivers join so the
  // filter actually executes (a bare .eq('river_id', slug) errors out).
  const { data: gauge, error } = await supabase
    .from('river_gauges')
    .select(
      'level_optimal_min, level_optimal_max, level_high, level_dangerous, threshold_unit, ' +
      'alt_level_optimal_min, alt_level_optimal_max, alt_level_high, alt_level_dangerous, ' +
      'gauge_station_id, rivers!inner(slug), gauge_stations (name, usgs_site_id)',
    )
    .eq('rivers.slug', riverSlug)
    .eq('is_primary', true)
    .maybeSingle();

  if (error || !gauge) {
    if (error) console.warn(`[gauge-thresholds] lookup failed for ${riverSlug}: ${error.message}`);
    return empty;
  }

  const station = Array.isArray(gauge.gauge_stations) ? gauge.gauge_stations[0] : gauge.gauge_stations;
  const unit = (gauge.threshold_unit || 'ft').toLowerCase();
  const primaryUnit: 'ft' | 'cfs' = unit === 'cfs' ? 'cfs' : 'ft';
  const base: FtThresholds = {
    gaugeStationId: gauge.gauge_station_id ?? null,
    stationLabel: station?.name || station?.usgs_site_id || undefined,
    primaryUnit,
    // p50 (median) discharge for cfs gauges — the "normal" the reel frames the
    // live flow against. The primary level_optimal_min holds it in cfs.
    flowNormalCfs: primaryUnit === 'cfs' ? num(gauge.level_optimal_min) : undefined,
  };

  const primary: LevelSet = {
    optimalMin: num(gauge.level_optimal_min),
    optimalMax: num(gauge.level_optimal_max),
    levelHigh: num(gauge.level_high),
    levelDangerous: num(gauge.level_dangerous),
  };
  // CFS-primary gauges classify the CONDITION from discharge, and their ft
  // "mirror" (the pre-migration ft ladder parked in alt_level_*) is stale — it
  // routinely contradicts the cfs-derived condition, e.g. a DANGEROUS Meramec at
  // 1,190 cfs whose 3.2 ft stage reads "good" on the old ft ladder, so the reel
  // drew the reading inside a green GOOD zone. Hand the reel NO ft scale for
  // them: it renders a level-only bar + the "N cfs · X× normal flow" line, which
  // can never argue with the headline. ft-primary gauges keep their real ft
  // ladder (still plausibility-checked). This is the single, unit-driven rule —
  // no per-reading contradiction heuristic that could miss a case.
  if (primaryUnit === 'cfs') return base;
  if (!plausibleFt(primary)) return base;
  return { ...base, ...primary };
}
