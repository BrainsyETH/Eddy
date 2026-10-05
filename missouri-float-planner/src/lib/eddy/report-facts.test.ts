import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReportFacts, reportFactsPrompt, reportContradictions, guardReport, factualReportFallback } from './report-facts';
import type { ParsedEddyResponse } from './parse-response';

const input = {
  gaugeName: 'Current River at Van Buren, MO', gaugeHeightFt: 2.57, dischargeCfs: 756,
  thresholds: { thresholdUnit: 'cfs' as const, levelTooLow: 400, levelLow: 700, levelOptimalMin: 1190, levelOptimalMax: 2700, levelHigh: 2700, levelDangerous: 5000 },
};
const facts = buildReportFacts(input);
const report = (text: string): ParsedEddyResponse => ({ summaryText: text, eddyRead: text, quoteText: text });

test('Current incident: Good is below optimal, not Flowing; stage is not compared to cfs', () => {
  assert.equal(facts.conditionCode, 'good');
  assert.equal(facts.relation, 'below');
  assert.equal(facts.value, 756);
  const prompt = reportFactsPrompt(facts);
  assert.match(prompt, /Computed condition: Good/);
  assert.match(prompt, /Computed comparison: below/);
  assert.match(prompt, /Rating measurement: discharge; value: 756 cfs/);
  assert.match(prompt, /Editorial danger threshold: 5000 cfs/);
  assert.doesNotMatch(prompt, /Margin to closure|Closure level/);
  const broken = report('The Current River gauge reads 2.6 ft, solidly in the Flowing condition and well within the optimal range of 1,190 to 2,700 cfs.');
  assert.ok(reportContradictions(broken, facts).includes('condition'));
  assert.ok(reportContradictions(broken, facts).includes('range'));
  assert.deepEqual(guardReport(broken, facts), factualReportFallback(facts));
});

test('matching units are required in both directions, including zero readings', () => {
  assert.equal(buildReportFacts({ ...input, dischargeCfs: null }).conditionCode, 'unknown');
  const feet = { ...input, thresholds: { ...input.thresholds, thresholdUnit: 'ft' as const, levelOptimalMin: 2, levelOptimalMax: 3, levelLow: 1, levelTooLow: 0.5 } };
  assert.equal(buildReportFacts(feet).relation, 'within');
  assert.equal(buildReportFacts({ ...feet, gaugeHeightFt: null }).conditionCode, 'unknown');
  assert.equal(buildReportFacts({ ...input, dischargeCfs: 0 }).relation, 'below');
  const flood = buildReportFacts({ ...input, dischargeCfs: null, thresholds: { ...input.thresholds, floodStageFt: 2.5 } });
  assert.equal(flood.conditionCode, 'dangerous');
  assert.match(factualReportFallback(flood).quoteText, /Stay off the water/);
});

test('inclusive bounds and absent/invalid optimal bands', () => {
  for (const dischargeCfs of [1190, 2700]) assert.equal(buildReportFacts({ ...input, dischargeCfs }).relation, 'within');
  assert.equal(buildReportFacts({ ...input, dischargeCfs: 2701 }).relation, 'above');
  for (const levelOptimalMin of [null, 3000]) assert.equal(buildReportFacts({ ...input, thresholds: { ...input.thresholds, levelOptimalMin } }).relation, 'unavailable');
});

test('valid Good/below-optimal prose survives and display-rounded stage is allowed', () => {
  const valid = report('Good conditions at Van Buren. The gauge reads 2.6 ft. Discharge of 756 cfs is below the optimal band of 1,190 to 2,700 cfs.');
  assert.deepEqual(reportContradictions(valid, facts), []);
  assert.deepEqual(guardReport(valid, facts), valid);
});

test('wrong units, scaled ranges and wrong readings are rejected', () => {
  for (const text of ['Discharge of 756 ft.', 'The gauge reads 756 ft.', 'The gauge reads 900 cfs.', 'The optimal range is 1.19 to 2.70 ft.', 'The optimal range of 1190 to 2700 feet.']) {
    assert.ok(reportContradictions(report(text), facts).length, text);
  }
});

test('contradictions in any saved field replace the entire report', () => {
  for (const field of ['summaryText', 'eddyRead', 'quoteText'] as const) {
    const mixed = { ...report('Good conditions at Van Buren.'), [field]: 'The river is Flowing.' };
    assert.deepEqual(guardReport(mixed, facts), factualReportFallback(facts));
  }
});

test('section fallback cannot turn Van Buren into a Montauk/Akers assessment', () => {
  const unsupported = buildReportFacts({ ...input, requestedSection: 'Upper Current (Montauk to Akers)' });
  assert.match(reportFactsPrompt(unsupported), /fallback station observation, NOT a condition assessment/);
  assert.match(reportFactsPrompt(unsupported), /General local knowledge is background/);
  assert.match(guardReport(report('Expect scraping between Montauk and Akers.'), unsupported).quoteText, /does not establish current conditions for Upper Current/);
  const supported = buildReportFacts({ ...input, requestedSection: 'Assigned reach', supportedSection: 'Assigned reach' });
  assert.match(reportFactsPrompt(supported), /Supported location: Assigned reach/);
  assert.deepEqual(reportContradictions(report('Good conditions at the reporting station.'), supported), []);
});

test('missing rating uses a factual unavailable fallback, not confident floatability', () => {
  const unknown = buildReportFacts({ ...input, dischargeCfs: null });
  assert.match(guardReport(report('Dependable floating today.'), unknown).quoteText, /assessment is unavailable/);
});


test('compact rating claims are checked without confusing ordinary flowing water with a rating', () => {
  assert.ok(reportContradictions(report('Flowing at 2.6 ft.'), facts).includes('condition'));
  assert.deepEqual(reportContradictions(report('Water is flowing through the channel.'), facts), []);
});
