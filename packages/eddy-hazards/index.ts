// packages/eddy-hazards/index.ts
// Presenting hazards: ordering, labels and the one rule that matters.
//
// THE RULE: hazards are free, always, on every surface. Safety information
// behind a paywall is a liability, and it would contradict the same decision
// already made in the alert engine, where `warning` is the one push kind that
// does not require an entitlement (see kindRequiresEntitlement). Nothing in this
// module takes an entitlement, and nothing calling it should either.
//
// Shared rather than app-local because the ordering below is a safety claim, not
// a styling preference — a `danger` low-water dam must not sort under an `info`
// note because someone changed a comparator. The app has no test runner, so this
// lives where it can be tested.

import type { Hazard, HazardSeverity, HazardType } from '../eddy-types/index';

export type { Hazard, HazardSeverity, HazardType };

/**
 * Most dangerous first.
 *
 * Deliberately NOT river-mile order. A paddler scanning this list is asking
 * "what could hurt me", not "what comes next" — mile order buries a low-water
 * dam under six shoals. The mile is still shown on each row.
 */
const SEVERITY_RANK: Record<HazardSeverity, number> = {
  danger: 0,
  warning: 1,
  caution: 2,
  info: 3,
};

export function severityRank(severity: HazardSeverity): number {
  return SEVERITY_RANK[severity] ?? SEVERITY_RANK.info;
}

/** Sorted for display: severity first, then downstream order within a severity. */
export function sortHazards(hazards: Hazard[]): Hazard[] {
  return [...hazards].sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return (a.riverMile ?? 0) - (b.riverMile ?? 0);
  });
}

/**
 * Hazards serious enough to surface before someone launches, as opposed to in a
 * full list they may never scroll to.
 *
 * `portageRequired` is included regardless of severity: being made to carry a
 * boat is a trip-planning fact even when the hazard itself is rated mild.
 */
export function criticalHazards(hazards: Hazard[]): Hazard[] {
  return sortHazards(hazards).filter(
    (h) => h.severity === 'danger' || h.severity === 'warning' || h.portageRequired,
  );
}

const TYPE_LABELS: Record<HazardType, string> = {
  low_water_dam: 'Low-water dam',
  portage: 'Portage',
  strainer: 'Strainer',
  rapid: 'Rapid',
  private_property: 'Private property',
  waterfall: 'Waterfall',
  shoal: 'Shoal',
  bridge_piling: 'Bridge piling',
  other: 'Hazard',
};

export function hazardTypeLabel(type: HazardType | string): string {
  return TYPE_LABELS[type as HazardType] ?? TYPE_LABELS.other;
}

const SEVERITY_LABELS: Record<HazardSeverity, string> = {
  danger: 'Danger',
  warning: 'Warning',
  caution: 'Caution',
  info: 'Note',
};

export function severityLabel(severity: HazardSeverity | string): string {
  return SEVERITY_LABELS[severity as HazardSeverity] ?? SEVERITY_LABELS.info;
}

/**
 * The condition code whose colour a hazard should borrow.
 *
 * Reusing the condition palette rather than inventing a hazard palette keeps the
 * app to ONE colour language for danger — a red low-water dam is the same red as
 * a flooded river, which is what someone glancing at the screen expects.
 * Returning a code rather than a hex also keeps the "never hardcode condition
 * hex" rule intact: the caller still resolves it through CONDITION_SYSTEM.
 */
export function hazardConditionCode(severity: HazardSeverity | string): string {
  switch (severity) {
    case 'danger':
      return 'dangerous';
    case 'warning':
      return 'high';
    case 'caution':
      return 'low';
    default:
      return 'unknown';
  }
}

/**
 * One-line summary for a portage instruction, or null when none applies.
 *
 * "Either side" is phrased as a choice rather than an instruction, because
 * telling someone to portage "either" reads like missing data.
 */
export function portageNote(hazard: Hazard): string | null {
  if (!hazard.portageRequired) return null;
  switch (hazard.portageSide) {
    case 'left':
      return 'Portage river left';
    case 'right':
      return 'Portage river right';
    case 'either':
      return 'Portage either side';
    default:
      return 'Portage required';
  }
}

/** A short "3 hazards, 1 portage" line for a collapsed section header. */
export function hazardSummary(hazards: Hazard[]): string | null {
  if (hazards.length === 0) return null;
  const portages = hazards.filter((h) => h.portageRequired).length;
  const noun = hazards.length === 1 ? 'hazard' : 'hazards';
  if (portages === 0) return `${hazards.length} ${noun}`;
  return `${hazards.length} ${noun}, ${portages} portage${portages === 1 ? '' : 's'}`;
}
