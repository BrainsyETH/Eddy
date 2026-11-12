// src/lib/arrival-trial/run.ts
// One pass of the release-arrival trial: decide on new increases, then read
// the outcome of old ones.
//
// The log is only worth having if every estimate is written before the river
// can answer it. So this pass never revisits a decision: a row is written
// once, from the readings in hand at that moment, and the outcome goes in a
// separate row a day later. An estimate that cannot be written before the
// arrival window opens is recorded as withheld, with the lateness as its
// reason, rather than back-dated.
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
  tributaryWatchHours,
  type Decision,
  type Sample,
  type WithholdReason,
} from './rule';

/** Hours of release record read on every pass. */
export const RELEASE_WINDOW_HOURS = 96;
/** How far back an unlogged increase is still worth a row. */
export const LOG_LOOKBACK_HOURS = 30;
/** An estimate must be written this long before the arrival window opens. */
export const ISSUE_MARGIN_MS = 10 * 60_000;
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
export type ForwardReason = 'release data arrived too late' | 'decided too late';
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

export interface TrialDeps {
  now: number;
  readRelease(fromMs: number, toMs: number): Promise<ReleaseHour[]>;
  /** Gauge height near Norfork. Null when the request failed. */
  readStage(fromMs: number, toMs: number): Promise<Sample[] | null>;
  /** Tributary discharge. Null when the request failed. */
  readTributary(siteId: string, fromMs: number, toMs: number): Promise<Sample[] | null>;
  loggedSince(fromMs: number): Promise<LoggedIncrease[]>;
  savePrediction(row: PredictionRow): Promise<'saved' | 'duplicate' | 'error'>;
  saveOutcome(row: OutcomeRow): Promise<'saved' | 'duplicate' | 'error'>;
}

export interface TrialSummary {
  monitoring_status: 'ok';
  release_hours: number;
  detected: number;
  waiting: number;
  issued: number;
  withheld: number;
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

function predictionRow(
  hourMs: number,
  decision: Decision,
  release: Array<number | null>,
  received: Array<number | null>,
  index: number,
  startMs: number,
  stage: Sample[],
  tributaries: Array<Array<number | null>>,
  now: number,
  forced: ForwardReason | null
): PredictionRow {
  const reasons: LoggedReason[] = forced ? [forced, ...decision.reasons] : decision.reasons;
  const issued = reasons.length === 0;
  const arrival = decision.estimateHours === null ? null : decision.onsetMs + decision.estimateHours * HOUR_MS;
  const from = Math.max(index - RULE.priorStepHours, 0);
  const to = Math.min(index + RULE.decideAfterHours, release.length);
  const firstThree = received.slice(index, to).filter((v): v is number => v !== null);
  const flags: string[] = [];
  if (decision.earlierReleaseInTransit) flags.push('earlier release in transit');
  return {
    dam_id: TRIAL_SITES.damId,
    gauge_site_id: TRIAL_SITES.gaugeSiteId,
    onset_hour: iso(hourMs),
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
      tributary_range_cfs: decision.tributaryRangeCfs,
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
      stage_samples: stage
        .filter((s) => s.t >= decision.onsetMs - 1.5 * HOUR_MS && s.t < decision.onsetMs - 0.5 * HOUR_MS)
        .map((s) => ({ at: iso(s.t), ft: s.v })),
      tributaries: Object.fromEntries(
        TRIAL_SITES.tributarySiteIds.map((siteId, k) => [
          siteId,
          (tributaries[k] ?? []).slice(Math.max(to - RULE.tributaryHours, 0), to),
        ])
      ),
      release_complete_at: firstThree.length ? iso(Math.max(...firstThree)) : null,
      minutes_after_third_hour: Math.round((now - (hourMs + RULE.decideAfterHours * HOUR_MS)) / 60_000),
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
    outcomes: 0,
    outcomes_waiting: 0,
    errors: 0,
  };

  // A dense hourly array ending at the current hour, so index maths is plain.
  const endMs = floorHour(now);
  const startMs = endMs - RELEASE_WINDOW_HOURS * HOUR_MS;
  const hours = RELEASE_WINDOW_HOURS + 1;
  const release = new Array<number | null>(hours).fill(null);
  const received = new Array<number | null>(hours).fill(null);
  for (const row of await deps.readRelease(startMs, endMs)) {
    const k = Math.round((row.hourMs - startMs) / HOUR_MS);
    if (k < 0 || k >= hours || !Number.isFinite(row.cfs)) continue;
    release[k] = row.cfs;
    received[k] = row.receivedAtMs;
    summary.release_hours += 1;
  }
  const starts = detectStarts(release);
  // Reaches past the release window so a row that missed its outcome while
  // the job was down is still closed out.
  const logged = await deps.loggedSince(endMs - OUTCOME_LOOKBACK_HOURS * HOUR_MS);
  const known = new Set(logged.map((row) => row.onsetHourMs));

  // ── Decisions ──────────────────────────────────────────────────────────────
  for (const index of starts) {
    const hourMs = startMs + index * HOUR_MS;
    if (hourMs < now - LOG_LOOKBACK_HOURS * HOUR_MS || known.has(hourMs)) continue;
    summary.detected += 1;

    const deadline = issueDeadline(hourMs);
    const late = now > deadline;
    const inHand = release.slice(index, index + RULE.decideAfterHours).every((v) => v !== null);
    if (!inHand && !late) {
      summary.waiting += 1;
      continue;
    }

    const stage = await deps.readStage(hourMs - 3 * HOUR_MS, now);
    const tributaries = await tributarySeries(deps, hourMs - 12 * HOUR_MS, now, startMs, hours);
    // A failed request is not a missing reading. Try again next hour while an
    // estimate could still be written in time.
    if ((!stage || !tributaries) && !late && now + HOUR_MS <= deadline) {
      summary.waiting += 1;
      continue;
    }

    const decision = decide({
      release,
      index,
      hourMs,
      stage: stage ?? [],
      tributaries: tributaries ?? TRIAL_SITES.tributarySiteIds.map(() => new Array<number | null>(hours).fill(null)),
      forward: true,
    });
    const forced: ForwardReason | null = late ? (inHand ? 'decided too late' : 'release data arrived too late') : null;
    const row = predictionRow(hourMs, decision, release, received, index, startMs, stage ?? [], tributaries ?? [], now, forced);
    const saved = await deps.savePrediction(row);
    if (saved === 'error') summary.errors += 1;
    else if (saved === 'saved') summary[row.decision] += 1;
  }

  // ── Outcomes ───────────────────────────────────────────────────────────────
  const windowEnd = RULE.windowHours[1] * HOUR_MS;
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

  return summary;
}
