import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EVIDENCE_STALE_DAYS,
  evidencePhrasing,
  evidenceProblems,
  type EvidenceFile,
  type NegativeEvidence,
} from './negative-evidence';

// Three corridor passes ended in a negative result. As prose those are
// unfalsifiable — a reader cannot tell an afternoon's search from ten minutes.
// These rules are what make the difference recordable.

const TODAY = new Date('2026-08-24T00:00:00Z');

function evidence(over: Partial<NegativeEvidence> = {}): NegativeEvidence {
  return {
    scope: 'commercial outfitters',
    basis: 'search_exhaustion',
    checkedAt: '2026-08-20',
    directories: ['https://missouricanoe.org/directory/'],
    queryVariants: ['river canoe rental', 'river outfitter shuttle'],
    bounds: 'the whole river',
    notAttempted: [],
    ...over,
  };
}

test('a complete search-exhaustion record passes', () => {
  assert.deepEqual(evidenceProblems('x', evidence(), TODAY), []);
});

test('claiming a roster without citing one is refused', () => {
  // This is the rule with teeth: a roster claim missing its roster is just an
  // exhaustion claim wearing a stronger word.
  const problems = evidenceProblems('x', evidence({ basis: 'authoritative_roster' }), TODAY);
  assert.ok(problems.some((p) => /claims an authoritative roster but does not cite one/.test(p)), problems.join('; '));
});

test('a roster claim that cites its roster passes', () => {
  const cited = evidence({ basis: 'authoritative_roster', roster: 'https://www.nps.gov/buff/rentals-and-other-services.htm' });
  assert.deepEqual(evidenceProblems('x', cited, TODAY), []);
});

test('the two bases are not allowed the same sentence', () => {
  assert.match(evidencePhrasing(evidence()), /^none found as of 2026-08-20$/);
  assert.match(
    evidencePhrasing(evidence({ basis: 'authoritative_roster', roster: 'https://r' })),
    /^complete against the published roster as of 2026-08-20$/,
  );
});

test('a search claim resting on one phrasing is refused', () => {
  const thin = evidence({ queryVariants: ['river canoe rental'] });
  assert.ok(evidenceProblems('x', thin, TODAY).some((p) => /fewer than two query variants/.test(p)));
});

test('a record with no directories, scope or bounds is refused', () => {
  const empty = evidence({ directories: [], scope: '', bounds: '' });
  const problems = evidenceProblems('x', empty, TODAY);
  assert.ok(problems.some((p) => /lists no directories/.test(p)));
  assert.ok(problems.some((p) => /has no scope/.test(p)));
  assert.ok(problems.some((p) => /what stretch or counties/.test(p)));
});

test('a negative goes stale, because absence is a claim about a date', () => {
  const old = new Date(TODAY.getTime() - (EVIDENCE_STALE_DAYS + 10) * 86_400_000);
  const stale = evidence({ checkedAt: old.toISOString().slice(0, 10) });
  assert.ok(evidenceProblems('x', stale, TODAY).some((p) => /re-look before quoting it/.test(p)));
});

test('an impossible or future date is refused', () => {
  assert.ok(evidenceProblems('x', evidence({ checkedAt: '2026-02-31' }), TODAY)
    .some((p) => /not a real calendar date/.test(p)));
  assert.ok(evidenceProblems('x', evidence({ checkedAt: '2027-01-01' }), TODAY)
    .some((p) => /in the future/.test(p)));
});

// ── The records this branch actually wrote ────────────────────────────────

test('every recorded negative in the repo satisfies its own rules', () => {
  const file = path.join(__dirname, 'ingestion', 'negative-evidence.json');
  const records = JSON.parse(fs.readFileSync(file, 'utf-8')) as EvidenceFile;
  assert.ok(Object.keys(records).length > 0, 'the file should not be empty');
  const problems = Object.entries(records)
    .flatMap(([slug, r]) => evidenceProblems(slug, r, TODAY));
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the two roster claims name a roster that is an agency URL', () => {
  const file = path.join(__dirname, 'ingestion', 'negative-evidence.json');
  const records = JSON.parse(fs.readFileSync(file, 'utf-8')) as EvidenceFile;
  const rosters = Object.values(records).filter((r) => r.basis === 'authoritative_roster');
  assert.ok(rosters.length >= 2, 'buffalo and eleven-point are roster claims');
  for (const r of rosters) {
    assert.match(String(r.roster), /^https:\/\/(www\.)?(nps|fs)\.usda?\.gov|^https:\/\/www\.nps\.gov/);
  }
});
