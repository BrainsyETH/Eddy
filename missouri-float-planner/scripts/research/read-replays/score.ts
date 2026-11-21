// scripts/research/read-replays/score.ts
// Scores a set of Read outputs on the saved mornings with the rules in
// src/lib/eddy/read-checks.ts, and counts the fallbacks beside them.
//
// WHY FALLBACKS ARE COUNTED HERE. scripts/report-eddy-reads.ts scores only
// model-written Reads (outcome = 'model'). Its pass rate can therefore rise
// because more Reads fell back to the code-written report, which is short,
// plain and passes nearly every rule. A before/after comparison on this set
// must not be able to look better that way, so every output is counted:
//
//   all     every published text, the code-written fallback included
//   model   model-written text only (what report-eddy-reads.ts shows)
//   strict  model-written passes over every morning the rule could judge,
//           with each fallback or error counted as a miss. Falling back more
//           can only lower it.
//
// Pure: outputs in, numbers and text out. score-set.ts does the file reading.

import { checkRead, READ_CHECK_IDS, READ_CHECK_LABELS, type ReadCheckId, type ReadCheckResult } from '../../../src/lib/eddy/read-checks';

export type ReplayWorkload = 'river_update' | 'gauge_update';

/**
 * How a morning ended. The generation log's own outcomes:
 * `model` published the model's text, `fallback` published the code-written
 * report, `error` published nothing (the previous Read stayed up).
 */
export type ReplayOutcome = 'model' | 'fallback' | 'error';

export interface PublishedText {
  summaryText: string | null;
  eddyRead: string | null;
  quoteText: string | null;
}

/** One morning's output, from the stored record or from a replay. */
export interface ReplayOutput {
  /** The morning's key in mornings/. */
  key: string;
  workload: ReplayWorkload;
  outcome: ReplayOutcome;
  /** Why it fell back or failed: a preflight, guard or error reason. Null for `model`. */
  reason: string | null;
  /** What readers got. Null for `error`. */
  published: PublishedText | null;
  /** The user message sent, for the two number rules. Null when none was built. */
  prompt: string | null;
}

export interface Tally {
  pass: number;
  /** Outputs the rule judged (not skipped). */
  checked: number;
}

export interface StrictTally {
  /** Model-written outputs that passed. */
  pass: number;
  /** Model-written outputs the rule judged, plus every fallback and error. */
  of: number;
}

export interface RuleScore {
  all: Tally;
  model: Tally;
  strict: StrictTally;
}

export interface ScoredOutput {
  key: string;
  workload: ReplayWorkload;
  outcome: ReplayOutcome;
  reason: string | null;
  /** Empty for an `error`, which published nothing to check. */
  results: ReadCheckResult[];
}

export interface SetScore {
  total: number;
  outcomes: Record<ReplayOutcome, number>;
  /** `fallback:no_rating`, `error:empty_response`, ... */
  reasons: Record<string, number>;
  rules: Record<ReadCheckId, RuleScore>;
  outputs: ScoredOutput[];
}

const emptyTally = (): Tally => ({ pass: 0, checked: 0 });

/** The rules' verdicts on one output. */
export function scoreOutput(output: ReplayOutput): ScoredOutput {
  const results = output.published
    ? checkRead(
        { summary: output.published.summaryText, eddyRead: output.published.eddyRead, full: output.published.quoteText },
        { prompt: output.prompt },
      )
    : [];
  return { key: output.key, workload: output.workload, outcome: output.outcome, reason: output.reason, results };
}

