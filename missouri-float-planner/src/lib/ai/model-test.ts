// src/lib/ai/model-test.ts
// The admin test panel's rules: which recorded generations it offers, and how
// it judges what a model wrote for one of them.
//
// ── What a test is ─────────────────────────────────────────────────────────
//
// A replay. eddy_generation_log keeps the exact user prompt and the structured
// facts for every river Read the generator attempted. The panel sends that
// same prompt, with today's system prompt, to a model the operator picks, and
// runs the answer through the same guard production runs
// (prepareGeneratedReport). So the verdict shown is the one production would
// have reached for that text, on water that really happened.
//
// It publishes nothing and writes nothing. That is the whole reason a model
// that is not approved may be called here: this is how its output gets read
// before anyone approves it.
//
// Pure on purpose. The route does the reading and the calling; everything a
// test could get wrong is in here, where it can be tested without a model.

import { parseEddyResponse, replaceEmDashes, stripEddyMarkers, type ParsedEddyResponse } from '@/lib/eddy/parse-response';
import { prepareGeneratedReport, type ReportFacts, type ReportFallbackReason } from '@/lib/eddy/report-facts';
import { CONDITION_SYSTEM } from '@shared/condition-system';

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
 * What the guard decided about a model's text.
 * - `passed`: production would publish the model's own words.
 * - `replaced`: production would publish the code-written factual report
 *   instead, for the reason given.
 * - `empty`: the model returned no text.
 */
export type TestVerdict = 'passed' | 'replaced' | 'empty';

export interface ReportEvaluation {
  verdict: TestVerdict;
  /** Why the guard replaced the text. Null unless `replaced`. */
  reason: ReportFallbackReason | null;
  contradictions: string[];
  /**
   * What the model wrote, parsed into its three blocks. Kept when the guard
   * replaces it, because a replaced report is exactly the one worth reading.
   */
  written: ParsedEddyResponse | null;
}

/** Applies production's cleanup and guard to a model's raw text. */
export function evaluateRiverReport(text: string | null, facts: ReportFacts): ReportEvaluation {
  const raw = text ? replaceEmDashes(text.trim()) : '';
  if (!raw) return { verdict: 'empty', reason: null, contradictions: [], written: null };

  const { usedFallback, fallbackReason, contradictions } = prepareGeneratedReport(raw, facts);
  // Parsed the way the guard parses it: without the [CLAIMS] line, which is a
  // structured claim for the guard and never part of the published text.
  const parsed = parseEddyResponse(
    raw.split(/\r?\n/).filter((line) => !/\[CLAIMS\]/i.test(line)).join('\n'),
  );
  return {
    verdict: usedFallback ? 'replaced' : 'passed',
    reason: fallbackReason,
    contradictions,
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
