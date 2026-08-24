import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUSPECT_QUALIFIERS, assessReadingTrust, hasSuspectQualifier } from './reading-trust';

test('provisional is not suspect', () => {
  // Essentially every real-time USGS reading carries 'P'. Treating it as
  // suspect would suppress interpretation product-wide, which is why the alert
  // gate never blocked on it and this module must not either.
  assert.equal(SUSPECT_QUALIFIERS.has('P'), false);
  assert.equal(hasSuspectQualifier(['P']), false);
  assert.deepEqual(assessReadingTrust({ qualifiers: ['P'], ageHours: 1 }), { trusted: true });
});

test('both estimation codes are suspect', () => {
  // USGS uses lowercase 'e' and uppercase 'E' for estimated values; the old
  // per-file tables only listed 'e', so an 'E'-flagged reading was captioned
  // "estimated" by the chart while classifying as clean everywhere else.
  assert.equal(hasSuspectQualifier(['e']), true);
  assert.equal(hasSuspectQualifier(['E']), true);
});

test('a suspect qualifier withdraws interpretation, whatever the age', () => {
  assert.deepEqual(assessReadingTrust({ qualifiers: ['Ice'], ageHours: 0.5 }), {
    trusted: false,
    reason: 'suspect_qualifier',
  });
});

test('staleness follows the shared six-hour line', () => {
  assert.deepEqual(assessReadingTrust({ qualifiers: [], ageHours: 6 }), { trusted: true });
  assert.deepEqual(assessReadingTrust({ qualifiers: [], ageHours: 6.1 }), {
    trusted: false,
    reason: 'stale',
  });
});

test('never-reported is stale, not fresh', () => {
  assert.deepEqual(assessReadingTrust({ qualifiers: null, ageHours: null }), {
    trusted: false,
    reason: 'stale',
  });
});

test('suspect wins over stale when both apply', () => {
  // "The sensor flagged this number" is the stronger statement and the one
  // worth captioning; "and it is old too" adds nothing a reader can act on.
  assert.deepEqual(assessReadingTrust({ qualifiers: ['Eqp'], ageHours: 30 }), {
    trusted: false,
    reason: 'suspect_qualifier',
  });
});

// ── the guard ────────────────────────────────────────────────────

test('nothing redefines SUSPECT_QUALIFIERS outside this module', () => {
  // The regression this prevents: three files declared their own suspect set
  // and they disagreed — gauges.ts and gate.ts each omitted 'E' while
  // chart-model.ts captioned it, so one reading could be "estimated" in a
  // caption and clean to the classifier. A fourth copy type-checks perfectly,
  // so only a file-level assertion catches it.
  const repoRoot = join(__dirname, '..');
  const files = ['src/lib/usgs/gauges.ts', 'src/lib/alerts/gate.ts'];

  for (const relative of files) {
    const source = readFileSync(join(repoRoot, relative), 'utf-8');
    assert.equal(
      /(?:const|let|var)\s+SUSPECT_QUALIFIERS\s*[:=]/.test(source),
      false,
      `${relative} declares its own SUSPECT_QUALIFIERS — import it from @shared/reading-trust instead`,
    );
    assert.equal(
      source.includes('SUSPECT_QUALIFIERS'),
      true,
      `${relative} no longer references SUSPECT_QUALIFIERS — update this guard if that is deliberate`,
    );
  }
});