export function scoreOutputs(outputs: readonly ReplayOutput[]): SetScore {
  const scored = outputs.map(scoreOutput);
  const outcomes: Record<ReplayOutcome, number> = { model: 0, fallback: 0, error: 0 };
  const reasons: Record<string, number> = {};
  const rules = Object.fromEntries(
    READ_CHECK_IDS.map((id) => [id, { all: emptyTally(), model: emptyTally(), strict: { pass: 0, of: 0 } }]),
  ) as Record<ReadCheckId, RuleScore>;

  for (const output of scored) {
    outcomes[output.outcome]++;
    if (output.outcome !== 'model') {
      const reason = `${output.outcome}:${output.reason ?? 'unknown'}`;
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
    for (const id of READ_CHECK_IDS) {
      const result = output.results.find((r) => r.id === id);
      const rule = rules[id];
      if (output.outcome !== 'model') {
        // A morning the model did not write is a miss for strict, whatever
        // the code-written text would score.
        rule.strict.of++;
      }
      if (!result || result.status === 'skip') continue;
      const passed = result.status === 'pass';
      rule.all.checked++;
      if (passed) rule.all.pass++;
      if (output.outcome === 'model') {
        rule.model.checked++;
        rule.strict.of++;
        if (passed) {
          rule.model.pass++;
          rule.strict.pass++;
        }
      }
    }
  }
  return { total: scored.length, outcomes, reasons, rules, outputs: scored };
}

const percent = (pass: number, of: number) => (of ? `${Math.round((pass / of) * 100)}%` : '-');
const cell = (pass: number, of: number) => (of ? `${percent(pass, of)} ${pass}/${of}` : '-');

function columns(rows: string[][]): string[] {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  return rows.map((row) => `  ${row.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('   ')}`.trimEnd());
}

function outcomeLines(score: SetScore): string[] {
  const { model, fallback, error } = score.outcomes;
  const lines = [`Outputs: ${score.total}. Model-written ${model}, fallback ${fallback}, error ${error}.`];
  const reasons = Object.entries(score.reasons).sort(([a], [b]) => a.localeCompare(b));
  if (reasons.length) lines.push(`Not model-written: ${reasons.map(([reason, n]) => `${reason} ${n}`).join(', ')}.`);
  return lines;
}

/** The score as a table a person can read, one line per rule. */
export function formatScore(score: SetScore, title: string): string {
  const out = [title, ...outcomeLines(score), ''];
  const head = ['rule', 'all outputs', 'model-written', 'strict'];
  const body = READ_CHECK_IDS.map((id) => {
    const r = score.rules[id];
    return [id, cell(r.all.pass, r.all.checked), cell(r.model.pass, r.model.checked), cell(r.strict.pass, r.strict.of)];
  });
  out.push(...columns([head, ...body]));
  out.push('');
  out.push('  all: every published text, fallback included. model-written: what report-eddy-reads.ts counts.');
  out.push('  strict: model-written passes over every morning judged, each fallback or error a miss.');
  out.push('');
  out.push('Rules:');
  for (const id of READ_CHECK_IDS) out.push(`  ${id}: ${READ_CHECK_LABELS[id]}`);
  out.push('');
  out.push('Per morning (failed rules):');
  for (const o of score.outputs) {
    const failed = o.results.filter((r) => r.status === 'fail');
    const tag = o.outcome === 'model' ? 'model' : `${o.outcome}:${o.reason ?? 'unknown'}`;
    out.push(`  ${o.key} [${tag}]${failed.length ? '' : ' none'}`);
    for (const f of failed) out.push(`      ${f.id}: ${f.detail ?? ''}`.trimEnd());
  }
  return out.join('\n');
}

/**
 * Before and after on the mornings both sets hold. A morning only one side
 * has (a derived morning has no stored original) is listed, not scored, so
 * neither side's numbers include water the other was not asked about.
 */
export function compareOutputs(
  before: readonly ReplayOutput[],
  after: readonly ReplayOutput[],
  labels: { before: string; after: string },
): string {
  const afterKeys = new Set(after.map((o) => o.key));
  const beforeKeys = new Set(before.map((o) => o.key));
  const shared = [...beforeKeys].filter((key) => afterKeys.has(key)).sort();
  const pick = (outputs: readonly ReplayOutput[]) =>
    shared.map((key) => outputs.find((o) => o.key === key)!);
  const b = scoreOutputs(pick(before));
  const a = scoreOutputs(pick(after));

  const out = [`Before: ${labels.before}`, `After:  ${labels.after}`, `Mornings in both: ${shared.length}.`];
  const onlyBefore = [...beforeKeys].filter((key) => !afterKeys.has(key)).sort();
  const onlyAfter = [...afterKeys].filter((key) => !beforeKeys.has(key)).sort();
  if (onlyBefore.length) out.push(`Only before (not scored): ${onlyBefore.join(', ')}`);
  if (onlyAfter.length) out.push(`Only after (not scored): ${onlyAfter.join(', ')}`);
  out.push('');
  out.push(`Before. ${outcomeLines(b).join(' ')}`);
  out.push(`After.  ${outcomeLines(a).join(' ')}`);
  out.push('');
  const head = ['rule', 'strict before', 'strict after', 'model before', 'model after', 'all before', 'all after'];
  const body = READ_CHECK_IDS.map((id) => {
    const x = b.rules[id];
    const y = a.rules[id];
    return [
      id,
      cell(x.strict.pass, x.strict.of), cell(y.strict.pass, y.strict.of),
      cell(x.model.pass, x.model.checked), cell(y.model.pass, y.model.checked),
      cell(x.all.pass, x.all.checked), cell(y.all.pass, y.all.checked),
    ];
  });
  out.push(...columns([head, ...body]));

  const moved = shared.flatMap((key) => {
    const x = b.outputs.find((o) => o.key === key)!;
    const y = a.outputs.find((o) => o.key === key)!;
    const tag = (o: ScoredOutput) => (o.outcome === 'model' ? 'model' : `${o.outcome}:${o.reason ?? 'unknown'}`);
    return tag(x) === tag(y) ? [] : [`  ${key}: ${tag(x)} -> ${tag(y)}`];
  });
  out.push('');
  out.push(moved.length ? 'Outcome changed:' : 'No morning changed outcome.');
  out.push(...moved);
  return out.join('\n');
}
