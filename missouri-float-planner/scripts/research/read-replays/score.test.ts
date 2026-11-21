import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { compareOutputs, formatScore, scoreOutputs, type ReplayOutput } from './score';
import { loadMornings, MORNINGS_DIR, RESULTS_DIR, storedOutputs } from './set';

const PROMPT = 'Rating measurement: discharge; value: 120 cfs.';
const clean = { summaryText: 'Floatable with some dragging.', eddyRead: 'Riffles are bony; plan on walking a few.', quoteText: 'Floatable today with some dragging over riffles.' };
const numbered = { ...clean, eddyRead: 'At 120 cfs the riffles are bony.' };
const fallbackText = { summaryText: 'Low.', eddyRead: 'Low today.', quoteText: 'Low today.' };

const output = (key: string, outcome: ReplayOutput['outcome'], published: ReplayOutput['published'], reason: string | null = null): ReplayOutput => ({
  key, workload: 'river_update', outcome, reason, published, prompt: outcome === 'error' ? null : PROMPT,
});

test('every output is counted, and fallbacks are tallied by reason', () => {
  const score = scoreOutputs([
    output('a', 'model', clean),
    output('b', 'fallback', fallbackText, 'contradiction'),
    output('c', 'fallback', fallbackText, 'no_rating'),
    output('d', 'error', null, 'empty_response'),
  ]);
  assert.equal(score.total, 4);
  assert.deepEqual(score.outcomes, { model: 1, fallback: 2, error: 1 });
  assert.deepEqual(score.reasons, { 'fallback:contradiction': 1, 'fallback:no_rating': 1, 'error:empty_response': 1 });
  // An error published nothing, so there is nothing to check.
  assert.deepEqual(score.outputs.find((o) => o.key === 'd')!.results, []);
  // all: the model's text and both fallback texts. model: the model's only.
  // strict: the model's pass over all four mornings.
  assert.deepEqual(score.rules.read_measurements, { all: { pass: 3, checked: 3 }, model: { pass: 1, checked: 1 }, strict: { pass: 1, of: 4 } });
});

test('falling back on a failing morning cannot raise the strict rate', () => {
  const before = scoreOutputs([output('a', 'model', clean), output('b', 'model', numbered)]);
  // The same two mornings, the failing one now replaced by the code-written report.
  const after = scoreOutputs([output('a', 'model', clean), output('b', 'fallback', fallbackText, 'contradiction')]);
  const rate = (t: { pass: number; checked?: number; of?: number }) => t.pass / (t.checked ?? t.of!);
  assert.equal(rate(before.rules.read_measurements.model), 0.5);
  // The two views that would reward it do improve...
  assert.equal(rate(after.rules.read_measurements.model), 1);
  assert.equal(rate(after.rules.read_measurements.all), 1);
  // ...and strict does not.
  assert.equal(rate(after.rules.read_measurements.strict), 0.5);
  assert.equal(after.outcomes.fallback, 1);
});

test('a rule with nothing to judge is skipped, not passed', () => {
  const score = scoreOutputs([{ ...output('a', 'model', clean), prompt: null }]);
  assert.deepEqual(score.rules.numbers_match_inputs, { all: { pass: 0, checked: 0 }, model: { pass: 0, checked: 0 }, strict: { pass: 0, of: 0 } });
  assert.match(formatScore(score, 'T'), /numbers_match_inputs\s+-\s+-\s+-\n/);
});

test('the report names the fallbacks and each failed rule', () => {
  const text = formatScore(scoreOutputs([output('a', 'model', numbered), output('b', 'fallback', fallbackText, 'no_gauge')]), 'Title');
  assert.match(text, /Model-written 1, fallback 1, error 0\./);
  assert.match(text, /Not model-written: fallback:no_gauge 1\./);
  assert.match(text, /a \[model\]\n\s+read_measurements: 120 cfs/);
  assert.match(text, /b \[fallback:no_gauge\]/);
});

