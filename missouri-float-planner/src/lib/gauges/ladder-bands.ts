// The reading range that produces each condition, derived the same way
// shared/condition-ladder.ts `classifyReading` grades a reading. The admin
// gauge editor prints these next to each condition; ladder-bands.test.ts
// checks them against the classifier, so the two cannot drift apart.
//
// Two rules surprise people and are why this is not computed inline:
//   - High starts just above Optimal Max. The High field is only read when
//     Optimal Max is blank.
//   - Good starts at Low, or at Optimal Min when Low is blank.
import type { ConditionThresholds } from '@shared/condition-ladder';

export type BandKey = 'tooLow' | 'low' | 'good' | 'flowing' | 'high' | 'flood';

export interface Band {
  min: number | null;
  minInclusive: boolean;
  max: number | null;
  maxInclusive: boolean;
}

type Ladder = Pick<
  ConditionThresholds,
  'levelTooLow' | 'levelLow' | 'levelOptimalMin' | 'levelOptimalMax' | 'levelHigh' | 'levelDangerous'
>;

/** Where High begins: Optimal Max, else the High field. */
export function highStart(t: Ladder): number | null {
  return t.levelOptimalMax ?? t.levelHigh;
}

/** True when the High field is set but has no effect on the result. */
export function highFieldIgnored(t: Ladder): boolean {
  return t.levelHigh !== null && t.levelOptimalMax !== null && t.levelHigh !== t.levelOptimalMax;
}

/**
 * Bands for a ladder whose values are in order (the save route enforces
 * that). A condition that no reading can produce has no entry. An empty
 * ladder grades nothing, so it has no bands at all.
 */
export function ladderBands(t: Ladder): Partial<Record<BandKey, Band>> {
  const hasFlowing = t.levelOptimalMin !== null && t.levelOptimalMax !== null;
  const starts: { key: BandKey; start: number | null; inclusive: boolean }[] = [
    { key: 'low', start: t.levelTooLow, inclusive: true },
    { key: 'good', start: t.levelLow ?? t.levelOptimalMin, inclusive: true },
    { key: 'flowing', start: hasFlowing ? t.levelOptimalMin : null, inclusive: true },
    { key: 'high', start: highStart(t), inclusive: false },
    { key: 'flood', start: t.levelDangerous, inclusive: true },
  ];
  const defined = starts.filter((s): s is { key: BandKey; start: number; inclusive: boolean } => s.start !== null);
  if (defined.length === 0) return {};

  const bands: Partial<Record<BandKey, Band>> = {};
  const first = defined[0];
  bands.tooLow = { min: null, minInclusive: false, max: first.start, maxInclusive: !first.inclusive };
  defined.forEach((band, i) => {
    const next = defined[i + 1];
    const max = next ? next.start : null;
    const maxInclusive = next ? !next.inclusive : false;
    // Empty when the next band starts at or before this one (e.g. Good with
    // no Low: it would start where Flowing does).
    const empty =
      max !== null && (band.start > max || (band.start === max && !(band.inclusive && maxInclusive)));
    if (!empty) bands[band.key] = { min: band.start, minInclusive: band.inclusive, max, maxInclusive };
  });
  return bands;
}

export function formatBand(band: Band, unit: 'ft' | 'cfs'): string {
  const n = (v: number) => (unit === 'cfs' ? v.toLocaleString('en-US') : v.toFixed(2));
  if (band.min === null && band.max !== null) return `${band.maxInclusive ? '≤' : '<'} ${n(band.max)} ${unit}`;
  if (band.max === null && band.min !== null) return `${band.minInclusive ? '≥' : '>'} ${n(band.min)} ${unit}`;
  if (band.min === null || band.max === null) return '';
  return `${band.minInclusive ? '' : '> '}${n(band.min)} to ${band.maxInclusive ? '' : '< '}${n(band.max)} ${unit}`;
}
