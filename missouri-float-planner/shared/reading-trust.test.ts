import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPLAINED_SUSPECT_QUALIFIERS,
  SUSPECT_QUALIFIERS,
  assessReadingTrust,
  hasSuspectQualifier,
  suspectQualifierNote,
} from './reading-trust';

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

// ── what a suspect code means, in words ──────────────────────────

test('every suspect code has its own explanation, and nothing else does', () => {
  // A code added to SUSPECT_QUALIFIERS without a note would fall back to the
  // generic "flagged" line; a note for a code that is not suspect could never
  // be shown. Either is a silent drift, so the two lists are held together.
  assert.deepEqual([...EXPLAINED_SUSPECT_QUALIFIERS].sort(), [...SUSPECT_QUALIFIERS].sort());
});

test('the most serious code explains a reading that carries several', () => {
  assert.equal(suspectQualifierNote(['P', 'e', 'Eqp'], 'USGS'), 'Gauge equipment problem. This reading may be wrong.');
  assert.equal(suspectQualifierNote(['Ice', 'e'], 'USGS'), 'Ice at the gauge. This reading may be off.');
  assert.equal(
    suspectQualifierNote(['Rat'], 'USGS'),
    'Higher or lower than USGS has measured here. The flow number is a rough estimate.',
  );
});

test('provisional and clean readings get no suspect note', () => {
  assert.equal(suspectQualifierNote(['P'], 'USGS'), null);
  assert.equal(suspectQualifierNote([], 'USGS'), null);
  assert.equal(suspectQualifierNote(null, 'USGS'), null);
});

test('the station agency is named, never assumed', () => {
  assert.equal(suspectQualifierNote(['***'], 'USACE'), "USACE hasn't confirmed this number. Don't rely on it.");
});
