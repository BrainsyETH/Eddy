import { sectionGaugeSupportsReport } from '../gauge/section-gauge-support';
import { matchAlertsByTerms } from '../nws/alert-matching';
import { toNum } from '../utils/num';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReportFacts, reportFactsPrompt, reportContradictions, guardReport, factualReportFallback, preflightReportFallback, activeReportFloodAlerts, prepareGeneratedReport, reportClaimsLine } from './report-facts';
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

test('matching units are required for band comparisons, including zero readings', () => {
  assert.equal(buildReportFacts({ ...input, dischargeCfs: null }).relation, 'unavailable');
  const feet = { ...input, thresholds: { ...input.thresholds, thresholdUnit: 'ft' as const, levelOptimalMin: 2, levelOptimalMax: 3, levelLow: 1, levelTooLow: 0.5 } };
  assert.equal(buildReportFacts(feet).relation, 'within');
  assert.equal(buildReportFacts({ ...feet, gaugeHeightFt: null }).relation, 'unavailable');
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
  const unknown = buildReportFacts({ ...input, gaugeHeightFt: null, dischargeCfs: null });
  assert.match(guardReport(report('Dependable floating today.'), unknown).quoteText, /assessment is unavailable/);
});


test('compact rating claims are checked without confusing ordinary flowing water with a rating', () => {
  assert.ok(reportContradictions(report('Flowing at 2.6 ft.'), facts).includes('condition'));
  assert.deepEqual(reportContradictions(report('Water is flowing through the channel.'), facts), []);
});

test('unrelated weather subjects and historical readings survive in every saved field', () => {
  for (const text of [
    'The chance of rain is low today.',
    'Water temperature is high.',
    'The 10-day peak was a reading of 4.8 ft.',
    'The gauge read 4.8 ft yesterday.',
    'The flood stage is a height of 20 ft.',
    'The gauge reads 2.6 ft and 756 cfs, below the optimal band of 1,190 to 2,700 cfs.',
  ]) {
    for (const field of ['summaryText', 'eddyRead', 'quoteText'] as const) {
      const valid = { ...report('Good conditions at Van Buren.'), [field]: text };
      assert.deepEqual(reportContradictions(valid, facts), [], text);
      assert.deepEqual(guardReport(valid, facts), valid);
    }
  }
});

test('explicit current readings and directly incompatible comparisons still fail', () => {
  for (const text of [
    'The current reading is 4.8 ft.',
    'Current discharge of 900 cfs.',
    'The water level is High today.',
    'The flow is Low.',
    '2.6 ft is below the optimal band of 1190 to 2700 cfs.',
    'The optimal band is 1190 ft to 2700 cfs.',
  ]) assert.ok(reportContradictions(report(text), facts).length, text);
  const feet = buildReportFacts({ ...input, thresholds: { ...input.thresholds, thresholdUnit: 'ft', levelOptimalMin: 3, levelOptimalMax: 4 } });
  assert.ok(reportContradictions(report('756 cfs is below the optimal band of 3 to 4 ft.'), feet).includes('mixed-unit-comparison'));
});


test('numeric database thresholds preserve numeric ordering and range validation', () => {
  const numeric = buildReportFacts({ ...input, dischargeCfs: 900, thresholds: {
    ...input.thresholds, levelOptimalMin: toNum('800'), levelOptimalMax: toNum('1500'),
  } });
  assert.equal(numeric.relation, 'within');
  assert.deepEqual(reportContradictions(report('900 cfs is within the optimal band of 800 to 1500 cfs.'), numeric), []);
});

test('preflight supplies guaranteed fallbacks and permits supported assessments', () => {
  for (const unavailable of [
    buildReportFacts({ ...input, gaugeHeightFt: null, dischargeCfs: null }),
    buildReportFacts({ ...input, requestedSection: 'Upper Current' }),
  ]) assert.deepEqual(preflightReportFallback(unavailable), factualReportFallback(unavailable));
  assert.equal(preflightReportFallback(facts), null);
  assert.equal(preflightReportFallback(buildReportFacts({ ...input, requestedSection: 'Reach', supportedSection: 'Reach' })), null);
});

