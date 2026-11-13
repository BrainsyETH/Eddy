// src/lib/arrival-trial/run.ts
// One pass of the release-arrival trial.
//
// The log is only worth having if every estimate is written before the river
// can answer it, from what was known at that moment. So a pass never revisits
// a decision. Each thing it learns is its own append-only row:
//
//   prediction   once per detected increase: an estimate, or why not
//   watch event  the hour a live estimate's conditions were seen to change
//   outcome      a day later, what the gauge did
//   pass         that this pass ran, so a missing row can be told apart from
//                a pass that never happened
//
// An increase that cannot be decided in time still gets a row, filed under
// whose delay it was: the release data's, Eddy's own, an outage, or a pause.
//
// Everything the pass touches comes in through TrialDeps, so run.test.ts can
// drive it against a made-up river and a fixed clock.

import {
  HOUR_MS,
  MODEL,
  RULE,
  RULE_VERSION,
  TRIAL_SITES,
  decide,
  detectStarts,
  gaugeGap,
  gaugeRises,
  hourlyMeans,
  matchOnsets,
  steepestRise,
  tributaryMovement,
  tributaryWatchHours,
  type Decision,
  type Sample,
  type WithholdReason,
} from './rule';

/** Hours of release record read on an ordinary pass. */
export const RELEASE_WINDOW_HOURS = 96;
/** How far back a pass will go to account for increases it missed. */
export const RECONCILE_LOOKBACK_HOURS = 30 * 24;
/** Record needed before the oldest increase a pass may have to account for. */
export const HISTORY_MARGIN_HOURS = 36;
/** An estimate must be written this long before the arrival window opens. */
export const ISSUE_MARGIN_MS = 10 * 60_000;
/** Two passes this close together count as collection running without a break. */
export const PASS_SPACING_MS = 65 * 60_000;
/** Missed increases accounted for per pass; each costs three USGS requests. */
export const MAX_LATE_ROWS_PER_PASS = 6;
/** Wait this long after the window closes for the gauge record to settle. */
export const OUTCOME_GRACE_MS = 2 * HOUR_MS;
/** Stop waiting for a gauge record this long after the increase. */
export const OUTCOME_GIVE_UP_MS = 96 * HOUR_MS;
/** Hours of release read before an increase when judging its outcome. */
export const FRAME_BEFORE_HOURS = 72;
/** How far back a row may still be waiting on its outcome. */
export const OUTCOME_LOOKBACK_HOURS = 14 * 24;
/** Outcomes read per pass; each costs three USGS requests. */
export const MAX_OUTCOMES_PER_PASS = 4;

/** Reasons that exist only because the trial runs against a live clock. */
export type ForwardReason =
  | 'release data arrived too late'
  | 'decided too late'
  | 'collection was down'
  | 'collection paused'
  | 'tributaries moved before issue';
export type LoggedReason = WithholdReason | ForwardReason;

export interface ReleaseHour {
  hourMs: number;
  cfs: number;
  /** When Eddy first stored the hour, if known. */
  receivedAtMs: number | null;
}

export interface LoggedIncrease {
  id: string;
  onsetHourMs: number;
  decision: 'issued' | 'withheld';
  predictedArrivalMs: number | null;
  hasOutcome: boolean;
  hasWatchEvent: boolean;
}

export interface PassRecord {
  atMs: number;
  state: 'active' | 'paused';
}

export interface Coverage {
  /** The first pass that ever ran with the trial switched on. */
  firstActiveMs: number | null;
  /** Passes since the time asked for, oldest first. */
  recent: PassRecord[];
}

export interface PredictionRow {
  dam_id: string;
  gauge_site_id: string;
  onset_hour: string;
  rule_version: string;
  decision: 'issued' | 'withheld';
  reason: LoggedReason | null;
  all_reasons: LoggedReason[];
  predicted_arrival_at: string | null;
  range_early_at: string | null;
  range_late_at: string | null;
  flags: string[];
  inputs: Record<string, unknown>;
}

export type OutcomeStatus = 'matched' | 'ambiguous' | 'no rise found' | 'gauge gap' | 'gauge data unavailable';

