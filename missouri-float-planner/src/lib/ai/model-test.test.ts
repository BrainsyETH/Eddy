import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReportFacts, reportClaimsLine } from '@/lib/eddy/report-facts';
import {
  evaluateReport, evaluateRiverReport, isTestWorkload, latestPerTarget, rebuildGaugePrompt, rebuildUserPrompt, recordedFacts, recordedReport,
  type SampleRow,
} from './model-test';

const facts = buildReportFacts({
  gaugeName: 'Current River at Van Buren, MO',
  gaugeHeightFt: 2.57,
  dischargeCfs: 756,
  thresholds: { thresholdUnit: 'cfs' as const, levelTooLow: 400, levelLow: 700, levelOptimalMin: 1190, levelOptimalMax: 2700, levelHigh: 2700, levelDangerous: 5000 },
});

const output = (summary: string, read: string, full: string) =>
  `${reportClaimsLine(facts)}\n[SUMMARY]\n${summary}\n\n[EDDY_READ]\n${read}\n\n[FULL]\n${full}`;

const sample = (over: Partial<SampleRow>): SampleRow => ({
  id: 'a',
  created_at: '2026-11-17T12:00:00Z',
  river_slug: 'current',
  section_slug: null,
  condition_code: 'good',
  outcome: 'model',
  model_used: 'claude-sonnet-4-6',
  target: { riverName: 'Current River', sectionName: null },
  ...over,
});

// ── Judging a model's text ──────────────────────────────────────────────────

test('text the guard accepts passes, and is shown as the model wrote it', () => {
  const result = evaluateRiverReport(
    output('An easygoing float near Van Buren.', 'Van Buren speaks for the lower river.', 'Good at Van Buren, a little below the optimal range.'),
    facts,
    true,
  );
  assert.equal(result.verdict, 'passed');
  assert.equal(result.reason, null);
  assert.deepEqual(result.written, {
    summaryText: 'An easygoing float near Van Buren.',
    eddyRead: 'Van Buren speaks for the lower river.',
    quoteText: 'Good at Van Buren, a little below the optimal range.',
  });
  // The structured claim is for the guard and is never published.
  assert.doesNotMatch(JSON.stringify(result.written), /CLAIMS|condition=|\[SUMMARY\]/);
});

test('text that contradicts the gauge is marked replaced, but still shown', () => {
  // The verdict is production's: readers would get the code-written report.
  // The model's own words stay visible, because a replaced report is the one
  // worth reading when deciding whether to approve a model.
  const wrong = 'The river is Flowing within the optimal range with no rain in sight.';
  const result = evaluateRiverReport(output(wrong, wrong, wrong), facts, true);
  assert.equal(result.verdict, 'replaced');
  assert.equal(result.reason, 'contradiction');
  assert.ok(result.contradictions.length > 0);
  assert.equal(result.written?.quoteText, wrong);
});

test('a wrong claims line is marked replaced for that reason', () => {
  const text = output('Fine.', 'Fine here.', 'Good at Van Buren.').replace('condition=good', 'condition=flowing');
  const result = evaluateRiverReport(text, facts, true);
  assert.equal(result.verdict, 'replaced');
  assert.equal(result.reason, 'claims_mismatch');
  // Rejected before parsing, and still shown.
  assert.equal(result.written?.quoteText, 'Good at Van Buren.');
});

// ── Incomplete reports ──────────────────────────────────────────────────────
//
// Each of these was reported as "Passes checks" before the completeness rule
// existed, and production would have published it.

test('a claims line and nothing else is incomplete, not a pass with an empty report', () => {
  const result = evaluateRiverReport(reportClaimsLine(facts), facts, true);
  assert.equal(result.verdict, 'incomplete');
  assert.equal(result.reason, 'incomplete');
  assert.equal(result.incomplete, 'missing_blocks');
});

test('a report cut off mid-sentence is incomplete even though it parses into three blocks', () => {
  // The text alone cannot show this: all three markers are present and every
  // block holds prose. Only the stop reason says the model never finished.
  const cut = output('An easygoing float near Van Buren.', 'Van Buren speaks for the lower river.', 'Good at Van Buren. The gauge has held ste');
  assert.equal(evaluateRiverReport(cut, facts, true).verdict, 'passed');

  const result = evaluateRiverReport(cut, facts, false);
  assert.equal(result.verdict, 'incomplete');
  assert.equal(result.incomplete, 'cut_off');
  // The partial text is kept for reading.
  assert.equal(result.written?.quoteText, 'Good at Van Buren. The gauge has held ste');
});

