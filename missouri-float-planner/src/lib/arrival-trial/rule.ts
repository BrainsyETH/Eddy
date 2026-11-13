// src/lib/arrival-trial/rule.ts
// The release-arrival rule, as frozen by the replay study.
//
// INTERNAL TRIAL ONLY. Nothing here feeds a page, a widget, an alert or Eddy's
// Read. It decides, three hours into a Bull Shoals release increase, whether an
// arrival estimate for the gauge near Norfork would be issued, and later reads
// what the river did. The log it produces is the evidence a public estimate
// would need; it is not that estimate. See docs/release-arrival-trial.md.
//
// This file is a port of scripts/research/bull-shoals-lag-2026-11/replay.py
// and lagstudy.py. rule.test.ts replays a slice of real data through both and
// fails if a single decision or outcome differs, so a change here is a change
// to the rule and needs a new RULE_VERSION, not an edit.
//
// Pure TypeScript: no I/O, no clock. Times are epoch milliseconds; a release
// hour is the UTC hour it COVERS, not the period-ending stamp CWMS publishes.

export const RULE_VERSION = 'norfork-v1';

export const HOUR_MS = 3_600_000;

export const TRIAL_SITES = {
  damId: 'swl-bull-shoals-dam',
  gaugeSiteId: '07057370',
  tributarySiteIds: ['07056700', '07055607'],
} as const;

export const RULE = {
  /** Six hours before an increase vary by no more than this. */
  steadyCfs: 600,
  /** What counts as a detected increase: first hour over the baseline. */
  firstHourRiseCfs: 1000,
  /** Hours of the increase in hand when the decision is made. */
  decideAfterHours: 3,
  /** Smaller increases get no estimate. */
  minPeakRiseCfs: 2000,
  /** The release must start from a low baseline. */
  maxBaselineCfs: 1500,
  /** No smaller increase in the previous 20 hours. */
  maxPriorStepCfs: 500,
  priorStepHours: 20,
  /** Gauge near Norfork in the hour before the increase. */
  maxStageFt: 7,
  /** Buffalo + Crooked Creek range over the 12 hours up to the decision. */
  maxTributaryRangeCfs: 500,
  tributaryHours: 12,
  minTributaryReadings: 6,
  /** Arrival window after the increase, in hours. */
  windowHours: [5, 24] as const,
  /** Hours of record needed before an increase can be detected. */
  minHistoryHours: 24,
} as const;

/**
 * Forward-only additions. The replay did not have these; each came out of its
 * misses and is fixed here before any forward data exists.
 */
export const FORWARD = {
  /** A baseline this low is a bad reading at Bull Shoals, not a release. */
  implausibleBaselineCfs: 300,
  /** Recorded as a flag, not a reason to withhold: it would cost 4 in 10 estimates. */
  earlierReleaseHours: 14,
  earlierReleaseCfs: 500,
} as const;

/** ln(hours) = intercept + lnPeak·ln(peak cfs) + stageFt·gauge height. */
export const MODEL = {
  intercept: 4.2145,
  lnPeak: -0.1633,
  stageFt: -0.0231,
  earlyOffsetHours: 1.5,
  lateOffsetHours: 1.25,
} as const;

export type WithholdReason =
  | 'release data missing'
  | 'release reading implausible'
  | 'increase under 2,000 cfs'
  | 'release already raised'
  | 'smaller increase went first'
  | 'gauge reading missing'
  | 'river high'
  | 'tributary reading missing'
  | 'tributaries moving';

/** The order reasons are reported in; the first is the one a row is filed under. */
export const WITHHOLD_ORDER: WithholdReason[] = [
  'release data missing',
  'release reading implausible',
  'increase under 2,000 cfs',
  'release already raised',
  'smaller increase went first',
  'gauge reading missing',
  'river high',
  'tributary reading missing',
  'tributaries moving',
];

export interface Sample {
  /** Epoch milliseconds. */
  t: number;
  v: number;
}

