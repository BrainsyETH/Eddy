import assert from 'node:assert/strict';
import test from 'node:test';

// Mirrors eddy-ios/src/lib/readingCopy.ts. The app has no test runner, so the
// pure copy rules are covered here — the unit rule below in particular is a
// correctness claim about what we tell users, not a formatting preference.

type Unit = 'ft' | 'cfs';

function primaryReading(c: {
  thresholdUnit?: Unit;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
}): { value: number; unit: Unit } | null {
  const unit = c.thresholdUnit;
  // A declared unit is absolute — no falling through to the other reading.
  if (unit === 'ft') return c.gaugeHeightFt != null ? { value: c.gaugeHeightFt, unit: 'ft' } : null;
  if (unit === 'cfs') return c.dischargeCfs != null ? { value: c.dischargeCfs, unit: 'cfs' } : null;
  if (c.gaugeHeightFt != null) return { value: c.gaugeHeightFt, unit: 'ft' };
  if (c.dischargeCfs != null) return { value: c.dischargeCfs, unit: 'cfs' };
  return null;
}

function formatReading(value: number, unit: Unit): string {
  if (unit === 'ft') return `${value.toFixed(2)} ft`;
  return `${Math.round(value).toLocaleString('en-US')} cfs`;
}

function readingAge(hours: number | null | undefined): string | null {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  if (hours < 1) return 'Updated in the last hour';
  if (hours < 2) return 'Updated an hour ago';
  if (hours < 24) return `Updated ${Math.round(hours)} hours ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
}

function percentileSentence(p: number | null | undefined): string | null {
  if (p == null || !Number.isFinite(p)) return null;
  const v = Math.max(0, Math.min(100, p));
  if (v < 10) return 'Much lower than usual for this time of year';
  if (v < 25) return 'Lower than usual for this time of year';
  if (v < 75) return 'About normal for this time of year';
  if (v < 90) return 'Higher than usual for this time of year';
  return 'Much higher than usual for this time of year';
}

function accuracyNote(c: {
  accuracyWarning: boolean;
  accuracyWarningReason: string | null;
  readingAgeHours: number | null;
}): string | null {
  if (c.accuracyWarning) {
    return c.accuracyWarningReason ?? 'This reading may not reflect current conditions.';
  }
  if ((c.readingAgeHours ?? 0) >= 6) {
    return 'This gauge has not reported recently, so conditions may have changed.';
  }
  return null;
}

// ── the unit rule ────────────────────────────────────────────────

test('the reading never falls back across units', () => {
  // A cfs-rated river with only a stage reading must show NOTHING rather than a
  // number that does not correspond to the colour beside it. The alert gate
  // enforces the same rule server-side via strictUnit.
  const cfsRiverWithOnlyStage = {
    thresholdUnit: 'cfs' as const,
    gaugeHeightFt: 1.51,
    dischargeCfs: null,
  };
  assert.equal(primaryReading(cfsRiverWithOnlyStage), null);

  const ftRiverWithOnlyDischarge = {
    thresholdUnit: 'ft' as const,
    gaugeHeightFt: null,
    dischargeCfs: 240,
  };
  assert.equal(primaryReading(ftRiverWithOnlyDischarge), null);
});

test('the declared unit wins even when both readings exist', () => {
  const both = { thresholdUnit: 'cfs' as const, gaugeHeightFt: 1.51, dischargeCfs: 240 };
  assert.deepEqual(primaryReading(both), { value: 240, unit: 'cfs' });
});

test('with no declared unit, stage is preferred', () => {
  // Most Ozark gauges are rated on stage, so that is the safer default.
  const undeclared = { gaugeHeightFt: 1.51, dischargeCfs: 240 };
  assert.deepEqual(primaryReading(undeclared), { value: 1.51, unit: 'ft' });
});

test('a river with no reading at all yields null', () => {
  assert.equal(primaryReading({ gaugeHeightFt: null, dischargeCfs: null }), null);
});

// ── formatting ───────────────────────────────────────────────────

test('each unit is shown at the precision it is reported at', () => {
  assert.equal(formatReading(1.5, 'ft'), '1.50 ft');
  assert.equal(formatReading(1.514, 'ft'), '1.51 ft');
  // Discharge to a decimal would imply precision the gauge does not have.
  assert.equal(formatReading(240.7, 'cfs'), '241 cfs');
  assert.equal(formatReading(12400, 'cfs'), '12,400 cfs');
});

// ── age ──────────────────────────────────────────────────────────

test('age is phrased in days once past a day', () => {
  // "31 hours ago" reads as precision the number does not deserve.
  assert.equal(readingAge(0.5), 'Updated in the last hour');
  assert.equal(readingAge(1.5), 'Updated an hour ago');
  assert.equal(readingAge(5), 'Updated 5 hours ago');
  assert.equal(readingAge(31), 'Updated 1 day ago');
  assert.equal(readingAge(60), 'Updated 3 days ago');
});

test('a missing or nonsensical age yields nothing rather than "NaN ago"', () => {
  assert.equal(readingAge(null), null);
  assert.equal(readingAge(undefined), null);
  assert.equal(readingAge(-4), null);
  assert.equal(readingAge(Number.NaN), null);
});

// ── percentile context ───────────────────────────────────────────

test('percentile becomes a sentence a person can act on', () => {
  // This is what the 89,304-row day-of-year snapshot bought: "1.51 ft" means
  // nothing to most people; "lower than usual for this time of year" does.
  assert.match(percentileSentence(4)!, /Much lower/);
  assert.match(percentileSentence(18)!, /^Lower/);
  assert.match(percentileSentence(50)!, /About normal/);
  assert.match(percentileSentence(80)!, /^Higher/);
  assert.match(percentileSentence(97)!, /Much higher/);
});

test('the comparison is always to this time of year, never absolute', () => {
  // A summer low on an Ozark river is normal. Phrasing it as "low" without the
  // seasonal qualifier would send people home on a perfectly floatable day.
  for (const p of [4, 18, 50, 80, 97]) {
    assert.match(percentileSentence(p)!, /for this time of year$/);
  }
});

test('a missing percentile produces no sentence at all', () => {
  // Silence beats inventing context — most gauges resolved a percentile, but
  // 2,328 of 89,304 rows could not, and those rivers must simply omit the line.
  assert.equal(percentileSentence(null), null);
  assert.equal(percentileSentence(undefined), null);
  assert.equal(percentileSentence(Number.NaN), null);
});

test('out-of-range percentiles are clamped, not rejected', () => {
  assert.match(percentileSentence(-5)!, /Much lower/);
  assert.match(percentileSentence(140)!, /Much higher/);
});

// ── caveats ──────────────────────────────────────────────────────

test('a stale reading is caveated even when the server flagged nothing', () => {
  // The server's accuracyWarning is not the only source of doubt: a six-hour-old
  // reading is a caveat whether or not anything upstream noticed.
  const stale = { accuracyWarning: false, accuracyWarningReason: null, readingAgeHours: 9 };
  assert.match(accuracyNote(stale)!, /not reported recently/);
});

test('a server warning wins and keeps its own wording', () => {
  const flagged = {
    accuracyWarning: true,
    accuracyWarningReason: 'Gauge is affected by ice.',
    readingAgeHours: 1,
  };
  assert.equal(accuracyNote(flagged), 'Gauge is affected by ice.');
});

test('a flagged reading with no reason still says something', () => {
  const bare = { accuracyWarning: true, accuracyWarningReason: null, readingAgeHours: 1 };
  assert.ok(accuracyNote(bare));
});

test('a fresh, unflagged reading gets no caveat', () => {
  const fine = { accuracyWarning: false, accuracyWarningReason: null, readingAgeHours: 1 };
  assert.equal(accuracyNote(fine), null);
});
