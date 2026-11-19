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
import type { UpdateTarget } from '@/data/river-sections';
import type { RiverContext } from '@/lib/rivers/context';

/** One recorded generation the panel can replay. */
export interface TestSample {
  id: string;
  createdAt: string;
  riverSlug: string;
  sectionSlug: string | null;
  /** Display names as recorded with the attempt; the slugs when it kept none. */
  riverName: string;
  sectionName: string | null;
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
  /** inputs->target, selected on its own so the list never loads whole inputs. */
  target?: { riverName?: unknown; sectionName?: unknown } | null;
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
    const key = `${row.river_slug}/${row.section_slug ?? ''}`;
    if (latest.has(key)) continue;
    latest.set(key, {
      id: row.id,
      createdAt: row.created_at,
      riverSlug: row.river_slug,
      sectionSlug: row.section_slug,
      riverName: nonEmpty(row.target?.riverName) ?? row.river_slug,
      sectionName: row.section_slug ? nonEmpty(row.target?.sectionName) ?? row.section_slug : null,
      conditionCode: row.condition_code,
      conditionLabel: conditionLabel(row.condition_code),
      outcome: row.outcome,
      modelUsed: row.model_used,
    });
  }
  // Whole-river rows first within a river, then its sections by name.
  return Array.from(latest.values()).sort(
    (a, b) =>
      a.riverName.localeCompare(b.riverName) || (a.sectionName ?? '').localeCompare(b.sectionName ?? ''),
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
  const raw = text ? replaceEmDashes(text.trim()) : '';
  if (!raw) return { verdict: 'empty', reason: null, contradictions: [], incomplete: null, written: null };

  const prepared = prepareGeneratedReport(raw, facts, { finished });
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