test('a comparison scores only the mornings both sides hold, and lists outcome changes', () => {
  const before = [output('a', 'model', clean), output('b', 'model', numbered)];
  const after = [output('a', 'model', clean), output('b', 'fallback', fallbackText, 'contradiction'), output('d01', 'model', clean)];
  const text = compareOutputs(before, after, { before: 'stored', after: 'replay' });
  assert.match(text, /Mornings in both: 2\./);
  assert.match(text, /Only after \(not scored\): d01/);
  assert.match(text, /b: model -> fallback:contradiction/);
  const row = text.split('\n').find((line) => line.trim().startsWith('read_measurements'))!.trim().split(/\s{3,}/);
  // strict before, strict after, model before, model after
  assert.deepEqual(row.slice(1, 5), ['50% 1/2', '50% 1/2', '50% 1/2', '100% 1/1']);
});

// ─── The saved set itself ──────────────────────────────────────────────────

const mornings = loadMornings();

test('every saved morning is named for its file and holds what a replay needs', () => {
  assert.deepEqual(mornings.map((m) => `${m.key}.json`), readdirSync(MORNINGS_DIR).filter((n) => n.endsWith('.json')).sort());
  for (const m of mornings) {
    const r = m.record;
    assert.ok(m.why.trim(), m.key);
    assert.ok(r.inputs && typeof r.inputs === 'object' && (r.inputs as { facts?: unknown }).facts, `${m.key}: facts`);
    assert.ok(r.system_prompt_hash, m.key);
    if (m.derived) {
      assert.ok(mornings.some((x) => x.key === m.derived!.from && !x.derived), `${m.key}: derived from a recorded morning`);
      assert.equal(r.outcome, null, `${m.key}: a derived morning has no stored outcome`);
      assert.equal(r.published, null, m.key);
    } else {
      assert.ok(r.outcome, `${m.key}: outcome`);
      assert.ok(r.published, `${m.key}: published`);
      // A model-written morning keeps its prompt and the model's own words.
      if (r.outcome === 'model') assert.ok(r.user_prompt && r.raw_response, m.key);
    }
  }
});

test('the set covers the water it was saved for', () => {
  const recorded = mornings.filter((m) => !m.derived);
  const rivers = recorded.filter((m) => m.record.workload === 'river_update');
  const gauges = recorded.filter((m) => m.record.workload === 'gauge_update');
  assert.ok(rivers.length >= 12 && rivers.length <= 16, `river mornings: ${rivers.length}`);
  assert.ok(gauges.length >= 6 && gauges.length <= 8, `gauge mornings: ${gauges.length}`);
  for (const slug of ['james', 'gasconade', 'meramec']) {
    assert.ok(rivers.some((m) => m.record.river_slug === slug), `river ${slug}`);
    assert.ok(gauges.some((m) => m.record.river_slug === slug), `gauge ${slug}`);
  }
  const alerts = mornings.filter((m) => ((m.record.inputs as { alerts?: { event: string }[] }).alerts ?? []).some((a) => /flood warning/i.test(a.event)));
  assert.ok(alerts.length >= 2, 'flood warnings');
  const stale = mornings.filter((m) => {
    const ts = (m.record.inputs as { readingTimestamp?: string }).readingTimestamp;
    return ts != null && Date.parse(m.record.created_at) - Date.parse(ts) > 6 * 3_600_000;
  });
  assert.ok(stale.length >= 2, 'stale readings');
  assert.ok(recorded.filter((m) => m.record.outcome === 'fallback').length >= 2, 'fallbacks');
});

test('the stored baseline counts the outcomes the saved mornings hold', () => {
  const path = join(RESULTS_DIR, 'baseline-stored.json');
  assert.ok(existsSync(path));
  const baseline = JSON.parse(readFileSync(path, 'utf8')) as { total: number; outcomes: Record<string, number> };
  const stored = scoreOutputs(storedOutputs(mornings));
  assert.equal(baseline.total, stored.total);
  assert.deepEqual(baseline.outcomes, stored.outcomes);
});