export interface OutcomeRow {
  prediction_id: string;
  status: OutcomeStatus;
  first_rise_at: string | null;
  matched_rise_at: string | null;
  rise_candidates: number;
  competing_increases: number;
  steepest_rise_at: string | null;
  steepest_rise_ft_per_hour: number | null;
  tributary_watch_tripped_at: string | null;
  details: Record<string, unknown>;
}

export interface WatchEventRow {
  prediction_id: string;
  kind: 'tributaries moving';
  details: Record<string, unknown>;
}

export interface PassRow {
  rule_version: string;
  state: 'active' | 'paused';
  release_through: string | null;
  summary: Record<string, unknown>;
}

export interface TrialDeps {
  now: number;
  readRelease(fromMs: number, toMs: number): Promise<ReleaseHour[]>;
  /** Gauge height near Norfork. Null when the request failed. */
  readStage(fromMs: number, toMs: number): Promise<Sample[] | null>;
  /** Tributary discharge. Null when the request failed. */
  readTributary(siteId: string, fromMs: number, toMs: number): Promise<Sample[] | null>;
  loggedSince(fromMs: number): Promise<LoggedIncrease[]>;
  coverage(sinceMs: number): Promise<Coverage>;
  savePrediction(row: PredictionRow): Promise<'saved' | 'duplicate' | 'error'>;
  saveOutcome(row: OutcomeRow): Promise<'saved' | 'duplicate' | 'error'>;
  saveWatchEvent(row: WatchEventRow): Promise<'saved' | 'duplicate' | 'error'>;
  savePass(row: PassRow): Promise<'saved' | 'error'>;
}

export interface TrialSummary {
  /** `partial` when anything failed to save; the admin monitor reads this first. */
  monitoring_status: 'ok' | 'partial';
  release_hours: number;
  detected: number;
  waiting: number;
  issued: number;
  withheld: number;
  /** Increases a previous pass should have decided, written now for lateness. */
  reconciled: number;
  /** The same, left for the next pass. */
  reconciling: number;
  watch_events: number;
  outcomes: number;
  outcomes_waiting: number;
  errors: number;
}

const iso = (ms: number) => new Date(ms).toISOString();
const floorHour = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;

/** The latest moment an estimate for the increase in `hourMs` may be written. */
export function issueDeadline(hourMs: number): number {
  return hourMs + HOUR_MS / 2 + RULE.windowHours[0] * HOUR_MS - ISSUE_MARGIN_MS;
}

/**
 * Whose delay kept an increase from being decided in time.
 *
 * `dataAtMs` is when its third release hour reached Eddy: null when unknown,
 * Infinity when it still has not. The pass asking counts as a pass at `now`.
 */
export function lateReason(
  hourMs: number,
  dataAtMs: number | null,
  passes: PassRecord[],
  now: number
): ForwardReason {
  const deadline = issueDeadline(hourMs);
  if (dataAtMs !== null && dataAtMs > deadline) return 'release data arrived too late';
  const from = Math.max(hourMs + RULE.decideAfterHours * HOUR_MS, dataAtMs ?? 0);
  const all = [...passes, { atMs: now, state: 'active' as const }];
  const active = all.filter((p) => p.state === 'active');
  // A pass ran with the data in hand and time to spare, and still did not decide.
  if (active.some((p) => p.atMs >= from && p.atMs <= deadline)) return 'decided too late';
  // Passes ran either side of a gap the hourly schedule could not have closed.
  const before = active.some((p) => p.atMs < from && p.atMs >= from - PASS_SPACING_MS);
  const after = active.some((p) => p.atMs > deadline && p.atMs <= deadline + PASS_SPACING_MS);
  if (before && after) return 'release data arrived too late';
  const paused = all.some(
    (p) => p.state === 'paused' && p.atMs >= from - PASS_SPACING_MS && p.atMs <= deadline + PASS_SPACING_MS
  );
  return paused ? 'collection paused' : 'collection was down';
}

async function tributarySeries(
  deps: TrialDeps,
  fromMs: number,
  toMs: number,
  startMs: number,
  hours: number
): Promise<Array<Array<number | null>> | null> {
  const series: Array<Array<number | null>> = [];
  for (const siteId of TRIAL_SITES.tributarySiteIds) {
    const samples = await deps.readTributary(siteId, fromMs, toMs);
    if (!samples) return null;
    series.push(hourlyMeans(samples, startMs, hours));
  }
  return series;
}