test('a report that stops before its last block is incomplete, with what arrived kept', () => {
  const partial = `${reportClaimsLine(facts)}\n[SUMMARY]\nAn easygoing float near Van Buren.\n\n[EDDY_READ]\nVan Buren speaks for`;
  for (const finished of [true, false]) {
    const result = evaluateRiverReport(partial, facts, finished);
    assert.equal(result.verdict, 'incomplete');
    assert.equal(result.incomplete, finished ? 'missing_blocks' : 'cut_off');
    assert.match(result.written?.quoteText ?? '', /An easygoing float near Van Buren/);
    assert.doesNotMatch(result.written?.quoteText ?? '', /\[SUMMARY\]|\[EDDY_READ\]/);
  }
});

test('a finished report missing its Eddy Read block is incomplete', () => {
  const noRead = `${reportClaimsLine(facts)}\n[SUMMARY]\nAn easygoing float near Van Buren.\n\n[FULL]\nGood at Van Buren, a little below the optimal range.`;
  const result = evaluateRiverReport(noRead, facts, true);
  assert.equal(result.verdict, 'incomplete');
  assert.equal(result.incomplete, 'missing_blocks');
  assert.equal(result.written?.eddyRead, null);
});

test('incompleteness is decided before contradictions: half a report has nothing to pass', () => {
  const wrong = 'The river is Flowing within the optimal range with no rain in sight.';
  const result = evaluateRiverReport(output(wrong, wrong, wrong), facts, false);
  assert.equal(result.verdict, 'incomplete');
  assert.deepEqual(result.contradictions, []);
});

test('marker-only blocks are incomplete even when the model finished', () => {
  for (const field of ['summaryText', 'eddyRead', 'quoteText'] as const) {
    const report = { summaryText: 'Good at Van Buren.', eddyRead: 'Lower river.', quoteText: 'Good at Van Buren.' };
    const markers = { summaryText: '[SUMMARY]', eddyRead: '[EDDY_READ]', quoteText: '[FULL]' };
    report[field] = markers[field];
    const result = evaluateRiverReport(output(report.summaryText, report.eddyRead, report.quoteText), facts, true);
    assert.equal(result.verdict, 'incomplete', field);
    assert.equal(result.incomplete, 'missing_blocks', field);
    assert.equal(result.written?.[field], '', field);
  }
});

test('a pass is a pass of the automated checks, not a finding that the report is true', () => {
  // Pinned so nobody reads the verdict as more than it is: the checks cover
  // the condition, the measurement and the range. An invented landmark is not
  // any of those and goes straight through. A person has to read for it.
  const result = evaluateRiverReport(
    output(
      'An easygoing float near Van Buren.',
      'A forty-foot waterfall just below the Van Buren bridge needs a portage at this level.',
      'Good at Van Buren, a little below the optimal range. Portage the waterfall on river left.',
    ),
    facts,
    true,
  );
  assert.equal(result.verdict, 'passed');
});

test('no text is its own verdict, not a pass', () => {
  // What a reasoning model returns when it spends its whole cap thinking.
  for (const text of [null, '', '   \n ']) {
    assert.deepEqual(evaluateRiverReport(text, facts, true), { verdict: 'empty', reason: null, contradictions: [], incomplete: null, written: null });
  }
});

test('em dashes are cleaned before judging, as production cleans them', () => {
  const result = evaluateRiverReport(output('Good water — easy float.', 'Lower river.', 'Good at Van Buren.'), facts, true);
  assert.equal(result.written?.summaryText, 'Good water. Easy float.');
});

// ── Choosing what to replay ─────────────────────────────────────────────────

test('the sample list keeps the newest row for each river and section', () => {
  // Rows arrive newest first.
  const samples = latestPerTarget([
    sample({ id: 'new', created_at: '2026-11-17T12:00:00Z' }),
    sample({ id: 'old', created_at: '2026-11-16T12:00:00Z' }),
    sample({ id: 'sec', section_slug: 'akers-to-pulltite', target: { riverName: 'Current River', sectionName: 'Akers to Pulltite' } }),
    sample({ id: 'buf', river_slug: 'buffalo', target: { riverName: 'Buffalo River' } }),
  ]);
  assert.deepEqual(samples.map((s) => s.id), ['buf', 'new', 'sec']);
  assert.equal(samples[2].sectionName, 'Akers to Pulltite');
  // Eddy's own condition label, not the stored code.
  assert.equal(samples[0].conditionLabel, 'Good');
  assert.equal(latestPerTarget([sample({ condition_code: 'too_low' })])[0].conditionLabel, 'Too Low');
  assert.equal(latestPerTarget([sample({ condition_code: 'something_new' })])[0].conditionLabel, 'something_new');
});

