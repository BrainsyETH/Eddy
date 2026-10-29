// src/lib/hazards/presentation.ts
// How the website orders and labels hazards — the same rules as the app.
//
// A copy of packages/eddy-hazards/index.ts, because shipped web code cannot
// import from outside missouri-float-planner (Vercel builds only this
// directory). The ordering is a safety claim — a `danger` low-water dam must
// not sort under an `info` note — so presentation-parity.test.ts runs
// both copies over the same hazards and fails the moment they disagree.
// Change the package first, then mirror it here.

import type { Hazard, HazardSeverity, HazardType } from '@/types/api';

const SEVERITY_RANK: Record<HazardSeverity, number> = {
  danger: 0,
  warning: 1,
  caution: 2,
  info: 3,
};

export function severityRank(severity: HazardSeverity): number {
  return SEVERITY_RANK[severity] ?? SEVERITY_RANK.info;
}

/** Most dangerous first, then downstream order within a severity. */
export function sortHazards(hazards: Hazard[]): Hazard[] {
  return [...hazards].sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return (a.riverMile ?? 0) - (b.riverMile ?? 0);
  });
}

/** Serious enough to surface before launch: danger, warning, or a required portage. */
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

/** The condition whose colour a hazard borrows: one colour language for danger. */
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

/** "3 hazards, 1 portage" for a collapsed section header. */
export function hazardSummary(hazards: Hazard[]): string | null {
  if (hazards.length === 0) return null;
  const portages = hazards.filter((h) => h.portageRequired).length;
  const noun = hazards.length === 1 ? 'hazard' : 'hazards';
  if (portages === 0) return `${hazards.length} ${noun}`;
  return `${hazards.length} ${noun}, ${portages} portage${portages === 1 ? '' : 's'}`;
}