interface RowContext {
  hourMs: number;
  index: number;
  startMs: number;
  release: Array<number | null>;
  received: Array<number | null>;
  stage: Sample[];
  tributaries: Array<Array<number | null>>;
  decision: Decision;
  reasons: LoggedReason[];
  /** Hour index one past the last tributary hour the decision could see. */
  seenThrough: number;
  movementAtIssue: number | null;
  /** True when the row is written after the fact, from readings fetched later. */
  reconstructed: boolean;
  now: number;
}

function predictionRow(c: RowContext): PredictionRow {
  const { decision, reasons, release, received, index, startMs } = c;
  const issued = reasons.length === 0;
  const arrival = decision.estimateHours === null ? null : decision.onsetMs + decision.estimateHours * HOUR_MS;
  const from = Math.max(index - RULE.priorStepHours, 0);
  const to = Math.min(index + RULE.decideAfterHours, release.length);
  const firstThree = received.slice(index, to).filter((v): v is number => v !== null);
  const flags: string[] = [];
  if (decision.earlierReleaseInTransit) flags.push('earlier release in transit');
  if (c.reconstructed) flags.push('written after the fact');
  const tributaryFrom = Math.max(to - RULE.tributaryHours, 0);
  return {
    dam_id: TRIAL_SITES.damId,
    gauge_site_id: TRIAL_SITES.gaugeSiteId,
    onset_hour: iso(c.hourMs),
    rule_version: RULE_VERSION,
    decision: issued ? 'issued' : 'withheld',
    reason: reasons[0] ?? null,
    all_reasons: reasons,
    predicted_arrival_at: issued && arrival !== null ? iso(arrival) : null,
    range_early_at: issued && arrival !== null ? iso(arrival - MODEL.earlyOffsetHours * HOUR_MS) : null,
    range_late_at: issued && arrival !== null ? iso(arrival + MODEL.lateOffsetHours * HOUR_MS) : null,
    flags,
    inputs: {
      baseline_cfs: decision.baselineCfs,
      peak_cfs: decision.peakCfs,
      prior_step_cfs: decision.priorStepCfs,
      stage_ft: decision.stageFt,
      // The rule's own check: the 12 hours up to the increase's third hour.
      tributary_range_cfs: decision.tributaryRangeCfs,
      // The same window carried forward to every reading in hand at the decision.
      tributary_range_at_issue_cfs: c.movementAtIssue,
      // What the model would say whenever its inputs exist, issued or not, so
      // a withheld row can still be compared with what the river did.
      estimate_hours: decision.estimateHours,
      would_arrive_at: arrival === null ? null : iso(arrival),
      model: MODEL,
      release: release.slice(from, to).map((cfs, k) => ({
        hour: iso(startMs + (from + k) * HOUR_MS),
        cfs,
        received_at: received[from + k] === null ? null : iso(received[from + k] as number),
      })),
      stage_samples: c.stage
        .filter((s) => s.t >= decision.onsetMs - 1.5 * HOUR_MS && s.t < decision.onsetMs - 0.5 * HOUR_MS)
        .map((s) => ({ at: iso(s.t), ft: s.v })),
      tributaries_from: iso(startMs + tributaryFrom * HOUR_MS),
      tributaries: Object.fromEntries(
        TRIAL_SITES.tributarySiteIds.map((siteId, k) => [
          siteId,
          (c.tributaries[k] ?? []).slice(tributaryFrom, c.seenThrough),
        ])
      ),
      release_complete_at: firstThree.length === to - index && firstThree.length ? iso(Math.max(...firstThree)) : null,
      minutes_after_third_hour: Math.round((c.now - (c.hourMs + RULE.decideAfterHours * HOUR_MS)) / 60_000),
    },
  };
}

