// eddy-ios/src/lib/gaugeFlow.ts
// What a REFERENCE gauge is showing — the uncurated half of the map.
//
// A SIBLING of gaugeCondition.ts, not a mode of it. gaugeCondition takes a
// MapGauge and answers a floatability verdict by running the river's own rated
// ladder; there are 46 gauges that can do that. This takes a MapGaugeLite and
// answers how the reading compares to that site's own history, which any of the
// ~14,000 national gauges can do — and which is never a verdict.
//
// The same reasoning GaugeRow's header gives for being a sibling of RiverRow
// applies here: folding them into one function with a branch would put the
// verdict path one missing `if` away from an unrated creek.

import type { MapGaugeLite } from '@eddy/types';
import { flowBand, type FlowBand } from '@eddy/conditions/flow-band';
import { formatReading } from '@/lib/readingCopy';

export type { FlowBand };

/**
 * The gauge's flow band, or null when there is nothing to compare against.
 *
 * Null in two cases, and both must render as "no comparison" rather than as a
 * middle-of-the-road normal:
 *
 *   • NO STATISTICS. Most national gauges have no day-of-year snapshot, and a
 *     station commissioned last year has no history to snapshot. flowPercentile
 *     comes back null and stays null.
 *
 *   • A SUSPECT READING. USGS qualifier codes flag ice-affected, estimated and
 *     sensor-fault values. Those numbers are real enough to print beside a
 *     caveat and nowhere near real enough to rank against thirty years of
 *     record — the identical rule gaugeCondition.ts applies before it will
 *     colour a curated pin.
 */
export function flowBandFor(gauge: MapGaugeLite): FlowBand | null {
  if (gauge.readingSuspect) return null;
  return flowBand(gauge.flowPercentile);
}

/**
 * The reading, formatted, preferring discharge.
 *
 * The opposite preference to gaugeReadingText() for curated gauges, and
 * deliberately so. There, the unit is dictated by the ladder the river is rated
 * in — showing cfs against a ft ladder produces a number that does not match
 * the colour beside it. Here there is no ladder, so nothing is dictated, and
 * discharge is the better default: it is what the percentile is computed from,
 * so the number and the band describe the same quantity.
 */
export function flowReadingText(gauge: MapGaugeLite): string | null {
  if (gauge.dischargeCfs != null) return formatReading(gauge.dischargeCfs, 'cfs');
  if (gauge.gaugeHeightFt != null) return formatReading(gauge.gaugeHeightFt, 'ft');
  return null;
}

/**
 * Magnitude for the pin radius, or null.
 *
 * sqrt because discharge spans five orders of magnitude between a creek and the
 * Mississippi, and a linear radius would render every creek in the country as
 * an invisible dot next to one enormous circle. Lifted from the observatory's
 * encoding table (docs/mo-surface-water-observatory.md), which sizes its
 * context nodes the same way.
 *
 * Size carries magnitude, never a verdict — a big dot means a lot of water, not
 * a dangerous river.
 */
export function flowMagnitude(gauge: MapGaugeLite): number | null {
  if (gauge.dischargeCfs == null || gauge.dischargeCfs < 0) return null;
  return Math.sqrt(gauge.dischargeCfs);
}
