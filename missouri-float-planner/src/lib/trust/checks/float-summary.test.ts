import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveFloatSummaryFindings, type FloatSummaryRow } from './float-summary';

function row(over: Partial<FloatSummaryRow> = {}): FloatSummaryRow {
  return {
    riverSlug: 'test-river',
    floatSummary: 'At the Test gauge (primary), 300–900 cfs is the ideal range.',
    thresholdUnit: 'cfs',
    levelDangerous: 3000,
    primaryGaugeName: 'Test River near Testville, MO',
    ...over,
  };
}

const keys = (rows: FloatSummaryRow[]) => deriveFloatSummaryFindings(rows).map((f) => f.ruleKey);

test('prose that matches the ladder produces nothing', () => {
  assert.deepEqual(deriveFloatSummaryFindings([row()]), []);
});

test('a river with no float summary is not a defect', () => {
  // Most rivers have none. Absence is a gap in copy, not a contradiction.
  assert.deepEqual(deriveFloatSummaryFindings([row({ floatSummary: null })]), []);
  assert.deepEqual(deriveFloatSummaryFindings([row({ floatSummary: '   ' })]), []);
});

// ── the North Fork defect: prose puts the danger line above the ladder's ──

test('a level above the danger line is reported', () => {
  // The real one: level_dangerous was recalibrated to 2,200 by migration 00177
  // and the prose kept the pre-00177 flood figure, four times higher and on the
  // reassuring side.
  const findings = deriveFloatSummaryFindings([
    row({
      riverSlug: 'north-fork-white',
      floatSummary:
        'At the Tecumseh gauge (primary), 282–811 cfs is the ideal float range. Above ~1,000 cfs ' +
        'the North Fork runs high and cold; it becomes dangerous near 8,440 cfs.',
      levelDangerous: 2200,
      primaryGaugeName: 'North Fork River near Tecumseh, MO',
    }),
  ]);

  assert.deepEqual(findings.map((f) => f.ruleKey), ['summary_above_danger']);
  assert.deepEqual(findings[0].evidence?.quotedAbove, [8440]);
});

test('naming the danger line exactly is not a finding', () => {
  // Prose is supposed to say where danger starts. Only exceeding it is wrong,
  // or Big Piney ("2049 cfs and up is dangerous", dangerous = 2049) would fire.
  assert.deepEqual(
    keys([
      row({
        floatSummary: 'Roughly 519–1013 cfs is ideal; above ~1014 cfs it runs high—2049 cfs and up is dangerous.',
        levelDangerous: 2049,
      }),
    ]),
    [],
  );
});

test('commas and tildes in quoted levels are parsed, not skipped', () => {
  assert.deepEqual(
    keys([row({ floatSummary: 'Dangerous near ~8,440 cfs.', levelDangerous: 2200 })]),
    ['summary_above_danger'],
  );
});

test('a null danger line cannot be judged, so it is not judged', () => {
  assert.deepEqual(
    keys([row({ floatSummary: 'Up to 9,999 cfs is fine.', levelDangerous: null })]),
    [],
  );
});

// ── the Jacks Fork defect: prose in feet against a cfs ladder ──

test('prose quoting the other unit than the ladder is reported', () => {
  const findings = deriveFloatSummaryFindings([
    row({
      riverSlug: 'jacks-fork',
      floatSummary: 'At Alley Spring (primary), 2.5–3.0 ft is ideal. Below 2.0 ft you\'ll drag with gear.',
      thresholdUnit: 'cfs',
      levelDangerous: 1000,
    }),
  ]);

  assert.deepEqual(findings.map((f) => f.ruleKey), ['summary_unit_mismatch']);
  assert.equal(findings[0].evidence?.quotedUnit, 'ft');
});

test('a cfs level quoted on a gauge-height ladder is caught the other way round', () => {
  assert.deepEqual(
    keys([
      row({
        floatSummary: 'About 2.0–3.5 ft is prime, roughly 900 cfs.',
        thresholdUnit: 'ft',
        levelDangerous: 4.5,
      }),
    ]),
    ['summary_unit_mismatch'],
  );
});

test('prose about feet that is not a measurement does not fire', () => {
  // "rises several feet" is English, not a threshold. Flagging it would train
  // the operator to dismiss this rule.
  assert.deepEqual(
    keys([
      row({
        floatSummary: 'At the Test gauge (primary), 300–900 cfs is ideal. It can rise several feet after rain.',
      }),
    ]),
    [],
  );
});

test('a unit-less number is not read as a level', () => {
  // Spring River (MO) says "roughly 58 miles of Missouri floating".
  assert.deepEqual(
    keys([
      row({
        floatSummary: 'A float of roughly 58 miles down to the state line, 4000 acres of it public.',
        levelDangerous: 50,
      }),
    ]),
    [],
  );
});

// ── the Big River defect: prose credits a gauge that is not the primary ──

test('crediting the wrong gauge as primary is reported', () => {
  const findings = deriveFloatSummaryFindings([
    row({
      riverSlug: 'big-river',
      floatSummary: 'At the Byrnesville gauge (primary), roughly 200–600 cfs is comfortable floating.',
      levelDangerous: 800,
      primaryGaugeName: 'Big River near Richwoods, MO',
    }),
  ]);

  assert.deepEqual(findings.map((f) => f.ruleKey), ['summary_gauge_mismatch']);
  assert.equal(findings[0].evidence?.primaryGauge, 'Big River near Richwoods, MO');
});

test('a partial but real match of the primary gauge name passes', () => {
  // Prose uses short human names ("Kelly's Slab / Yellville") for stations with
  // long official ones. One shared word is enough; demanding more would fire on
  // every correctly-written summary in the table.
  assert.deepEqual(
    keys([
      row({
        floatSummary: "At the Kelly's Slab / Yellville gauge (primary), 10.5–12.5 ft is ideal.",
        thresholdUnit: 'ft',
        levelDangerous: 13.5,
        primaryGaugeName: 'Crooked Creek at Kelly Crossing at Yellville, AR',
      }),
    ]),
    [],
  );
});

test('prose that does not use the "<name> gauge (primary)" form is left alone', () => {
  // Fails open on purpose: guessing which noun is a station name would accuse
  // correct copy, and a false accusation costs more than a miss here.
  assert.deepEqual(
    keys([
      row({
        floatSummary: 'Alley Spring is the gauge to read. 300–900 cfs is ideal.',
        primaryGaugeName: 'Jacks Fork at Eminence, MO',
      }),
    ]),
    [],
  );
});

test('one river can fail more than one rule', () => {
  const findings = keys([
    row({
      floatSummary: 'At the Wrong gauge (primary), 2.0–3.0 ft is ideal.',
      thresholdUnit: 'cfs',
      levelDangerous: 1000,
      primaryGaugeName: 'Right River near Elsewhere, MO',
    }),
  ]);
  assert.deepEqual(findings.sort(), ['summary_gauge_mismatch', 'summary_unit_mismatch']);
});

test('findings are per-river and carry the slug as the entity key', () => {
  const findings = deriveFloatSummaryFindings([
    row({ riverSlug: 'a', floatSummary: 'Dangerous near 9,000 cfs.', levelDangerous: 100 }),
    row({ riverSlug: 'b' }),
    row({ riverSlug: 'c', floatSummary: 'Dangerous near 9,000 cfs.', levelDangerous: 100 }),
  ]);
  assert.deepEqual(findings.map((f) => f.entityKey), ['a', 'c']);
  assert.ok(findings.every((f) => f.entityType === 'river'));
});
