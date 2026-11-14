// src/lib/release-timing/findings.ts
// The measured results behind /dams/swl-bull-shoals-dam/release-timing.
//
// The numbers come from the Bull Shoals release studies
// (scripts/research/bull-shoals-lag-2026-11) by way of export_findings.py,
// which writes the JSON imported here. findings.test.ts recomputes the counts
// and medians from the study's own result files, so the page cannot drift
// from what was measured.

import raw from '../../data/release-timing/bull-shoals-findings.json';

export const RELEASE_TIMING_DAM_ID = 'swl-bull-shoals-dam';
export const RELEASE_TIMING_PATH = `/dams/${RELEASE_TIMING_DAM_ID}/release-timing`;

/** [three-hour peak cfs, hours to first rise, gauge ft at the start, release cfs before, 1 on a normal river] */
export type Point = readonly [number, number, number, number, number];

export interface Stats {
  n: number;
  median: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
}
export interface Band extends Stats {
  label: string;
  lo: number;
  hi?: number;
}
export interface Findings {
  years: [number, number];
  generatorCfs: number;
  /** Release increases of 2,000 cfs or more. */
  increases: number;
  /** Matched to exactly one rise, with a complete gauge record. */
  scored: number;
  /** Scored, on a normal river. */
  normal: number;
  normalAll: Stats;
  size: Band[];
  height: Band[];
  baseline: Band[];
  /** A measured release the map replays until a live result is picked. */
  example: { onsetMs: number; riseMs: number; peakCfs: number };
  points: Point[];
}

export const FINDINGS = raw as unknown as Findings;

/** Linear interpolation between order statistics, as numpy.percentile does. */
export function quantile(sorted: readonly number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** "12¾": hours to the nearest quarter, as people say them. */
export function hoursText(hours: number): string {
  const quarters = Math.round(hours * 4);
  const whole = Math.floor(quarters / 4);
  const part = ['', '¼', '½', '¾'][quarters % 4];
  return whole === 0 && part === '' ? '0' : `${whole === 0 ? '' : whole}${part}`;
}

/** Which size band a release falls in, by its three-hour peak. */
export function sizeIndexFor(peakCfs: number, findings: Findings = FINDINGS): number {
  const generators = peakCfs / findings.generatorCfs;
  const index = findings.size.findIndex((band) => generators >= band.lo && generators < (band.hi ?? Infinity));
  return index === -1 ? findings.size.length - 1 : index;
}

export const hoursOf = (points: readonly Point[], keep: (point: Point) => boolean): number[] =>
  points.filter(keep).map((point) => point[1]);

/** Releases on a normal river in one size band: what the map and the size chart draw. */
export function sizeHours(index: number, findings: Findings = FINDINGS): number[] {
  const band = findings.size[index];
  return hoursOf(findings.points, (p) => p[4] === 1 && p[0] / findings.generatorCfs >= band.lo && p[0] / findings.generatorCfs < (band.hi ?? Infinity));
}

export interface Spread {
  sorted: number[];
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
}
export function spread(values: readonly number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    sorted,
    min: sorted[0],
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max: sorted[sorted.length - 1],
  };
}
