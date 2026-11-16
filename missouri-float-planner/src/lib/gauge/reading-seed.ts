// src/lib/gauge/reading-seed.ts
// The reading the river page puts in its server HTML, so the live report says
// something before (and without) JavaScript: search indexes and AI fetchers
// read that HTML and never run the client query.
//
// A reading in HTML can be copied and kept by anyone who fetched it, so it is
// held to two rules the client query does not need:
//   - it is never older than SEEDED_READING_MAX_AGE_HOURS when the HTML is
//     rendered, and the browser applies the same cutoff again on arrival, in
//     case the HTML itself sat in a cache;
//   - it always carries its observation time as a date, never as "15m ago",
//     which is wrong the moment the HTML is cached.
//
// Pure and shared by the server page and the client report, so both pick the
// same gauges and the same lead reading.

import type { GaugeStation } from '@/app/api/gauges/route';
import { findRiverGroupBySlug, groupGaugesByRiver } from '@/lib/river-groups';
import { sectionGauge, type RiverReportSection } from '@/lib/river-report-sections';
import { ageHoursOf } from '@/lib/utils/reading-age';

/** Older than this, a reading stays out of server HTML. */
export const SEEDED_READING_MAX_AGE_HOURS = 6;

export interface RiverReadingSeed {
  /** This river's gauges, shaped exactly as /api/gauges returns them. */
  gauges: GaugeStation[];
  /**
   * Observation time per gauge id, formatted on the server ("Nov 16, 2026,
   * 4:30 PM CST"). A string rather than a format call in the component: Intl
   * output differs between Node and browsers, and a difference is a hydration
   * error.
   */
  observedAt: Record<string, string>;
}

function hasReading(gauge: GaugeStation): boolean {
  return gauge.readingTimestamp !== null && (gauge.gaugeHeightFt !== null || gauge.dischargeCfs !== null);
}

function withoutReading(gauge: GaugeStation): GaugeStation {
  return {
    ...gauge,
    gaugeHeightFt: null,
    dischargeCfs: null,
    readingTimestamp: null,
    readingAgeHours: null,
    readingSuspect: false,
    qualifierNote: null,
    seasonalContext: null,
  };
}

/**
 * This river's gauges with ages measured at `now` and every reading past the
 * cutoff removed. Null when the gauge the report opens on has no reading left:
 * the report then waits for the live query, as it did before there was a seed.
 */
export function freshRiverGauges(
  gauges: GaugeStation[],
  { riverSlug, sections = [], now }: { riverSlug: string; sections?: RiverReportSection[]; now: number },
): GaugeStation[] | null {
  const riverGauges = gauges
    .filter((gauge) => gauge.thresholds?.some((threshold) => threshold.riverSlug === riverSlug))
    .map((gauge) => {
      const readingAgeHours = ageHoursOf(gauge.readingTimestamp, now);
      if (readingAgeHours === null || readingAgeHours > SEEDED_READING_MAX_AGE_HOURS) return withoutReading(gauge);
      return { ...gauge, readingAgeHours };
    });

  // The same choice RiverGaugeDetail makes for its first render.
  const lead = sections.length > 1
    ? sectionGauge(sections[0], riverGauges)
    : findRiverGroupBySlug(groupGaugesByRiver(riverGauges), riverSlug)?.primaryGauge ?? null;

  return lead && hasReading(lead) ? riverGauges : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 16, 2026, 4:30 PM CST" in the river's own zone; null when unparseable. */
export function formatObservedAt(timestamp: string, timeZone: string): string | null {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${MONTHS[Number(part('month')) - 1]} ${part('day')}, ${part('year')}, ${part('hour')}:${part('minute')} ${part('dayPeriod')} ${part('timeZoneName')}`;
}

/** Server side: the seed for one river page, or null when there is nothing fresh to state. */
export function buildRiverReadingSeed(
  gauges: GaugeStation[],
  options: { riverSlug: string; sections?: RiverReportSection[]; timeZone: string; now: number },
): RiverReadingSeed | null {
  const fresh = freshRiverGauges(gauges, options);
  if (!fresh) return null;
  const observedAt: Record<string, string> = {};
  for (const gauge of fresh) {
    const label = gauge.readingTimestamp ? formatObservedAt(gauge.readingTimestamp, options.timeZone) : null;
    if (label) observedAt[gauge.id] = label;
  }
  return { gauges: fresh, observedAt };
}
