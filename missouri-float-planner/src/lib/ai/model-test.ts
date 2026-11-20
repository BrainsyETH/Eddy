// src/lib/ai/model-test.ts
// The admin test panel's rules: which recorded generations it offers, and how
// it judges what a model wrote for one of them.
//
// ── What a test is ─────────────────────────────────────────────────────────
//
// A replay. eddy_generation_log keeps the exact user prompt and the structured
// facts for every river Read the generator attempted. The panel sends that
// same prompt, with today's system prompt, to a model the operator picks, and
// runs the answer through the same automated checks production runs
// (prepareGeneratedReport). So the verdict shown is the one production would
// have reached for that text, on water that really happened. It is a verdict
// on those checks, not on the report: see TestVerdict.
//
// It publishes nothing and writes nothing. That is the whole reason a model
// that is not approved may be called here: this is how its output gets read
// before anyone approves it.
//
// Pure on purpose. The route does the reading and the calling; everything a
// test could get wrong is in here, where it can be tested without a model.

import { parseEddyResponse, replaceEmDashes, stripEddyMarkers, type ParsedEddyResponse } from '@/lib/eddy/parse-response';
import { prepareGeneratedReport, type IncompleteReason, type ReportFacts, type ReportFallbackReason } from '@/lib/eddy/report-facts';
import { CONDITION_SYSTEM } from '@shared/condition-system';
import { buildPrompt } from '@/lib/eddy/build-update-prompt';
import { buildGaugePrompt } from '@/lib/eddy/build-gauge-prompt';
import type { UpdateTarget } from '@/data/river-sections';
import type { RiverContext } from '@/lib/rivers/context';

/**
 * The two Reads the panel can replay. Both are recorded in
 * eddy_generation_log with their inputs; the statewide summary and social
 * captions are not.
 */
export const TEST_WORKLOADS = ['river_update', 'gauge_update'] as const;
export type TestWorkload = (typeof TEST_WORKLOADS)[number];

export function isTestWorkload(value: unknown): value is TestWorkload {
  return (TEST_WORKLOADS as readonly unknown[]).includes(value);
}

/** One recorded generation the panel can replay. */
export interface TestSample {
  id: string;
  createdAt: string;
  workload: TestWorkload;
  riverSlug: string;
  sectionSlug: string | null;
  /** Display names as recorded with the attempt; the slugs when it kept none. */
  riverName: string;
  sectionName: string | null;
  /** A gauge Read's station, as USGS names it. Null for a river Read. */
  gaugeName: string | null;
  conditionCode: string;
  /** Eddy's own label for the condition, such as "Too Low". */
  conditionLabel: string;
  /** How the recorded attempt ended: `model`, `fallback` or `error`. */
  outcome: string;
  modelUsed: string | null;
}

/** The eddy_generation_log columns a sample is built from. */
export interface SampleRow {
  id: string;
  created_at: string;
  river_slug: string;
  section_slug: string | null;
  condition_code: string;
  outcome: string;
  model_used: string | null;
  /** Absent on rows read before the panel replayed gauge Reads: a river Read. */
  workload?: string | null;
  usgs_site_id?: string | null;
  /** inputs->target, selected on its own so the list never loads whole inputs. */
  target?: { riverName?: unknown; sectionName?: unknown; gaugeName?: unknown } | null;
}

/** The shared condition system's label, or the code itself for one it does not know. */
export function conditionLabel(code: string): string {
  return (CONDITION_SYSTEM as Record<string, { label: string } | undefined>)[code]?.label ?? code;
}

const nonEmpty = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/**
 * The newest recorded generation for each river or section, in a stable order
 * a person can scan. Rows arrive newest first. One per target because the
 * picker is for choosing WHICH water to test on, and forty rows of the same
 * river on different mornings would bury the rest.
 */
export function latestPerTarget(rows: SampleRow[]): TestSample[] {
  const latest = new Map<string, TestSample>();
  for (const row of rows) {
    const workload: TestWorkload = row.workload === 'gauge_update' ? 'gauge_update' : 'river_update';
    // A gauge Read's target is its station. A river Read's is the river or
    // section, whichever gauge it was written from that morning.
    const key = workload === 'gauge_update'
      ? `gauge/${row.river_slug}/${row.usgs_site_id ?? ''}`
      : `${row.river_slug}/${row.section_slug ?? ''}`;
    if (latest.has(key)) continue;
    latest.set(key, {
      id: row.id,
      createdAt: row.created_at,
      workload,
      riverSlug: row.river_slug,
      sectionSlug: row.section_slug,
      riverName: nonEmpty(row.target?.riverName) ?? row.river_slug,
      sectionName: row.section_slug ? nonEmpty(row.target?.sectionName) ?? row.section_slug : null,
      gaugeName: workload === 'gauge_update' ? nonEmpty(row.target?.gaugeName) ?? row.usgs_site_id ?? null : null,
      conditionCode: row.condition_code,
      conditionLabel: conditionLabel(row.condition_code),
      outcome: row.outcome,
      modelUsed: row.model_used,
    });
  }
  // Whole-river rows first within a river, then its sections or gauges by name.
  const within = (sample: TestSample) => sample.sectionName ?? sample.gaugeName ?? '';
  return Array.from(latest.values()).sort(
    (a, b) => a.riverName.localeCompare(b.riverName) || within(a).localeCompare(within(b)),
  );
}

