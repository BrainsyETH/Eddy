/**
 * The gauges that earned a measured rain-to-crest time, and the only place one
 * is read from.
 *
 * Each range is the result of the locked study in
 * scripts/research/rain-lag-2026-11: two years of NOAA's gauge-corrected rain
 * over the gauge's reviewed watershed against USGS discharge, storm by storm.
 * `crestHours` is how long after the heaviest part of a rain the gauge crested,
 * for the middle eight in ten of the storms that raised it. `storms` is how
 * many storms that is.
 *
 * A gauge is here only because it passed every rule in the study's
 * protocol.json. The other gauges in the study each have a recorded reason for
 * having no range (most: the time varied too much from storm to storm), and
 * nothing may state a lag for them. lag-release.test.ts holds this list to the
 * study's results, entry for entry, so it cannot be edited by hand.
 *
 * A range describes past storms. It is not a forecast for the next one and is
 * not evidence that rain has arrived or passed (docs/noaa-rainfall-plan.md).
 */
export interface MeasuredLag {
  /** Hours from the heaviest rain to the crest: low and high end of the usual range. */
  crestHours: readonly [number, number];
  storms: number;
}

export const RAIN_LAG_STUDY = 'scripts/research/rain-lag-2026-11';

export const RAIN_LAG_RELEASE: Readonly<Record<string, MeasuredLag>> = {
  '06923950': { crestHours: [18, 53], storms: 16 }, // Niangua River at Tunnel Dam near Macks Creek, MO
  '06928000': { crestHours: [27, 70], storms: 21 }, // Gasconade River near Hazelgreen, MO
  '06930000': { crestHours: [21, 46], storms: 16 }, // Big Piney River near Big Piney, MO
  '07037500': { crestHours: [20, 44], storms: 16 }, // St. Francis River near Patterson, MO
  '07052500': { crestHours: [20, 52], storms: 24 }, // James River at Galena, MO
  '07055607': { crestHours: [12, 32], storms: 22 }, // Crooked Creek at Kelly Crossing at Yellville, AR
  '07057500': { crestHours: [15, 37], storms: 10 }, // North Fork River near Tecumseh, MO
  '07064533': { crestHours: [14, 32], storms: 8 }, // Current River above Akers, MO
  '07067000': { crestHours: [17, 52], storms: 10 }, // Current River at Van Buren, MO
  '07069500': { crestHours: [9, 24], storms: 19 }, // Spring River at Imboden, AR
  '07071500': { crestHours: [19, 39], storms: 12 }, // Eleven Point River near Bardley, MO
  '07252000': { crestHours: [12, 34], storms: 22 }, // Mulberry River near Mulberry, AR
};

/** The measured range for a gauge, or null when it has none. */
export function measuredLag(siteId: string | null | undefined): MeasuredLag | null {
  return siteId && Object.hasOwn(RAIN_LAG_RELEASE, siteId) ? RAIN_LAG_RELEASE[siteId] : null;
}
