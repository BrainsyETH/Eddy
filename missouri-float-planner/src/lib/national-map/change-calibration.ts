// src/lib/national-map/change-calibration.ts
// Evidence for the Change view's flow thresholds (change.ts CHANGE_THRESHOLDS):
// the distribution of frame-to-frame discharge ratios across the network, by
// river size, and the share of gauges each provisional threshold would mark.
//
// Calibration rule (docs/national-river-map.md, Change): a threshold should
// mark the unusual, not the everyday — on an ordinary day most gauges must
// read "about the same", and "sharply" must stay rare. Read the report on more
// than one day (a quiet day and a wet one) before moving a number.
//
// Pure: scripts/calibrate-change-thresholds.ts loads the frames.

import { CHANGE_FLOOR_CFS, CHANGE_THRESHOLDS, IMPLAUSIBLE_RATIO, PRIOR_FRESH_MS, type ChangeWindow } from './change';
import type { DecodedFrame } from './frame';

export type SizeBucket = 'small (<100 sq mi)' | 'medium (100–1,000)' | 'large (1,000–10,000)' | 'very large (>10,000)' | 'unknown size';

export function sizeBucket(drainageSqMi: number | null | undefined): SizeBucket {
  if (drainageSqMi == null || !Number.isFinite(drainageSqMi)) return 'unknown size';
  if (drainageSqMi < 100) return 'small (<100 sq mi)';
  if (drainageSqMi < 1000) return 'medium (100–1,000)';
  if (drainageSqMi < 10000) return 'large (1,000–10,000)';
  return 'very large (>10,000)';
}

/** Discharge ratios (floored, as the view computes them) for gauges trustworthy in both frames. */
export function frameRatios(now: DecodedFrame, then: DecodedFrame): Map<string, number> {
  const out = new Map<string, number>();
  for (const [siteId, r1] of now.gauges) {
    const r0 = then.gauges.get(siteId);
    if (!r0 || r1.suspect || r0.suspect || r1.dischargeCfs === null || r0.dischargeCfs === null) continue;
    if (r1.observedAt === null || r0.observedAt === null) continue;
    if (now.capturedAt - r1.observedAt > PRIOR_FRESH_MS || then.capturedAt - r0.observedAt > PRIOR_FRESH_MS) continue;
    out.set(siteId, (Math.max(r1.dischargeCfs, 0) + CHANGE_FLOOR_CFS) / (Math.max(r0.dischargeCfs, 0) + CHANGE_FLOOR_CFS));
  }
  return out;
}

export interface RatioStats {
  n: number;
  /** Ratio percentiles. */
  p: Record<1 | 5 | 10 | 50 | 90 | 95 | 99, number>;
  /** Share of gauges each provisional class would mark. */
  share: { risingFast: number; rising: number; steady: number; falling: number; fallingFast: number; implausible: number };
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function ratioStats(ratios: number[], window: ChangeWindow): RatioStats {
  const sorted = [...ratios].sort((a, b) => a - b);
  const t = CHANGE_THRESHOLDS[window];
  const n = sorted.length || 1;
  const count = (f: (r: number) => boolean) => sorted.filter(f).length / n;
  const ok = (r: number) => r < IMPLAUSIBLE_RATIO && r > 1 / IMPLAUSIBLE_RATIO;
  return {
    n: sorted.length,
    p: {
      1: quantile(sorted, 0.01),
      5: quantile(sorted, 0.05),
      10: quantile(sorted, 0.1),
      50: quantile(sorted, 0.5),
      90: quantile(sorted, 0.9),
      95: quantile(sorted, 0.95),
      99: quantile(sorted, 0.99),
    },
    share: {
      risingFast: count((r) => ok(r) && r >= t.fastRatio),
      rising: count((r) => ok(r) && r >= t.ratio && r < t.fastRatio),
      steady: count((r) => r < t.ratio && r > 1 / t.ratio),
      falling: count((r) => ok(r) && r <= 1 / t.ratio && r > 1 / t.fastRatio),
      fallingFast: count((r) => ok(r) && r <= 1 / t.fastRatio),
      implausible: count((r) => !ok(r)),
    },
  };
}

/** Markdown for one window: overall and by river size. */
export function calibrationMarkdown(
  window: ChangeWindow,
  now: DecodedFrame,
  then: DecodedFrame,
  drainage: Map<string, number | null>,
): string {
  const ratios = frameRatios(now, then);
  const groups = new Map<SizeBucket | 'all gauges', number[]>([['all gauges', [...ratios.values()]]]);
  for (const [siteId, r] of ratios) {
    const b = sizeBucket(drainage.get(siteId));
    (groups.get(b) ?? groups.set(b, []).get(b)!).push(r);
  }
  const t = CHANGE_THRESHOLDS[window];
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const x = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)}×` : '—');
  const lines = [
    `### ${window} window — ${new Date(then.capturedAt).toISOString()} → ${new Date(now.capturedAt).toISOString()}`,
    '',
    `Provisional: rising ≥ ${t.ratio}× (sharply ≥ ${t.fastRatio}×), falling ≤ 1/${t.ratio} (sharply ≤ 1/${t.fastRatio}); implausible ≥ ${IMPLAUSIBLE_RATIO}×.`,
    '',
    '| Group | n | p1 | p5 | p10 | p50 | p90 | p95 | p99 | ▲▲ | ▲ | ≈ | ▼ | ▼▼ | implausible |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  const order: Array<SizeBucket | 'all gauges'> = ['all gauges', 'small (<100 sq mi)', 'medium (100–1,000)', 'large (1,000–10,000)', 'very large (>10,000)', 'unknown size'];
  for (const g of order) {
    const rs = groups.get(g);
    if (!rs?.length) continue;
    const s = ratioStats(rs, window);
    lines.push(
      `| ${g} | ${s.n} | ${x(s.p[1])} | ${x(s.p[5])} | ${x(s.p[10])} | ${x(s.p[50])} | ${x(s.p[90])} | ${x(s.p[95])} | ${x(s.p[99])} | ${pct(s.share.risingFast)} | ${pct(s.share.rising)} | ${pct(s.share.steady)} | ${pct(s.share.falling)} | ${pct(s.share.fallingFast)} | ${pct(s.share.implausible)} |`,
    );
  }
  return lines.join('\n');
}