/**
 * What production's automated checks decided about a model's text.
 * - `passed`: production would publish the model's own words.
 * - `incomplete`: the response did not finish, or lacks a report block.
 *   Production would not publish it: it retries on the fallback model when
 *   there is one, and otherwise publishes the code-written report.
 * - `replaced`: production would publish the code-written report instead,
 *   because the text contradicts the gauge or its claims line is wrong.
 * - `empty`: the model returned no text.
 *
 * ── What `passed` does not mean ───────────────────────────────────────────
 *
 * That the report is true. The checks are narrow on purpose: the condition
 * label, the measurement and the optimal-range comparison against the gauge
 * facts, plus completeness. An invented landmark, a wrong forecast or bad
 * advice passes all of them. Whether local detail is supported, whether the
 * report stays on its own stretch, and whether it sounds like Eddy are read by
 * a person, which is what the panel is for.
 */
export type TestVerdict = 'passed' | 'incomplete' | 'replaced' | 'empty';

export interface ReportEvaluation {
  verdict: TestVerdict;
  /** Why the text would not be published as written. Null when it would. */
  reason: ReportFallbackReason | null;
  contradictions: string[];
  /** Set exactly when the verdict is `incomplete`. */
  incomplete: IncompleteReason | null;
  /**
   * What the model wrote, parsed into its blocks. Kept whatever the verdict,
   * because a rejected or partial report is exactly the one worth reading. A
   * block the model never reached is null or empty.
   */
  written: ParsedEddyResponse | null;
}

/**
 * Applies production's cleanup and checks to a model's raw text. `finished` is
 * whether the model completed its response; a report from one that did not is
 * incomplete however whole it looks.
 */
export function evaluateRiverReport(text: string | null, facts: ReportFacts, finished: boolean): ReportEvaluation {
  return evaluateReport(text, facts, finished, 'river_update');
}

/**
 * The same, for either Read, as that Read's generator judges it.
 *
 * A river Read must have finished AND hold all three blocks. A gauge Read is
 * not required to hold all three (generate-gauge-update.ts: about three in ten
 * stored rows lacked one when that was decided), so a finished gauge Read with
 * a block missing passes here as it does in production. One that did not
 * finish is `incomplete` for both: production refuses it while another model
 * is waiting, and text cut off at the output cap can end anywhere.
 */
export function evaluateReport(text: string | null, facts: ReportFacts, finished: boolean, workload: TestWorkload): ReportEvaluation {
  const raw = text ? replaceEmDashes(text.trim()) : '';
  if (!raw) return { verdict: 'empty', reason: null, contradictions: [], incomplete: null, written: null };

  const guarded = prepareGeneratedReport(raw, facts, workload === 'river_update' ? { finished } : {});
  const prepared = workload === 'gauge_update' && !finished ? { ...guarded, incomplete: 'cut_off' as const } : guarded;
  // A wrong claims line is rejected before anything is parsed, so parse it
  // here the way the guard would have: without the [CLAIMS] line, which is a
  // structured claim for the guard and never part of the published text.
  const parsed =
    prepared.written ??
    parseEddyResponse(raw.split(/\r?\n/).filter((line) => !/\[CLAIMS\]/i.test(line)).join('\n'));
  return {
    verdict: prepared.incomplete ? 'incomplete' : prepared.usedFallback ? 'replaced' : 'passed',
    reason: prepared.fallbackReason,
    contradictions: prepared.contradictions,
    incomplete: prepared.incomplete,
    written: {
      summaryText: parsed.summaryText ? stripEddyMarkers(parsed.summaryText) : null,
      eddyRead: parsed.eddyRead ? stripEddyMarkers(parsed.eddyRead) : null,
      quoteText: stripEddyMarkers(parsed.quoteText),
    },
  };
}

/**
 * The facts a recorded generation was judged against, or null when the row
 * does not hold them. Checked rather than cast: the column is jsonb, and a
 * guard run on a malformed object would report a verdict about nothing.
 */
