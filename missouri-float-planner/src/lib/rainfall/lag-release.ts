/**
 * The gauges that earned a measured rain-to-crest time, and the only place one
 * is read from.
 *
 * Each range is the result of the locked study in
 * scripts/research/rain-lag-2026-11: two years of NOAA's gauge-corrected rain
 * over the gauge's reviewed watershed against USGS discharge, storm by storm.
 * `crestHours` is how long the gauge took to crest, counted from the moment
 * half the storm's rain had fallen over the watershed, for the middle eight in
 * ten of the storms that raised it. `storms` is how many storms that is; it is
 * always shown beside the range. `river` and `place` are the words the weather
 * sentence uses for the gauge.
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
  /** Hours from half the storm's rain having fallen to the crest: low and high end of the usual range. */
  crestHours: readonly [number, number];
  /** Storms that raised the river and were timed. Published with the range, always. */
  storms: number;
  /** As written mid-sentence: "the St. Francis", "Crooked Creek". */
  river: string;
  /** Where the gauge is, after the word "flow": "near Patterson". */
  place: string;
}

export const RAIN_LAG_STUDY = 'scripts/research/rain-lag-2026-11';

export const RAIN_LAG_RELEASE: Readonly<Record<string, MeasuredLag>> = {
  '06923950': { crestHours: [18, 53], storms: 16, river: 'the Niangua', place: 'at Tunnel Dam' },
  '06928000': { crestHours: [27, 70], storms: 21, river: 'the Gasconade', place: 'near Hazelgreen' },
  '06930000': { crestHours: [21, 46], storms: 16, river: 'the Big Piney', place: 'near the town of Big Piney' },
  '07037500': { crestHours: [20, 44], storms: 16, river: 'the St. Francis', place: 'near Patterson' },
  '07052500': { crestHours: [20, 52], storms: 24, river: 'the James', place: 'at Galena' },
  '07055607': { crestHours: [12, 32], storms: 22, river: 'Crooked Creek', place: 'at Yellville' },
  '07057500': { crestHours: [15, 37], storms: 10, river: 'the North Fork', place: 'near Tecumseh' },
  '07064533': { crestHours: [14, 32], storms: 8, river: 'the Current', place: 'above Akers' },
  '07067000': { crestHours: [17, 52], storms: 10, river: 'the Current', place: 'at Van Buren' },
  '07069500': { crestHours: [9, 24], storms: 19, river: 'the Spring River', place: 'at Imboden' },
  '07071500': { crestHours: [19, 39], storms: 12, river: 'the Eleven Point', place: 'near Bardley' },
  '07252000': { crestHours: [12, 34], storms: 22, river: 'the Mulberry', place: 'near the town of Mulberry' },
};

/** The measured range for a gauge, or null when it has none. */
export function measuredLag(siteId: string | null | undefined): MeasuredLag | null {
  return siteId && Object.hasOwn(RAIN_LAG_RELEASE, siteId) ? RAIN_LAG_RELEASE[siteId] : null;
}