test('future, conditional and negated condition/band prose is not a current rating', () => {
  for (const text of [
    'Flash flood conditions possible Thursday.',
    'Expect low conditions next week if it stays dry.',
    'The gauge is not within the optimal band.',
    'The gauge is not Flowing.',
    'Rain could push it back into the optimal range.',
    'Rain could bring it within the optimal range.',
    'The river could be Flowing within the optimal range.',
    'The river may be High tomorrow.',
    'Flood Warning in effect.',
    'The gauge was within the optimal band yesterday.',
  ]) {
    for (const field of ['summaryText', 'eddyRead', 'quoteText'] as const) {
      const valid = { ...report('Good conditions at Van Buren.'), [field]: text };
      assert.deepEqual(reportContradictions(valid, facts), [], text);
      assert.deepEqual(guardReport(valid, facts), valid);
    }
  }
  for (const text of [
    'Condition: Flowing.',
    'The gauge is within the optimal band.',
    'Rain could arrive tomorrow, but the river is Flowing today.',
    'The gauge is not High, but the gauge is within the optimal band.',
  ]) assert.ok(reportContradictions(report(text), facts).length, text);
});

test('active flood alerts lead both preflight and rejected-report fallbacks in every field', () => {
  const floodAlerts = [{ event: 'Flood Warning', areaDesc: 'Carter County' }];
  const good = buildReportFacts({ ...input, floodAlerts });
  const unknown = buildReportFacts({ ...input, gaugeHeightFt: null, dischargeCfs: null, floodAlerts });
  const unsupported = buildReportFacts({ ...input, requestedSection: 'Upper Current', floodAlerts });
  assert.equal(good.conditionCode, 'good');
  assert.match(reportFactsPrompt(good), /Good or unavailable gauge rating does not cancel an NWS alert/);
  for (const fallback of [preflightReportFallback(unknown), preflightReportFallback(unsupported), guardReport(report('Condition: Flowing.'), good)]) {
    assert.ok(fallback);
    for (const field of ['summaryText', 'eddyRead', 'quoteText'] as const) {
      assert.match(fallback[field] ?? '', /^NWS Flood Warning for Carter County\./);
    }
  }
  const valid = report('Flood Warning in effect. Good conditions at Van Buren.');
  assert.deepEqual(guardReport(valid, good), valid);
});

test('expired and unrelated alerts are excluded; watches retain their event and area', () => {
  const base = { id: '1', headline: '', description: '', severity: 'Moderate', urgency: 'Expected', onset: '', areaDesc: 'Carter County' };
  const alerts = activeReportFloodAlerts([
    { ...base, event: 'Flood Warning', expires: '2026-10-06T11:00:00Z' },
    { ...base, event: 'Wind Advisory', expires: '2026-10-07T00:00:00Z' },
    { ...base, event: 'Flood Watch', expires: '2026-10-07T00:00:00Z' },
    { ...base, event: 'Flash Flood Warning', expires: '' },
  ], Date.parse('2026-10-06T12:00:00Z'));
  assert.deepEqual(alerts.map(a => a.event), ['Flood Watch', 'Flash Flood Warning']);
  const fallback = factualReportFallback(buildReportFacts({ ...input, floodAlerts: alerts }));
  assert.match(fallback.summaryText ?? '', /^NWS Flash Flood Warning for the river area/);
  assert.match(fallback.summaryText ?? '', /1 other flood alert type/);
});

test('unrelated weather modifiers cannot bypass the screenshot contradictions', () => {
  const screenshot = 'The Current River gauge reads 2.6 ft, solidly in the Flowing condition and well within the optimal range of 1,190 to 2,700 cfs';
  for (const suffix of ['with no rain in sight.', 'with rain that may arrive tomorrow.', 'with clear skies next week.', 'with weather that will stay dry.', 'where you can expect sunshine.']) {
    for (const text of [`${screenshot} ${suffix}`, `The river is Flowing within the optimal range ${suffix}`]) {
      for (const field of ['summaryText', 'eddyRead', 'quoteText'] as const) {
        const broken = { ...report('Condition: Good.'), [field]: text };
        assert.ok(reportContradictions(broken, facts).includes('condition'), text);
        if (text.startsWith('The Current River')) assert.ok(reportContradictions(broken, facts).includes('range'), text);
        assert.deepEqual(guardReport(broken, facts), factualReportFallback(facts));
      }
    }
  }
});

