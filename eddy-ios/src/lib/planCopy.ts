// eddy-ios/src/lib/planCopy.ts
// How a float time is SAID on the phone — the headline, the line under it,
// and the share message — from the one set of numbers the server sent.
//
// ── Why one module ──────────────────────────────────────────────────────────
// Three surfaces word the same float time: the plan card, the share sheet and
// the saved-float screen. They disagreed. The card printed the ceiling ("Up to
// ~4 hours"), the share sheet printed the server's range ("~2 hours 30 minutes
// – ~4 hours"), and the saved-float share dropped the time entirely — so the
// buddy who was sent the plan read a different number from the person who
// sent it. Every surface now asks here.
//
// ── Pace ────────────────────────────────────────────────────────────────────
// The server sends two paces when it can (paceEstimates): the standard range
// the app has always shown, and a fishing pace that starts where the relaxed
// float ends and runs to 2.5× moving time. The choice is a client toggle with
// no refetch. Older servers, and saved floats read back through one, send only
// `timeRange`; those fall back to the standard ceiling and the toggle hides.

import type { FloatPlan } from '@eddy/types';
import { formatFloatTimeCeiling } from '@eddy/conditions/float-time-format';
import { RELEASE_HOW_ROW, releaseCaveat } from '@eddy/conditions/float-time-caveat';

export type FloatPace = 'standard' | 'fishing';

export const PACE_LABEL: Record<FloatPace, string> = {
  standard: 'Paddling',
  fishing: 'Fishing',
};

type FloatTime = NonNullable<FloatPlan['floatTime']>;

/** True when the server sent both paces and the toggle has something to switch. */
export function hasPaceEstimates(floatTime: FloatTime | null | undefined): boolean {
  return Boolean(floatTime?.paceEstimates?.standard && floatTime?.paceEstimates?.fishing);
}

/** The long end of the chosen pace, in minutes, or null when there is no time. */
export function floatTimeCeilingMinutes(
  floatTime: FloatTime | null | undefined,
  pace: FloatPace = 'standard',
): number | null {
  if (!floatTime) return null;
  const paced = floatTime.paceEstimates?.[pace];
  if (paced) return paced.ceilingMinutes;
  if (floatTime.timeRange) return floatTime.timeRange.max;
  return null;
}

/** "Up to ~4 hours", for the chosen pace — the same string on every surface. */
export function floatTimeHeadline(
  floatTime: FloatTime | null | undefined,
  pace: FloatPace = 'standard',
): string | null {
  if (!floatTime) return null;
  const ceiling = floatTimeCeilingMinutes(floatTime, pace);
  return ceiling != null ? formatFloatTimeCeiling(ceiling) : floatTime.formatted;
}

/**
 * The line under the headline: what the number assumed.
 *
 * Built from `assumptions` when the server sent them — the boat, the pace, the
 * speed in today's water, whether stops are in — and falls back to the old
 * constant sentence when it did not. Never mentions the model by name: "flow
 * model" is ours, "at 2.1 mph in today's water" is the reader's.
 */
export function floatTimeBasis(
  floatTime: FloatTime | null | undefined,
  pace: FloatPace = 'standard',
): string {
  if (!floatTime) return '';
  const a = floatTime.assumptions;
  if (!a) return 'Estimated at an average pace';

  const boat = a.vessel ? a.vessel.toLowerCase() : 'boat';
  const speed = floatTime.speedMph > 0 ? `≈${floatTime.speedMph.toFixed(1)} mph` : null;
  // `usedLiveDischarge` is true only when the FLOW MODEL ran. A published
  // outfitter time scaled by condition band never read the flow, and saying
  // "in today's water" under it would claim a provenance it does not have.
  const water = a.usedLiveDischarge ? "in today's water" : 'at a typical pace';

  if (pace === 'fishing') {
    return `Fishing pace: a ${boat} with frequent stops and time spent working the water.`;
  }
  if (floatTime.model === 'known') {
    const parts = [`A ${boat}, from a time published for this stretch, adjusted for today's level`];
    if (a.stopsIncluded) parts.push('includes gravel-bar stops');
    return `${parts.join(' · ')}.`;
  }
  const parts = [`A ${boat} ${speed ? `${speed} ` : ''}${water}`];
  if (a.stopsIncluded) parts.push('includes gravel-bar stops');
  return `${parts.join(' · ')}.`;
}

/**
 * The sentence beside a tailwater time, or null. Built by the shared module so
 * the website and chat say the same thing — and so no surface says "built from
 * the current dam release" about a number that read a gauge, or no flow at all.
 */
export function floatTimeReleaseCaveat(floatTime: FloatTime | null | undefined): string | null {
  const a = floatTime?.assumptions;
  if (!floatTime || !a) return null;
  return releaseCaveat({
    releaseDependent: a.releaseDependent,
    model: floatTime.model,
    gaugeName: a.gaugeName ?? null,
  });
}

/** The short form for the How row. */
export { RELEASE_HOW_ROW };

/** The one-line share form, identical to the headline the sender is looking at. */
export function floatTimeShareLabel(plan: FloatPlan, pace: FloatPace = 'standard'): string {
  const headline = floatTimeHeadline(plan.floatTime, pace);
  if (headline) return `${headline}${pace === 'fishing' ? ' (fishing pace)' : ''}`;
  return plan.floatTimeWithheldReason === 'regulated'
    ? 'time depends on dam releases'
    : 'no estimate in this water';
}

/** "Akers → Pulltite on the Current River · 9.9 miles · Up to ~4 hours" */
export function planShareSummary(plan: FloatPlan, pace: FloatPace = 'standard'): string {
  return `${plan.putIn.name} → ${plan.takeOut.name} on the ${plan.river.name} · ${plan.distance.formatted} · ${floatTimeShareLabel(plan, pace)}`;
}

/** Plain words for the model, for the "How this estimate works" section. */
export function floatTimeModelSentence(floatTime: FloatTime): string {
  switch (floatTime.model) {
    case 'known':
      return "Starts from a time outfitters publish for this stretch, adjusted for today's level.";
    case 'flow':
      return "Paddling speed scaled by today's discharge against this gauge's typical flow.";
    case 'band':
      return "Paddling speed set by the condition band; no live discharge was available.";
    default:
      return 'Estimated from distance and a typical paddling speed.';
  }
}