export function recordedFacts(inputs: unknown): ReportFacts | null {
  if (!inputs || typeof inputs !== 'object') return null;
  const facts = (inputs as { facts?: unknown }).facts;
  if (!facts || typeof facts !== 'object') return null;
  const f = facts as Record<string, unknown>;
  if (typeof f.conditionCode !== 'string' || !f.thresholds || typeof f.thresholds !== 'object') return null;
  return facts as ReportFacts;
}

/** The published text a recorded generation holds, or null. */
export function recordedReport(published: unknown): ParsedEddyResponse | null {
  if (!published || typeof published !== 'object') return null;
  const p = published as Record<string, unknown>;
  if (typeof p.quoteText !== 'string') return null;
  return {
    summaryText: typeof p.summaryText === 'string' ? p.summaryText : null,
    eddyRead: typeof p.eddyRead === 'string' ? p.eddyRead : null,
    quoteText: p.quoteText,
  };
}

/**
 * The user message today's prompt builder would write for a recorded morning,
 * or null when the record does not hold enough to build one.
 *
 * WHY REBUILD. A replay used to resend the recorded user message under today's
 * system prompt. That tests a change to the system prompt and nothing else:
 * the recorded message still holds whatever the builder handed over that
 * morning. A change to the inputs (which trend lines are supplied, the float
 * ladder, which knowledge a gauge is given) could not be read before it
 * shipped. The record keeps the structured inputs, so the message can be built
 * again from the same water with today's builder and today's knowledge file.
 *
 * `createdAt` stands in for "now", so the date line and the stale-reading
 * warning describe the recorded morning and not the day of the test.
 *
 * The river context is today's when the caller could load it, and otherwise
 * the part of it the record kept (which has no region).
 */
export function rebuildUserPrompt(
  inputs: unknown,
  options: { createdAt: string; riverCtx: RiverContext | null; localKnowledge: string },
): string | null {
  const facts = recordedFacts(inputs);
  if (!facts) return null;
  const recorded = inputs as Record<string, unknown>;
  const target = recorded.target as Partial<UpdateTarget> | null | undefined;
  if (!target || typeof target.riverSlug !== 'string' || typeof target.riverName !== 'string') return null;
  const now = new Date(options.createdAt);
  if (Number.isNaN(now.getTime())) return null;
  const or = <T>(value: unknown, fallback: T): T => (value == null ? fallback : (value as T));
  return buildPrompt(
    {
      riverSlug: target.riverSlug,
      riverName: target.riverName,
      sectionSlug: target.sectionSlug ?? null,
      sectionName: target.sectionName ?? null,
      sectionDescription: target.sectionDescription ?? null,
      sectionRiverType: target.sectionRiverType ?? null,
      sectionLowWaterMeaning: target.sectionLowWaterMeaning ?? null,
      sectionRisingWaterHazards: target.sectionRisingWaterHazards ?? null,
    },
    {
      facts,
      readingTimestamp: nonEmpty(recorded.readingTimestamp),
      notes: nonEmpty(recorded.gaugeNotes),
    },
    or(recorded.weather, null),
    or(recorded.forecast, null),
    Array.isArray(recorded.alerts) ? (recorded.alerts as never[]) : [],
    options.localKnowledge,
    or(recorded.trajectory, null),
    or(recorded.precipitation, null),
    options.riverCtx ?? or<RiverContext | null>(recorded.river, null),
    now,
  );
}

/**
 * The same for a recorded gauge Read: today's gauge message builder over the
 * recorded station, facts, trend and forecast, with the knowledge today's file
 * gives that station. A gauge record keeps no river context, so the caller
 * loads today's; without one the builder writes its neutral guidance, as the
 * generator does when the lookup fails.
 */
export function rebuildGaugePrompt(
  inputs: unknown,
  options: { createdAt: string; riverCtx: RiverContext | null; riverKnowledge: string },
): string | null {
  const facts = recordedFacts(inputs);
  if (!facts) return null;
  const recorded = inputs as Record<string, unknown>;
  const target = recorded.target as { gaugeName?: unknown; riverName?: unknown } | null | undefined;
  const gaugeName = nonEmpty(target?.gaugeName);
  const riverName = nonEmpty(target?.riverName);
  if (!gaugeName || !riverName) return null;
  const now = new Date(options.createdAt);
  if (Number.isNaN(now.getTime())) return null;
  return buildGaugePrompt({
    target: { gaugeName, riverName },
    facts,
    readingTimestamp: nonEmpty(recorded.readingTimestamp),
    trajectory: (recorded.trajectory ?? null) as never,
    forecast: (recorded.forecast ?? null) as never,
    riverCtx: options.riverCtx,
    // Recorded as decided that morning. Anything but a recorded `true` gets
    // the neutral guidance, which is the generator's own rule.
    riverBehaviorApplies: recorded.riverBehaviorApplies === true,
    riverKnowledge: options.riverKnowledge,
    now,
  });
}