test('ordinary good/flowing and flood-alert prose are not condition labels', () => {
  const flowing = buildReportFacts({ ...input, dischargeCfs: 1500 });
  for (const text of ['good conditions for a float.', 'Good conditions for a float.']) {
    assert.deepEqual(reportContradictions(report(text), flowing), []);
  }
  for (const text of ['The river is flowing at 756 cfs.', 'Expect flood conditions on tributaries.', 'Flood conditions are possible on tributaries.']) {
    assert.deepEqual(reportContradictions(report(text), facts), []);
  }
  assert.ok(reportContradictions(report('Condition: Flowing.'), facts).includes('condition'));
  assert.ok(reportContradictions(report('The rating is good.'), flowing).includes('condition'));
});

test('readings accept documented rounding without changing the computed band relation', () => {
  const rounded = buildReportFacts({ ...input, gaugeHeightFt: 2.456, dischargeCfs: 1187 });
  assert.equal(rounded.relation, 'below');
  for (const text of ['Reads 1,190 cfs.', 'The gauge reads 2.46 ft.', 'The gauge reads 2.5 ft.']) {
    assert.deepEqual(reportContradictions(report(text), rounded), [], text);
  }
  for (const text of ['Reads 1,200 cfs.', 'The gauge reads 2.47 ft.', 'Reads 1,190 cfs within the optimal range.']) {
    assert.ok(reportContradictions(report(text), rounded).length, text);
  }
  assert.match(reportFactsPrompt(rounded), /height 2.46 ft; discharge 1,187 cfs/);
  const decimalTie = buildReportFacts({ ...input, gaugeHeightFt: 1.005 });
  assert.match(reportFactsPrompt(decimalTie), /height 1.01 ft/);
  assert.deepEqual(reportContradictions(report('Reads 1.01 ft.'), decimalTie), []);
});

test('overlapping alerts keep summaries compact and deduplicate event names', () => {
  const floodAlerts = Array.from({ length: 3 }, () => ({ event: 'Flood Warning', areaDesc: 'A very long county name; '.repeat(30) }));
  const fallback = factualReportFallback(buildReportFacts({ ...input, floodAlerts }));
  assert.ok((fallback.summaryText?.length ?? 0) < 200);
  assert.equal(fallback.summaryText?.match(/Flood Warning/g)?.length, 1);
  assert.match(fallback.summaryText ?? '', /^NWS Flood Warning for the river area/);
});

test('a flood-stage override never advertises an optimal discharge band in fallback prose', () => {
  const flood = buildReportFacts({ ...input, dischargeCfs: 1500, thresholds: { ...input.thresholds, floodStageFt: 2.5 } });
  assert.equal(flood.conditionCode, 'dangerous');
  assert.equal(flood.relation, 'within');
  const fallback = factualReportFallback(flood);
  assert.match(fallback.quoteText, /Stay off the water/);
  for (const field of ['summaryText', 'eddyRead', 'quoteText'] as const) assert.doesNotMatch(fallback[field] ?? '', /optimal|1500|1,500/);
});

test('website-compatible legacy rating does not permit a cross-unit range comparison', () => {
  const missingFlow = buildReportFacts({ ...input, gaugeHeightFt: 1500, dischargeCfs: null });
  assert.equal(missingFlow.conditionCode, 'flowing');
  assert.equal(missingFlow.relation, 'unavailable');
  assert.ok(reportContradictions(report('The gauge is within the optimal range.'), missingFlow).includes('range'));
  assert.doesNotMatch(factualReportFallback(missingFlow).quoteText, /optimal band/);
});

const modelOutput = (f: typeof facts, text: string) => `${reportClaimsLine(f)}\n[SUMMARY]\n${text}\n[EDDY_READ]\n${text}\n[FULL]\n${text}`;

test('model prose is published as written; wrong claims select the fallback', () => {
  const raw = modelOutput(facts, 'Good at Van Buren, a little below the optimal band. Clear weather through Thursday.');
  for (const invalid of [
    raw.replace('condition=good', 'condition=flowing'),
    raw.replace('relation=below', 'relation=within'),
    raw.replace('condition=good', 'condition=Flood'),
    raw.replace('relation=below', 'relation=below extra=true'),
  ]) {
    const result = prepareGeneratedReport(invalid, facts);
    assert.equal(result.usedFallback, true);
    assert.deepEqual(result.report, factualReportFallback(facts));
  }
  const prose = 'Good at Van Buren, a little below the optimal band. Clear weather through Thursday.';
  for (const valid of [raw, raw.replace(reportClaimsLine(facts), ''), `${raw}\n${reportClaimsLine(facts)}`]) {
    const result = prepareGeneratedReport(valid, facts);
    assert.equal(result.usedFallback, false);
    // Nothing is prepended: the saved fields are the model's own text.
    assert.equal(result.report.summaryText, prose);
    assert.equal(result.report.eddyRead, prose);
    assert.equal(result.report.quoteText, prose);
    assert.doesNotMatch(JSON.stringify(result.report), /CLAIMS|condition=|relation=/);
  }
});