/** A gap-free run of hourly values; `null` is an hour with no reading. */
export interface HourlySeries {
  /** Epoch ms of the hour index 0 covers. */
  startMs: number;
  values: Array<number | null>;
}

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** First index whose time is >= t (`left`) or > t (`right`). */
function search(times: number[], t: number, side: 'left' | 'right'): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (side === 'left' ? times[mid] < t : times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Mean of the samples inside each hour; an hour with none is null. */
export function hourlyMeans(samples: Sample[], startMs: number, hours: number): Array<number | null> {
  const sum = new Array<number>(hours).fill(0);
  const count = new Array<number>(hours).fill(0);
  for (const s of samples) {
    if (!Number.isFinite(s.v)) continue;
    const i = Math.floor((s.t - startMs) / HOUR_MS);
    if (i < 0 || i >= hours) continue;
    sum[i] += s.v;
    count[i] += 1;
  }
  return sum.map((total, i) => (count[i] ? total / count[i] : null));
}

/** Hour indexes where a release increase begins. */
export function detectStarts(release: Array<number | null>): number[] {
  const starts: number[] = [];
  for (let i = RULE.minHistoryHours; i < release.length - 1; i++) {
    const now = release[i];
    const prev = release.slice(i - 6, i);
    if (!finite(now) || !prev.every(finite)) continue;
    const steady = prev as number[];
    if (Math.max(...steady) - Math.min(...steady) > RULE.steadyCfs) continue;
    if (now - median(steady) >= RULE.firstHourRiseCfs) starts.push(i);
  }
  return starts;
}

export interface DecisionInput {
  release: Array<number | null>;
  /** Hour index of the increase within `release`. */
  index: number;
  /** Epoch ms of the hour `index` covers. */
  hourMs: number;
  /** Gauge stage samples, ascending in time. */
  stage: Sample[];
  /** Hourly tributary discharge, each aligned to `release`. */
  tributaries: Array<Array<number | null>>;
  /** Apply the forward-only implausible-reading check. Off reproduces the replay. */
  forward?: boolean;
}

export interface Decision {
  decision: 'issued' | 'withheld';
  /** First reason in WITHHOLD_ORDER, or null when issued. */
  reason: WithholdReason | null;
  reasons: WithholdReason[];
  /** The moment the increase is timed at: half past its first hour. */
  onsetMs: number;
  baselineCfs: number;
  peakCfs: number | null;
  priorStepCfs: number | null;
  stageFt: number | null;
  tributaryRangeCfs: number | null;
  /** Estimate from the frozen model whenever its inputs exist, issued or not. */
  estimateHours: number | null;
  /** A release ended in the previous 14 hours and may still be on its way. */
  earlierReleaseInTransit: boolean;
}

export function estimateHours(peakCfs: number, stageFt: number): number {
  return Math.exp(MODEL.intercept + MODEL.lnPeak * Math.log(Math.max(peakCfs, 50)) + MODEL.stageFt * stageFt);
}

/** Sum over tributaries of (max - min) across hour indexes [from, to). Null if any is too sparse. */
function tributaryRange(tributaries: Array<Array<number | null>>, from: number, to: number, minReadings: number) {
  let total = 0;
  for (const values of tributaries) {
    const part = values.slice(Math.max(from, 0), to).filter(finite);
    if (part.length < minReadings) return null;
    total += Math.max(...part) - Math.min(...part);
  }
  return total;
}

/** Whether an estimate is issued for the increase at `index`, and from what. */
export function decide(input: DecisionInput): Decision {
  const { release, index: i, hourMs, stage, tributaries } = input;
  const baselineCfs = median(release.slice(i - 6, i) as number[]);
  const onsetMs = hourMs + HOUR_MS / 2;
  const decideIndex = i + RULE.decideAfterHours;
  const reasons: WithholdReason[] = [];

  const first = release.slice(i, decideIndex);
  let peakCfs: number | null = null;
  if (decideIndex >= release.length || !first.every(finite)) {
    reasons.push('release data missing');
  } else {
    peakCfs = Math.max(...(first as number[]));
    if (peakCfs - baselineCfs < RULE.minPeakRiseCfs) reasons.push('increase under 2,000 cfs');
  }
  if (input.forward && baselineCfs < FORWARD.implausibleBaselineCfs) reasons.push('release reading implausible');
  if (baselineCfs >= RULE.maxBaselineCfs) reasons.push('release already raised');

  const before = release.slice(Math.max(i - RULE.priorStepHours, 0), i).filter(finite);
  const priorStepCfs = before.length ? baselineCfs - Math.min(...before) : null;
  if (priorStepCfs !== null && priorStepCfs >= RULE.maxPriorStepCfs) reasons.push('smaller increase went first');

  const times = stage.map((s) => s.t);
  const a = search(times, onsetMs - 1.5 * HOUR_MS, 'left');
  const b = search(times, onsetMs - 0.5 * HOUR_MS, 'left');
  const stageFt = b > a ? median(stage.slice(a, b).map((s) => s.v)) : null;
  if (stageFt === null) reasons.push('gauge reading missing');
  else if (stageFt >= RULE.maxStageFt) reasons.push('river high');

  const tributaryRangeCfs = tributaryRange(
    tributaries,
    decideIndex - RULE.tributaryHours,
    decideIndex,
    RULE.minTributaryReadings
  );
  if (tributaryRangeCfs === null) reasons.push('tributary reading missing');
  else if (tributaryRangeCfs > RULE.maxTributaryRangeCfs) reasons.push('tributaries moving');

  reasons.sort((x, y) => WITHHOLD_ORDER.indexOf(x) - WITHHOLD_ORDER.indexOf(y));
  const earlier = release.slice(Math.max(i - FORWARD.earlierReleaseHours, 0), i).filter(finite);
  return {
    decision: reasons.length ? 'withheld' : 'issued',
    reason: reasons[0] ?? null,
    reasons,
    onsetMs,
    baselineCfs,
    peakCfs,
    priorStepCfs,
    stageFt,
    tributaryRangeCfs,
    estimateHours: peakCfs !== null && stageFt !== null ? estimateHours(peakCfs, stageFt) : null,
    earlierReleaseInTransit:
      earlier.length > 0 && Math.max(...earlier) - baselineCfs >= FORWARD.earlierReleaseCfs,
  };
}

/**
 * How far tributaries have moved between two hour indexes, summed across them.
 * Unlike the rule's own check this takes whatever readings exist, so it can be
 * asked again each hour as more arrive. Null when there are none at all.
 */
export function tributaryMovement(
  tributaries: Array<Array<number | null>>,
  from: number,
  to: number
): number | null {
  let total = 0;
  let seen = false;
  for (const values of tributaries) {
    const part = values.slice(Math.max(from, 0), to).filter(finite);
    if (!part.length) continue;
    seen = true;
    total += Math.max(...part) - Math.min(...part);
  }
  return seen ? total : null;
}

/**
 * Hours after the onset at which tributaries, watched from 12 hours before the
 * decision, first moved past the limit. Null if they never did in the window.
 */
export function tributaryWatchHours(
  tributaries: Array<Array<number | null>>,
  index: number
): number | null {
  const decideIndex = index + RULE.decideAfterHours;
  const from = Math.max(decideIndex - RULE.tributaryHours, 0);
  const length = Math.min(...tributaries.map((t) => t.length));
  for (let u = decideIndex; u < Math.min(index + RULE.windowHours[1] + 1, length); u++) {
    let moved = 0;
    for (const values of tributaries) {
      const part = values.slice(from, u + 1).filter(finite);
      if (part.length) moved += Math.max(...part) - Math.min(...part);
    }
    // Hour u is known once it has ended, half an hour before `u + 1` on the onset clock.
    if (moved > RULE.maxTributaryRangeCfs) return u + 1 - index - 0.5;
  }
  return null;
}

// ── Outcomes ─────────────────────────────────────────────────────────────────

interface Grid {
  startMs: number;
  stepMs: number;
  values: Array<number | null>;
}

/** Stage on a regular grid at its own cadence, gaps as null. */
function regularGrid(samples: Sample[]): Grid | null {
  const clean = samples.filter((s) => Number.isFinite(s.v));
  if (clean.length < 2) return null;
  const gaps: number[] = [];
  for (let k = 1; k < clean.length; k++) gaps.push(clean[k].t - clean[k - 1].t);
  const stepMs = Math.max(Math.round(median(gaps) / 60_000), 1) * 60_000;
  const snap = (t: number) => Math.round(t / stepMs) * stepMs;
  const startMs = snap(clean[0].t);
  const count = Math.round((snap(clean[clean.length - 1].t) - startMs) / stepMs) + 1;
  const sum = new Array<number>(count).fill(0);
  const seen = new Array<number>(count).fill(0);
  for (const s of clean) {
    const k = Math.round((snap(s.t) - startMs) / stepMs);
    sum[k] += s.v;
    seen[k] += 1;
  }
  return { startMs, stepMs, values: sum.map((total, k) => (seen[k] ? total / seen[k] : null)) };
}

export const RISE = { thresholdFt: 0.1, lookbackHours: 3, quietHours: 2 } as const;

/**
 * Times the gauge first stands 0.10 ft above its lowest reading of the previous
 * three hours, after at least two hours below that mark.
 */
export function gaugeRises(samples: Sample[]): number[] {
  const grid = regularGrid(samples);
  if (!grid) return [];
  const perHour = HOUR_MS / grid.stepMs;
  const look = Math.max(Math.round(RISE.lookbackHours * perHour), 1);
  const quiet = Math.max(Math.round(RISE.quietHours * perHour), 1);
  const v = grid.values;
  const above = v.map((value, k) => {
    if (!finite(value)) return false;
    const window = v.slice(Math.max(k - look, 0), k + 1).filter(finite);
    // Needs enough of the lookback to call a floor, counting the reading itself.
    if (window.length < Math.floor(look / 2) + 1) return false;
    return value - Math.min(...window) >= RISE.thresholdFt;
  });
  const rises: number[] = [];
  for (let k = quiet; k < v.length; k++) {
    if (!above[k]) continue;
    const prior = above.slice(k - quiet, k);
    const present = v.slice(k - quiet, k).filter(finite).length;
    if (prior.some(Boolean) || present < 0.75 * quiet) continue;
    rises.push(grid.startMs + k * grid.stepMs);
  }
  return rises;
}

export type MatchStatus = 'matched' | 'ambiguous' | 'none';

/**
 * One-to-one matching: an increase is matched only when exactly one rise falls
 * in its window and no other increase's window holds that rise.
 */
export function matchOnsets(onsetsMs: number[], risesMs: number[]) {
  const [wmin, wmax] = RULE.windowHours.map((h) => h * HOUR_MS);
  return onsetsMs.map((onset) => {
    const lo = search(risesMs, onset + wmin, 'left');
    const hi = search(risesMs, onset + wmax, 'right');
    const candidates = hi - lo;
    const firstRiseMs = candidates ? risesMs[lo] : null;
    if (candidates === 0) return { status: 'none' as MatchStatus, riseMs: null, firstRiseMs, candidates, claims: 0 };
    const rise = risesMs[lo];
    const claims =
      search(onsetsMs, rise - wmin, 'right') - search(onsetsMs, rise - wmax, 'left');
    const status: MatchStatus = candidates > 1 || claims > 1 ? 'ambiguous' : 'matched';
    return { status, riseMs: status === 'matched' ? rise : null, firstRiseMs, candidates, claims };
  });
}

/** Whether the gauge has a hole longer than 30 minutes around the arrival window. */
export function gaugeGap(samples: Sample[], onsetMs: number): boolean {
  const from = onsetMs - 3 * HOUR_MS;
  const to = onsetMs + RULE.windowHours[1] * HOUR_MS;
  const marks = [from, ...samples.filter((s) => Number.isFinite(s.v) && s.t >= from && s.t <= to).map((s) => s.t), to];
  let widest = 0;
  for (let k = 1; k < marks.length; k++) widest = Math.max(widest, marks[k] - marks[k - 1]);
  return widest > 0.5 * HOUR_MS + 0.0036;
}

/** Midpoint and size of the steepest one-hour rise in the arrival window. */
export function steepestRise(samples: Sample[], onsetMs: number): { atMs: number; ftPerHour: number } | null {
  const grid = regularGrid(samples);
  if (!grid) return null;
  const perHour = Math.round(HOUR_MS / grid.stepMs);
  const from = onsetMs + RULE.windowHours[0] * HOUR_MS;
  const to = onsetMs + RULE.windowHours[1] * HOUR_MS;
  let best: { atMs: number; ftPerHour: number } | null = null;
  for (let k = perHour; k < grid.values.length; k++) {
    const t = grid.startMs + k * grid.stepMs;
    if (t < from || t > to) continue;
    const now = grid.values[k];
    const then = grid.values[k - perHour];
    if (!finite(now) || !finite(then)) continue;
    const rise = now - then;
    if (!best || rise > best.ftPerHour) best = { atMs: t - HOUR_MS / 2, ftPerHour: rise };
  }
  return best;
}