test('a row that recorded no names falls back to its slugs', () => {
  const [whole, section] = latestPerTarget([
    sample({ id: 'w', target: null }),
    sample({ id: 's', section_slug: 'upper', target: { riverName: '  ' } }),
  ]);
  assert.equal(whole.riverName, 'current');
  assert.equal(whole.sectionName, null);
  assert.equal(section.riverName, 'current');
  assert.equal(section.sectionName, 'upper');
});

// ── Reading a recorded row ──────────────────────────────────────────────────

test('recorded facts survive the jsonb round trip and still drive the guard', () => {
  const stored = recordedFacts(JSON.parse(JSON.stringify({ facts })));
  assert.ok(stored);
  assert.equal(evaluateRiverReport(output('Fine.', 'Lower river.', 'Good at Van Buren.'), stored, true).verdict, 'passed');
});

test('a row without usable facts is refused rather than judged against nothing', () => {
  for (const inputs of [null, 'x', {}, { facts: null }, { facts: { conditionCode: 'good' } }, { facts: { thresholds: {} } }]) {
    assert.equal(recordedFacts(inputs), null);
  }
});

test('the published text is read back only when it is there', () => {
  assert.deepEqual(recordedReport({ summaryText: 'S', eddyRead: null, quoteText: 'Q', sourcesUsed: [] }), {
    summaryText: 'S',
    eddyRead: null,
    quoteText: 'Q',
  });
  assert.equal(recordedReport(null), null);
  assert.equal(recordedReport({ summaryText: 'S' }), null);
});

// ── Rebuilding the message for a recorded morning ───────────────────────────
// A replay used to resend the stored user message, which can only test a
// change to the system prompt. Rebuilt from the recorded inputs, it also tests
// what today's builder and today's knowledge file would hand the model.

const recordedInputs = (over: Record<string, unknown> = {}) => JSON.parse(JSON.stringify({
  target: { riverSlug: 'current', riverName: 'Current River', sectionSlug: null, sectionName: null, sectionDescription: null,
    sectionRiverType: null, sectionLowWaterMeaning: null, sectionRisingWaterHazards: null },
  facts,
  readingTimestamp: '2026-11-19T10:45:00Z',
  gaugeNotes: null,
  river: { riverType: 'spring_fed_float', state: 'MO', timezone: 'America/Chicago', characteristics: null },
  alerts: [],
  weather: null,
  forecast: null,
  precipitation: null,
  trajectory: {
    change24h: 0, change6h: 0, rateFtPerHour: 0, acceleration: 'steady', windowDays: 10,
    windowPeak: { heightFt: 2.6, timestamp: '2026-11-12T06:00:00Z' }, windowLow: { heightFt: 2.5, timestamp: '2026-11-15T06:00:00Z' },
    currentHeightFt: 2.57, narrative: 'Gauge has held steady near 2.6 ft over the past 24 hours.',
    percentileContext: 'Current discharge of 756 cfs is at the 18th percentile for this date. Median: 1,150 cfs.', percentile: 18, stats: null,
  },
  ...over,
}));

test("a recorded morning is rebuilt with today's builder, dated to that morning", () => {
  const prompt = rebuildUserPrompt(recordedInputs(), { createdAt: '2026-11-19T11:11:04Z', riverCtx: null, localKnowledge: '=== This gauge: Van Buren ===' });
  assert.ok(prompt);
  // The recorded morning, not the day of the test, and no stale-reading warning.
  assert.match(prompt, /^Date: Thursday, November 19, 2026$/m);
  assert.doesNotMatch(prompt, /WARNING: Reading is/);
  // Today's inputs: the claims line, the ladder, the one-line trend, the knowledge passed in.
  assert.ok(prompt.includes(reportClaimsLine(facts)));
  assert.match(prompt, /- Low \(floatable, with some dragging\): 400 up to 700/);
  assert.match(prompt, /^Steady: no meaningful change over the past 24 hours\.$/m);
  assert.doesNotMatch(prompt, /percentile|Median/);
  assert.match(prompt, /=== This gauge: Van Buren ===/);
});

test('a record that cannot be rebuilt is refused, so the stored message is used', () => {
  const options = { createdAt: '2026-11-19T11:11:04Z', riverCtx: null, localKnowledge: '' };
  for (const inputs of [null, {}, { facts }, recordedInputs({ target: null }), recordedInputs({ target: { riverSlug: 'current' } }), recordedInputs({ facts: null })]) {
    assert.equal(rebuildUserPrompt(inputs, options), null);
  }
  assert.equal(rebuildUserPrompt(recordedInputs(), { ...options, createdAt: 'not a date' }), null);
});

// ── Gauge Reads ─────────────────────────────────────────────────────────────
// Nearly half of what is published is a secondary gauge's Read. They share the
// river Read's brief and have their own message, model list and output cap.