export async function runTrial(deps: TrialDeps): Promise<TrialSummary> {
  const { now } = deps;
  const summary: TrialSummary = {
    monitoring_status: 'ok',
    release_hours: 0,
    detected: 0,
    waiting: 0,
    issued: 0,
    withheld: 0,
    reconciled: 0,
    reconciling: 0,
    watch_events: 0,
    outcomes: 0,
    outcomes_waiting: 0,
    errors: 0,
  };
  const endMs = floorHour(now);
  const limitMs = now - RECONCILE_LOOKBACK_HOURS * HOUR_MS;

  // The trial starts with its first pass. Increases whose window had already
  // opened by then are before the trial, not missed by it.
  const coverage = await deps.coverage(limitMs);
  const activation = coverage.firstActiveMs ?? now;
  const lastActive = coverage.recent.filter((p) => p.state === 'active' && p.atMs < now).pop()?.atMs ?? null;

  // A dense hourly array ending at the current hour, so index maths is plain.
  // It reaches back past the last pass that finished, so whatever happened
  // while collection was not running is still seen and accounted for.
  const accountFrom = Math.max(lastActive ?? now, activation, limitMs);
  const hoursBack = Math.max(
    RELEASE_WINDOW_HOURS,
    Math.ceil((endMs - accountFrom) / HOUR_MS) + HISTORY_MARGIN_HOURS
  );
  const startMs = endMs - hoursBack * HOUR_MS;
  const hours = hoursBack + 1;
  const release = new Array<number | null>(hours).fill(null);
  const received = new Array<number | null>(hours).fill(null);
  let releaseThrough: number | null = null;
  for (const row of await deps.readRelease(startMs, endMs)) {
    const k = Math.round((row.hourMs - startMs) / HOUR_MS);
    if (k < 0 || k >= hours || !Number.isFinite(row.cfs)) continue;
    release[k] = row.cfs;
    received[k] = row.receivedAtMs;
    summary.release_hours += 1;
    releaseThrough = Math.max(releaseThrough ?? 0, row.hourMs);
  }
  const starts = detectStarts(release);
  const logged = await deps.loggedSince(Math.min(startMs, endMs - OUTCOME_LOOKBACK_HOURS * HOUR_MS));
  const known = new Set(logged.map((row) => row.onsetHourMs));
  const blank = () => TRIAL_SITES.tributarySiteIds.map(() => new Array<number | null>(hours).fill(null));

  // ── Decisions ──────────────────────────────────────────────────────────────
  for (const index of starts) {
    const hourMs = startMs + index * HOUR_MS;
    const deadline = issueDeadline(hourMs);
    if (known.has(hourMs) || deadline < activation) continue;
    summary.detected += 1;

    const decideIndex = index + RULE.decideAfterHours;
    const firstThree = release.slice(index, decideIndex);
    const inHand = firstThree.length === RULE.decideAfterHours && firstThree.every((v) => v !== null);
    const late = now > deadline;

    let context: RowContext;
    if (!late) {
      if (!inHand) {
        summary.waiting += 1;
        continue;
      }
      const stage = await deps.readStage(hourMs - 3 * HOUR_MS, now);
      const tributaries = await tributarySeries(deps, hourMs - 12 * HOUR_MS, now, startMs, hours);
      // A failed request is not a missing reading. Try again next hour while an
      // estimate could still be written in time.
      if ((!stage || !tributaries) && now + HOUR_MS <= deadline) {
        summary.waiting += 1;
        continue;
      }
      const decision = decide({ release, index, hourMs, stage: stage ?? [], tributaries: tributaries ?? blank(), forward: true });
      // The rule looks at tributaries up to the increase's third hour. Data
      // delays mean the decision is made later than that, so look again at
      // everything in hand now: an estimate must not go out over a rise that
      // has already been read.
      const movementAtIssue = tributaries ? tributaryMovement(tributaries, decideIndex - RULE.tributaryHours, hours) : null;
      const reasons: LoggedReason[] = [...decision.reasons];
      if (
        movementAtIssue !== null &&
        movementAtIssue > RULE.maxTributaryRangeCfs &&
        !decision.reasons.includes('tributaries moving')
      ) {
        reasons.push('tributaries moved before issue');
      }
      context = {
        hourMs, index, startMs, release, received, decision, reasons, movementAtIssue, now,
        stage: stage ?? [], tributaries: tributaries ?? [], seenThrough: hours, reconstructed: false,
      };
    } else {
      if (summary.reconciled + summary.reconciling >= MAX_LATE_ROWS_PER_PASS) {
        summary.reconciling += 1;
        continue;
      }
      const receipts = received.slice(index, decideIndex);
      const dataAt = !inHand ? Infinity : receipts.some((v) => v === null) ? null : Math.max(...(receipts as number[]));
      const why = lateReason(hourMs, dataAt, coverage.recent, now);
      // What the rule would have made of it, from readings up to the deadline.
      // Fetched now, so the row is marked as written after the fact.
      const stage = await deps.readStage(hourMs - 3 * HOUR_MS, deadline);
      const tributaries = await tributarySeries(deps, hourMs - 12 * HOUR_MS, deadline, startMs, hours);
      const decision = decide({ release, index, hourMs, stage: stage ?? [], tributaries: tributaries ?? blank(), forward: true });
      const seenThrough = Math.min(Math.floor((deadline - startMs) / HOUR_MS) + 1, hours);
      context = {
        hourMs, index, startMs, release, received, decision, now, seenThrough,
        reasons: [why, ...decision.reasons],
        movementAtIssue: tributaries ? tributaryMovement(tributaries, decideIndex - RULE.tributaryHours, seenThrough) : null,
        stage: stage ?? [], tributaries: tributaries ?? [], reconstructed: true,
      };
    }

    const row = predictionRow(context);
    const saved = await deps.savePrediction(row);
    if (saved === 'error') summary.errors += 1;
    else if (saved === 'saved') {
      summary[row.decision] += 1;
      if (late) summary.reconciled += 1;
    }
  }

  // ── Watching live estimates ────────────────────────────────────────────────
  // While an estimate's water is still travelling, the same tributary window is
  // read again each hour. The first time it is seen past the limit is written
  // down then, so the log holds when Eddy knew, not when it could have known.
  const windowEnd = RULE.windowHours[1] * HOUR_MS;
  for (const row of logged) {
    const onsetMs = row.onsetHourMs + HOUR_MS / 2;
    if (row.decision !== 'issued' || row.hasWatchEvent || row.hasOutcome || now >= onsetMs + windowEnd) continue;
    const fromMs = row.onsetHourMs + (RULE.decideAfterHours - RULE.tributaryHours) * HOUR_MS;
    const span = Math.round((endMs - fromMs) / HOUR_MS) + 1;
    const tributaries = await tributarySeries(deps, fromMs, now, fromMs, span);
    const moved = tributaries ? tributaryMovement(tributaries, 0, span) : null;
    if (moved === null || moved <= RULE.maxTributaryRangeCfs) continue;
    const saved = await deps.saveWatchEvent({
      prediction_id: row.id,
      kind: 'tributaries moving',
      details: {
        range_cfs: moved,
        limit_cfs: RULE.maxTributaryRangeCfs,
        watched_from: iso(fromMs),
        hours_after_onset: (now - onsetMs) / HOUR_MS,
        tributaries: Object.fromEntries(TRIAL_SITES.tributarySiteIds.map((siteId, k) => [siteId, tributaries![k]])),
      },
    });
    if (saved === 'error') summary.errors += 1;
    else if (saved === 'saved') summary.watch_events += 1;
  }

  // ── Outcomes ───────────────────────────────────────────────────────────────
  const due = logged
    .filter((row) => !row.hasOutcome && now >= row.onsetHourMs + HOUR_MS / 2 + windowEnd + OUTCOME_GRACE_MS)
    .sort((a, b) => a.onsetHourMs - b.onsetHourMs);
  summary.outcomes_waiting = Math.max(due.length - MAX_OUTCOMES_PER_PASS, 0);

  for (const row of due.slice(0, MAX_OUTCOMES_PER_PASS)) {
    const onsetMs = row.onsetHourMs + HOUR_MS / 2;
    const gaveUp = now >= row.onsetHourMs + OUTCOME_GIVE_UP_MS;
    const samples = await deps.readStage(onsetMs - 6 * HOUR_MS, onsetMs + windowEnd + HOUR_MS / 2);
    const lastMs = samples?.length ? samples[samples.length - 1].t : null;
    const complete = lastMs !== null && lastMs >= onsetMs + windowEnd - HOUR_MS / 2;
    if (!complete && !gaveUp) {
      summary.outcomes_waiting += 1;
      continue;
    }

    let outcome: OutcomeRow;
    if (!samples || samples.length < 2) {
      outcome = {
        prediction_id: row.id,
        status: 'gauge data unavailable',
        first_rise_at: null,
        matched_rise_at: null,
        rise_candidates: 0,
        competing_increases: 0,
        steepest_rise_at: null,
        steepest_rise_ft_per_hour: null,
        tributary_watch_tripped_at: null,
        details: { gauge_samples: samples?.length ?? 0 },
      };
    } else {
      // Every detected increase competes for a rise, logged or not. Read around
      // this increase itself, so a row closed out late is judged the same way.
      const frameStart = row.onsetHourMs - FRAME_BEFORE_HOURS * HOUR_MS;
      const frameHours = FRAME_BEFORE_HOURS + RULE.windowHours[1] + 1;
      const frame = new Array<number | null>(frameHours).fill(null);
      for (const hour of await deps.readRelease(frameStart, frameStart + (frameHours - 1) * HOUR_MS)) {
        const k = Math.round((hour.hourMs - frameStart) / HOUR_MS);
        if (k >= 0 && k < frameHours && Number.isFinite(hour.cfs)) frame[k] = hour.cfs;
      }
      const onsets = detectStarts(frame).map((i) => frameStart + i * HOUR_MS + HOUR_MS / 2);
      if (!onsets.includes(onsetMs)) onsets.push(onsetMs);
      onsets.sort((x, y) => x - y);
      const match = matchOnsets(onsets, gaugeRises(samples))[onsets.indexOf(onsetMs)];
      const steepest = steepestRise(samples, onsetMs);
      const tributaries = await tributarySeries(
        deps,
        row.onsetHourMs - 12 * HOUR_MS,
        onsetMs + windowEnd,
        frameStart,
        frameHours
      );
      // Worked out afterwards from the full record. The watch event, if there
      // is one, is the record of when this was actually seen.
      const watch = tributaries ? tributaryWatchHours(tributaries, FRAME_BEFORE_HOURS) : null;
      const gap = gaugeGap(samples, onsetMs);
      const status: OutcomeStatus = gap ? 'gauge gap' : match.status === 'none' ? 'no rise found' : match.status;
      outcome = {
        prediction_id: row.id,
        status,
        first_rise_at: match.firstRiseMs === null ? null : iso(match.firstRiseMs),
        // A rise found beside a hole in the record is not a scored arrival.
        matched_rise_at: status === 'matched' && match.riseMs !== null ? iso(match.riseMs) : null,
        rise_candidates: match.candidates,
        competing_increases: match.claims,
        steepest_rise_at: steepest ? iso(steepest.atMs) : null,
        steepest_rise_ft_per_hour: steepest ? steepest.ftPerHour : null,
        tributary_watch_tripped_at: watch === null ? null : iso(onsetMs + watch * HOUR_MS),
        details: {
          gauge_samples: samples.length,
          last_sample_at: lastMs === null ? null : iso(lastMs),
          tributary_watch_available: tributaries !== null,
          // Predicted minus observed, the sign the studies use: positive is an early arrival.
          error_hours:
            row.predictedArrivalMs !== null && match.riseMs !== null && !gap
              ? (row.predictedArrivalMs - match.riseMs) / HOUR_MS
              : null,
        },
      };
    }
    const saved = await deps.saveOutcome(outcome);
    if (saved === 'error') summary.errors += 1;
    else if (saved === 'saved') summary.outcomes += 1;
  }

  // Last, so a pass that failed part-way leaves no mark and the next one
  // accounts for the hours it should have covered.
  const counts: Record<string, unknown> = { ...summary };
  delete counts.monitoring_status;
  const pass = await deps.savePass({
    rule_version: RULE_VERSION,
    state: 'active',
    release_through: releaseThrough === null ? null : iso(releaseThrough),
    summary: counts,
  });
  if (pass === 'error') summary.errors += 1;
  if (summary.errors > 0) summary.monitoring_status = 'partial';
  return summary;
}

/**
 * A deliberate pause still leaves a mark each hour, so the increases it skips
 * are filed as paused and not as an outage.
 */
export async function recordPause(deps: Pick<TrialDeps, 'savePass'>) {
  const saved = await deps.savePass({ rule_version: RULE_VERSION, state: 'paused', release_through: null, summary: {} });
  return saved === 'saved'
    ? { monitoring_status: 'skipped' as const, skipped: true, paused: true }
    : { monitoring_status: 'error' as const, paused: true, errors: 1 };
}
