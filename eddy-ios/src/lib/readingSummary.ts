import { CONDITION_SYSTEM, type ConditionCode } from '@eddy/conditions';
import { flowBand, flowBandSentence } from '@eddy/conditions/flow-band';
import { formatZoneValue, type Zone } from '@eddy/conditions/threshold-zones';
import { formatReading } from './readingCopy';

/** Display copy only: the caller still supplies the canonical condition. */
export function readingSummaryVerdict(code: string, lastKnown = false): string {
  const definition = CONDITION_SYSTEM[code as ConditionCode] ?? CONDITION_SYSTEM.unknown;
  if (lastKnown) return `Last known: ${definition.label}`;
  return code === 'good' ? 'Good to float' : definition.longLabel;
}

/**
 * Seasonal context describes discharge, including beside a stage reading.
 *
 * `dischargeCfs` names the number the comparison is about when the headline is
 * in feet. A map sheet leads an unrated station with its discharge (that is
 * what the pin carries) while the gauge screen leads with stage once NWS
 * stages exist, so the reader tapped "259 cfs" and arrived at "2.54 ft". Both
 * are right; printing the discharge here keeps the number they just read on the
 * screen, beside the comparison that was computed from it.
 */
export function readingSummarySeason(
  percentile: number | null | undefined,
  unit: 'ft' | 'cfs' | null,
  asOf = new Date(),
  dischargeCfs?: number | null,
): string | null {
  const sentence = flowBandSentence(flowBand(percentile));
  if (!sentence) return null;
  let period = 'this time of year';
  if (Number.isFinite(asOf.getTime())) {
    const parts = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Chicago' }).formatToParts(asOf);
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    const month = parts.find((part) => part.type === 'month')?.value;
    period = `${day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late'} ${month}`;
  }
  const summary = sentence.replace('this time of year', period);
  if (unit === 'cfs') return summary;
  const lowered = `${summary.charAt(0).toLowerCase()}${summary.slice(1)}`;
  return dischargeCfs != null && Number.isFinite(dischargeCfs)
    ? `Flow: ${formatReading(dischargeCfs, 'cfs')}, ${lowered}`
    : `Flow: ${lowered}`;
}

/** Label actual band boundaries; never call the first available edge "Low". */
export function readingSummaryScaleLabels(zones: readonly Zone[], unit: 'ft' | 'cfs'): { start: string; end: string } | null {
  if (zones.length < 2) return null;
  const first = zones[0];
  const next = zones[1];
  const last = zones[zones.length - 1];
  const start = first.key === 'too_low' && next.key === 'low'
    ? `Low starts: ${formatZoneValue(next.min, unit)} ${unit}`
    : `${first.label}: ${formatZoneValue(first.min, unit)} ${unit}`;
  return { start, end: `${last.label}: ${formatZoneValue(last.min, unit)}${last.openEnded ? '+' : ''} ${unit}` };
}