test('real forecast sentences pass without a verb whitelist; explicit false negation fails', () => {
  const within = buildReportFacts({ ...input, dischargeCfs: 1500 });
  for (const text of [
    'Rain could climb it above the optimal band.',
    'If the river drops below the optimal range, check again before leaving.',
    'Rain could lift it above the range.',
    'If the river drops below the range, conditions may change.',
  ]) assert.equal(prepareGeneratedReport(modelOutput(within, text), within).usedFallback, false, text);
  for (const text of ['1500 cfs is not within the band.', 'The gauge is not within the optimal band.', 'Condition: Flood.']) {
    assert.equal(prepareGeneratedReport(modelOutput(within, text), within).usedFallback, true, text);
  }
  assert.equal(prepareGeneratedReport(modelOutput(facts, '756 cfs is not within the band.'), facts).usedFallback, false);
  assert.equal(prepareGeneratedReport(modelOutput(facts, 'The river is Flowing within the optimal range with no rain in sight.'), facts).usedFallback, true);
});

test('missing gauge still produces an alert-led location fallback without inventing a station', () => {
  const missing = buildReportFacts({ ...input, gaugeName: null, locationName: 'Example River', conditionCode: 'unknown', gaugeHeightFt: null, dischargeCfs: null, floodAlerts: [{ event: 'Flood Warning', areaDesc: 'Example County' }] });
  const fallback = preflightReportFallback(missing);
  assert.ok(fallback);
  for (const field of ['summaryText', 'eddyRead', 'quoteText'] as const) {
    assert.match(fallback[field] ?? '', /^NWS Flood Warning for Example County/);
    assert.match(fallback[field] ?? '', /Gauge assessment unavailable for Example River/);
    assert.doesNotMatch(fallback[field] ?? '', /Unknown at|at null|USGS/);
  }
});

test('river facts preserve the loader classification instead of recomputing it', () => {
  assert.equal(buildReportFacts({ ...input, conditionCode: 'high' }).conditionCode, 'high');
  assert.equal(buildReportFacts({ ...input, conditionCode: 'unknown' }).conditionCode, 'unknown');
});

test('section support requires explicit curation or a gauge inside known section miles', () => {
  const reach = { curatedStationId: null, selectedStationId: 'van-buren', startMile: 0, endMile: 20, gaugeMile: 90 };
  assert.equal(sectionGaugeSupportsReport(reach), false);
  for (const gaugeMile of [-1, 20, 21, null]) assert.equal(sectionGaugeSupportsReport({ ...reach, gaugeMile }), false);
  for (const gaugeMile of [0, 10, 19.9]) assert.equal(sectionGaugeSupportsReport({ ...reach, gaugeMile }), true);
  assert.equal(sectionGaugeSupportsReport({ ...reach, gaugeMile: 10, endMile: null }), false);
  assert.equal(sectionGaugeSupportsReport({ ...reach, gaugeMile: 10, startMile: null }), false);
  assert.equal(sectionGaugeSupportsReport({ ...reach, curatedStationId: 'tailwater', selectedStationId: 'tailwater' }), true);
  assert.equal(sectionGaugeSupportsReport({ ...reach, curatedStationId: 'tailwater', selectedStationId: 'above-dam', gaugeMile: 10 }), false);
});

test('missing alert matching coverage never returns statewide alerts as local', () => {
  const alerts = [
    { headline: 'Flood Warning', description: 'Distant River', areaDesc: 'Distant County' },
    { headline: 'Flood Watch', description: 'Current River', areaDesc: 'Carter County' },
  ];
  for (const terms of [undefined, [], [' ', '']]) assert.equal(matchAlertsByTerms(alerts, terms), null);
  assert.deepEqual(matchAlertsByTerms(alerts, [' Carter County ']), [alerts[1]]);
  assert.deepEqual(matchAlertsByTerms(alerts, ['Unmatched River']), []);
});