test('only the two recorded Reads can be replayed', () => {
  assert.equal(isTestWorkload('river_update'), true);
  assert.equal(isTestWorkload('gauge_update'), true);
  for (const other of ['global_summary', 'social_caption', '', null, undefined]) assert.equal(isTestWorkload(other), false);
});

test('gauge samples are one per station and are named by the station', () => {
  const gauge = (over: Partial<SampleRow>) => sample({ workload: 'gauge_update', usgs_site_id: '07064533',
    target: { riverName: 'Current River', gaugeName: 'Current River above Akers, MO' }, ...over });
  const samples = latestPerTarget([
    gauge({ id: 'akers-new' }),
    gauge({ id: 'akers-old', created_at: '2026-11-16T12:00:00Z' }),
    gauge({ id: 'doniphan', usgs_site_id: '07068000', target: { riverName: 'Current River', gaugeName: 'Current River at Doniphan, MO' } }),
    // A row that kept no station name falls back to its site number.
    gauge({ id: 'unnamed', usgs_site_id: '07066510', target: { riverName: 'Current River' } }),
    // A river Read written from the same station is a different target.
    sample({ id: 'river', usgs_site_id: '07064533' }),
  ]);
  assert.deepEqual(samples.map((s) => [s.id, s.workload, s.gaugeName]), [
    ['river', 'river_update', null],
    ['unnamed', 'gauge_update', '07066510'],
    ['akers-new', 'gauge_update', 'Current River above Akers, MO'],
    ['doniphan', 'gauge_update', 'Current River at Doniphan, MO'],
  ]);
});

test('a gauge Read is judged as its generator judges it: a missing block passes, a cut-off does not', () => {
  // Finished, with no Eddy Read block. A river Read is incomplete; a gauge
  // Read is published in production, so it passes here too.
  const twoBlocks = `${reportClaimsLine(facts)}\n[SUMMARY]\nFine at Van Buren.\n\n[FULL]\nGood at Van Buren.`;
  assert.equal(evaluateReport(twoBlocks, facts, true, 'river_update').verdict, 'incomplete');
  assert.equal(evaluateReport(twoBlocks, facts, true, 'gauge_update').verdict, 'passed');
  // Not finished: production refuses it while another model is waiting.
  const whole = output('Fine.', 'Lower river.', 'Good at Van Buren.');
  const cut = evaluateReport(whole, facts, false, 'gauge_update');
  assert.equal(cut.verdict, 'incomplete');
  assert.equal(cut.incomplete, 'cut_off');
  assert.equal(evaluateReport(whole, facts, true, 'gauge_update').verdict, 'passed');
  // The guard is the same one: a wrong rating is replaced under either.
  const wrong = evaluateReport(output('Fine.', 'Lower river.', 'The gauge reads Flowing at Van Buren.'), facts, true, 'gauge_update');
  assert.equal(wrong.verdict, 'replaced');
  assert.deepEqual(wrong.contradictions, ['condition']);
});

const recordedGaugeInputs = (over: Record<string, unknown> = {}) => JSON.parse(JSON.stringify({
  target: { riverSlug: 'current', riverName: 'Current River', usgsSiteId: '07064533', gaugeName: 'Current River above Akers, MO', coordinates: null },
  facts,
  readingTimestamp: '2026-11-19T16:45:00Z',
  alerts: [],
  forecast: null,
  trajectory: null,
  riverBehaviorApplies: true,
  ...over,
}));

test("a recorded gauge morning is rebuilt with today's gauge builder, dated to that morning", () => {
  const options = { createdAt: '2026-11-19T17:10:50Z', riverCtx: null, riverKnowledge: 'This gauge: Akers (07064533)' };
  const prompt = rebuildGaugePrompt(recordedGaugeInputs(), options);
  assert.ok(prompt);
  assert.match(prompt, /^Date: Thursday, November 19, 2026$/m);
  assert.match(prompt, /^Generate a secondary-gauge update for: Current River above Akers, MO on the Current River\.$/m);
  assert.match(prompt, /This gauge: Akers \(07064533\)/);
  assert.ok(prompt.includes(reportClaimsLine(facts)));
  assert.match(prompt, /- Low \(floatable, with some dragging\): 400 up to 700/);
  assert.doesNotMatch(prompt, /WARNING: Reading is/);
  // It is the gauge message, not the river one.
  assert.doesNotMatch(prompt, /Generate an Eddy condition update for|LOCAL KNOWLEDGE/);

  for (const inputs of [null, {}, recordedGaugeInputs({ facts: null }), recordedGaugeInputs({ target: null }), recordedGaugeInputs({ target: { riverName: 'Current River' } })]) {
    assert.equal(rebuildGaugePrompt(inputs, options), null);
  }
  assert.equal(rebuildGaugePrompt(recordedGaugeInputs(), { ...options, createdAt: 'not a date' }), null);
});
