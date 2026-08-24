import assert from 'node:assert/strict';
import test from 'node:test';
import { safetySummarySentence, summarizeSafety } from './safety-summary';

const VAN_BUREN = { action: 6, flood: 10, moderate: 18, major: 25 };

// ── state 1: current at/above a category ─────────────────────────

test('a current reading above a category is the present-tense state', () => {
  const summary = summarizeSafety({ stages: VAN_BUREN, currentFt: 19 });
  assert.deepEqual(summary, { kind: 'current', category: 'moderate' });
  assert.equal(safetySummarySentence(summary), 'Currently at or above NWS moderate flood stage.');
});

test('current outranks a forecast crossing — a flood now is not a forecast', () => {
  const summary = summarizeSafety({
    stages: VAN_BUREN,
    currentFt: 11,
    forecast: [{ t: '2026-08-25T12:00:00Z', gaugeHeightFt: 26 }],
  });
  assert.deepEqual(summary, { kind: 'current', category: 'flood' });
});

test('the boundary is inclusive — at a stage is at that stage', () => {
  assert.deepEqual(summarizeSafety({ stages: VAN_BUREN, currentFt: 6 }), {
    kind: 'current',
    category: 'action',
  });
});

// ── state 2: forecast crosses a category ─────────────────────────

test('a forecast crossing reads as a forecast, never the present tense', () => {
  const summary = summarizeSafety({
    stages: VAN_BUREN,
    currentFt: 4,
    forecast: [
      { t: '2026-08-24T06:00:00Z', gaugeHeightFt: 5 },
      { t: '2026-08-24T18:00:00Z', gaugeHeightFt: 7 },
    ],
  });
  assert.deepEqual(summary, {
    kind: 'forecast',
    category: 'action',
    crossesAt: '2026-08-24T18:00:00Z',
  });
  const sentence = safetySummarySentence(summary, { forecastDayLabel: 'Monday' });
  assert.equal(sentence, 'Forecast to reach NWS action stage Monday.');
  assert.equal(/currently/i.test(sentence), false);
});

test('the forecast state names the highest category the forecast reaches', () => {
  // crossesAt is the first point at or above THAT category, not the first
  // point above anything — "reaches moderate flood Tuesday" should not carry
  // Monday's action-stage timestamp.
  const summary = summarizeSafety({
    stages: VAN_BUREN,
    currentFt: 4,
    forecast: [
      { t: '2026-08-24T12:00:00Z', gaugeHeightFt: 7 },
      { t: '2026-08-25T12:00:00Z', gaugeHeightFt: 19 },
    ],
  });
  assert.deepEqual(summary, {
    kind: 'forecast',
    category: 'moderate',
    crossesAt: '2026-08-25T12:00:00Z',
  });
});

test('a forecast crossing surfaces even without a current reading', () => {
  // "Current comparison unavailable" must not bury a forecast flood: the
  // forecast is the NWS's own statement, not an inference from the gap.
  assert.deepEqual(
    summarizeSafety({
      stages: VAN_BUREN,
      currentFt: null,
      forecast: [{ t: '2026-08-24T00:00:00Z', gaugeHeightFt: 12 }],
    }),
    { kind: 'forecast', category: 'flood', crossesAt: '2026-08-24T00:00:00Z' },
  );
});

// ── state 3: below the lowest published threshold ────────────────

test('below every threshold names the lowest one that exists', () => {
  const summary = summarizeSafety({ stages: VAN_BUREN, currentFt: 3 });
  assert.deepEqual(summary, { kind: 'below', lowestPublished: 'action' });
  assert.equal(safetySummarySentence(summary), 'Below NWS action stage.');
});

test('actionFt can be null while floodFt exists — the sentence adjusts', () => {
  // Curated stations carry only flood/moderate-style stages, so "Below action
  // stage" would name a threshold nobody published.
  const summary = summarizeSafety({ stages: { flood: 10 }, currentFt: 3 });
  assert.deepEqual(summary, { kind: 'below', lowestPublished: 'flood' });
  assert.equal(safetySummarySentence(summary), 'Below NWS minor flood stage.');
});

test('an action-only station is a legal shape, not "no stages"', () => {
  // NWPS publishes stations (BDPM7) with an action stage and -9999 for every
  // flood category. If the route ever relaxes its publication gate, this
  // machine already answers correctly for them.
  assert.deepEqual(summarizeSafety({ stages: { action: 38 }, currentFt: 12 }), {
    kind: 'below',
    lowestPublished: 'action',
  });
  assert.deepEqual(summarizeSafety({ stages: { action: 38 }, currentFt: 40 }), {
    kind: 'current',
    category: 'action',
  });
});

// ── states 4 and 5: unavailable and unpublished ──────────────────

test('stages published with no trusted reading says so, in those words', () => {
  const summary = summarizeSafety({ stages: VAN_BUREN, currentFt: null });
  assert.deepEqual(summary, { kind: 'no_reading' });
  assert.equal(
    safetySummarySentence(summary),
    'Official flood stages published; current comparison unavailable.',
  );
});

test('missing stages are a statement about publication, not the water', () => {
  const summary = summarizeSafety({ stages: null, currentFt: 4 });
  assert.deepEqual(summary, { kind: 'no_stages' });
  assert.equal(safetySummarySentence(summary), 'No official flood stages published.');
});

test('NWPS sentinels count as unpublished, not as thresholds', () => {
  // flood: -9999 must not become "currently above flood stage" (any reading
  // beats -9999) or "below flood stage" (a threshold nobody published).
  assert.deepEqual(
    summarizeSafety({ stages: { action: -9999, flood: -9999, moderate: -9999, major: -9999 }, currentFt: 4 }),
    { kind: 'no_stages' },
  );
});
