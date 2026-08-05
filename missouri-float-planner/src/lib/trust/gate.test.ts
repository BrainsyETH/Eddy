import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FALSE_POSITIVE_GATE,
  MIN_REVIEWS_FOR_RATE,
  isOperatorResolution,
  rateIsMeaningful,
  reviewMetrics,
} from './resolution';
import { SAFETY_BASELINE, assessBaseline } from './baseline';
import { deriveRegressionFindings } from './checks/known-regressions';
import { DEFAULT_DECAY_POLICY, planDecay } from './decay';
import { severityForRule } from './severity';

// ── why this file exists ─────────────────────────────────────────
//
// Three of the Trust MVP gate's criteria were unanswerable, and each for the
// same reason: nothing recorded the thing the criterion asked about. These are
// the pure halves of the three answers, so the gate can be computed rather than
// estimated.

// ── the false-positive rate ──────────────────────────────────────

test('unreviewed closures stay out of the denominator', () => {
  // The mistake this prevents: folding auto-resolved findings into "fixed".
  // Most findings close without anyone looking, so that denominator would be
  // dominated by rows nobody read and the rate would fall toward zero exactly
  // as the console filled with noise — best-looking metric, worst system.
  const m = reviewMetrics([
    { resolution: 'auto_resolved' },
    { resolution: 'auto_resolved' },
    { resolution: 'auto_resolved' },
    { resolution: 'expired' },
    { resolution: 'fixed' },
    { resolution: 'false_positive' },
  ]);

  assert.equal(m.reviewed, 2, 'only human judgements count as reviewed');
  assert.equal(m.falsePositiveRate, 0.5);
});

test('no reviews yields null, never zero', () => {
  // Zero reads as "no false positives", which is the same sentence a system
  // with no data produces. Treating an absence of evidence as a passing score
  // is the failure this whole subsystem is about.
  const m = reviewMetrics([{ resolution: 'auto_resolved' }]);
  assert.equal(m.falsePositiveRate, null);
  assert.equal(m.meetsGate, null, 'unknown is not a pass');
});

test('rows closed before the column existed are counted as unknown', () => {
  const m = reviewMetrics([{ resolution: null }, { resolution: null }, { resolution: 'fixed' }]);
  assert.equal(m.tally.unknown, 2);
  assert.equal(m.reviewed, 1);
});

test('the gate is strict: exactly 20% does not pass', () => {
  const m = reviewMetrics([
    ...Array.from({ length: 4 }, () => ({ resolution: 'fixed' })),
    { resolution: 'false_positive' },
  ]);
  assert.equal(m.falsePositiveRate, FALSE_POSITIVE_GATE);
  assert.equal(m.meetsGate, false);
});

test('a rate is not meaningful until there are enough reviews', () => {
  // One false positive out of two is 50% and says nothing. Flashing red at the
  // first disagreement is the opposite mistake from flattering the score, and
  // just as good at getting a dashboard ignored.
  const thin = reviewMetrics([{ resolution: 'fixed' }, { resolution: 'false_positive' }]);
  assert.equal(rateIsMeaningful(thin), false);

  const enough = reviewMetrics(
    Array.from({ length: MIN_REVIEWS_FOR_RATE }, () => ({ resolution: 'fixed' })),
  );
  assert.equal(rateIsMeaningful(enough), true);
});

test('only the three human dispositions are offerable', () => {
  assert.ok(isOperatorResolution('fixed'));
  assert.ok(isOperatorResolution('false_positive'));
  assert.ok(isOperatorResolution('accepted'));
  // Picking these in the console would record that nobody looked at a finding
  // somebody is demonstrably looking at.
  assert.equal(isOperatorResolution('auto_resolved'), false);
  assert.equal(isOperatorResolution('expired'), false);
  assert.equal(isOperatorResolution('sort_of'), false);
});

// ── the safety-critical baseline ─────────────────────────────────

/** An observation one hour after the entry's repair landed. */
function seenAfterRepair(entry: (typeof SAFETY_BASELINE)[number]): string {
  return new Date(Date.parse(entry.reappearsAs!.verifiedAt) + 3_600_000).toISOString();
}

/** An observation one hour before it — the shape of stale residue. */
function seenBeforeRepair(entry: (typeof SAFETY_BASELINE)[number]): string {
  return new Date(Date.parse(entry.reappearsAs!.verifiedAt) - 3_600_000).toISOString();
}

test('the register is non-empty and every entry is checkable or says why not', () => {
  // An empty register would report "all clear" forever — the confident-pass
  // shape this subsystem keeps finding in itself.
  assert.ok(SAFETY_BASELINE.length >= 5);
  for (const e of SAFETY_BASELINE) {
    assert.ok(e.reappearsAs || e.guardedBy, `${e.id} must be checkable or name its CI guard`);
    assert.ok(e.closedBy.length > 0, `${e.id} must say what closed it`);
    assert.ok(e.consequence.length > 40, `${e.id} must say why it mattered`);
    // A signature without a repair instant cannot be compared against a
    // finding's age, which is the whole rule below.
    if (e.reappearsAs) {
      assert.ok(
        Number.isFinite(Date.parse(e.reappearsAs.verifiedAt)),
        `${e.id} must date its repair to an instant`,
      );
    }
  }
});

test('a baseline defect seen again AFTER its repair is reported as regressed', () => {
  const entry = SAFETY_BASELINE.find((e) => e.reappearsAs)!;
  const a = assessBaseline(SAFETY_BASELINE, [
    {
      check_id: entry.reappearsAs!.checkId,
      rule_key: entry.reappearsAs!.ruleKey,
      entity_key: 'x',
      last_seen_at: seenAfterRepair(entry),
    },
  ]);

  assert.equal(a.gateMet, false);
  assert.deepEqual(
    a.regressed.map((e) => e.id),
    [entry.id],
  );
});

// ── the 2026-08-04 false critical ────────────────────────────────
//
// feedback-public-write-grants was reported as regressed while the grants were
// gone from production. schema_invariants raised the finding at 18:00, the
// revoke landed at 18:15, and the check is DAILY — so nothing had re-examined
// the grants when known_regressions, which is hourly, read that still-open row
// at 21:00 and called the repair failed.
test('a finding older than the repair is not a regression — nothing has looked since', () => {
  const entry = SAFETY_BASELINE.find((e) => e.reappearsAs)!;
  const a = assessBaseline(SAFETY_BASELINE, [
    {
      check_id: entry.reappearsAs!.checkId,
      rule_key: entry.reappearsAs!.ruleKey,
      entity_key: 'x',
      last_seen_at: seenBeforeRepair(entry),
    },
  ]);

  assert.deepEqual(a.regressed, []);
  assert.deepEqual(
    a.unverified.map((e) => e.id),
    [entry.id],
  );
});

test('stale evidence reports unproven, not passing — the gate is not told all-clear', () => {
  // The direction that matters. Reporting `false` here would cry wolf; the
  // worse failure is reporting `true` and certifying a repair nothing
  // re-checked, so the answer is neither.
  const entry = SAFETY_BASELINE.find((e) => e.reappearsAs)!;
  const a = assessBaseline(SAFETY_BASELINE, [
    {
      check_id: entry.reappearsAs!.checkId,
      rule_key: entry.reappearsAs!.ruleKey,
      last_seen_at: seenBeforeRepair(entry),
    },
  ]);
  assert.equal(a.gateMet, null);
});

test('no regression finding is filed for evidence that is merely stale', () => {
  const entry = SAFETY_BASELINE.find((e) => e.reappearsAs)!;
  assert.deepEqual(
    deriveRegressionFindings([
      {
        check_id: entry.reappearsAs!.checkId,
        rule_key: entry.reappearsAs!.ruleKey,
        last_seen_at: seenBeforeRepair(entry),
      },
    ]),
    [],
  );
});

test('a regression outranks stale evidence for the same entry', () => {
  // Two open rows can match one signature. One fresh observation is enough:
  // the defect was seen after the repair, whatever else is lying around.
  const entry = SAFETY_BASELINE.find((e) => e.reappearsAs)!;
  const a = assessBaseline(SAFETY_BASELINE, [
    {
      check_id: entry.reappearsAs!.checkId,
      rule_key: entry.reappearsAs!.ruleKey,
      last_seen_at: seenBeforeRepair(entry),
    },
    {
      check_id: entry.reappearsAs!.checkId,
      rule_key: entry.reappearsAs!.ruleKey,
      last_seen_at: seenAfterRepair(entry),
    },
  ]);

  assert.deepEqual(
    a.regressed.map((e) => e.id),
    [entry.id],
  );
  assert.deepEqual(a.unverified, []);
  assert.equal(a.gateMet, false);
});

test('an unreadable timestamp is treated as stale, not as a fresh sighting', () => {
  const entry = SAFETY_BASELINE.find((e) => e.reappearsAs)!;
  const a = assessBaseline(SAFETY_BASELINE, [
    {
      check_id: entry.reappearsAs!.checkId,
      rule_key: entry.reappearsAs!.ruleKey,
      last_seen_at: 'not a date',
    },
  ]);
  assert.deepEqual(a.regressed, []);
  assert.equal(a.gateMet, null);
});

test('a clean ledger reports closed, and does not claim the CI-guarded ones', () => {
  const a = assessBaseline(SAFETY_BASELINE, []);
  assert.equal(a.gateMet, true);
  assert.deepEqual(a.unverified, []);
  assert.ok(a.guardedElsewhere.length > 0, 'some defects no check can see');
  assert.equal(a.ledgerVisible, SAFETY_BASELINE.length - a.guardedElsewhere.length);
});

test('a regression is filed as critical, separately from the rule that found it', () => {
  const entry = SAFETY_BASELINE.find((e) => e.reappearsAs)!;
  const findings = deriveRegressionFindings([
    {
      check_id: entry.reappearsAs!.checkId,
      rule_key: entry.reappearsAs!.ruleKey,
      last_seen_at: seenAfterRepair(entry),
    },
  ]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'known_defect_regressed');
  assert.equal(severityForRule(findings[0].ruleKey), 'critical');
  // The point of the duplicate row: it says a repair did not hold, naming what
  // closed it originally. That is a different fact from the condition itself.
  assert.match(findings[0].detail, /has come back/);
  assert.match(findings[0].detail, new RegExp(entry.closedBy.split(' ')[0].slice(0, 20)));
  // And it states the evidence standard it is claiming, because the false
  // critical read identically to a real one.
  assert.match(findings[0].detail, /observed again by a run that started after the repair/);
});

test('a snoozed regression still counts — silence is not a fix', () => {
  // known-regressions.ts reads status in ('open','snoozed') for this reason.
  const entry = SAFETY_BASELINE.find((e) => e.reappearsAs)!;
  const a = assessBaseline(SAFETY_BASELINE, [
    {
      check_id: entry.reappearsAs!.checkId,
      rule_key: entry.reappearsAs!.ruleKey,
      last_seen_at: seenAfterRepair(entry),
    },
  ]);
  assert.equal(a.gateMet, false);
});

// ── the bounded queue ────────────────────────────────────────────

const REGISTERED = ['validate_river_data', 'eddy_knowledge'];

function candidate(over: Partial<Parameters<typeof planDecay>[0][number]> = {}) {
  return {
    id: 'f1',
    check_id: 'eddy_knowledge',
    severity: 'low',
    status: 'open',
    first_seen_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const NOW = new Date('2026-08-04T12:00:00Z');

test('stale informational findings are shelved, not closed', () => {
  // Auto-closing a persistent condition is a treadmill: it closes, the check
  // re-emits it, reconciliation raises it again with occurrences incremented.
  // A snooze takes it off the list without pretending it went away.
  const plan = planDecay([candidate()], NOW, REGISTERED);
  assert.equal(plan.shelve.length, 1);
  assert.equal(plan.expire.length, 0);
  assert.ok(new Date(plan.shelve[0].until).getTime() > NOW.getTime());
});

test('severity above informational is never shelved automatically', () => {
  // A medium is a wrong number on a real surface; a critical can change a
  // go/no-go answer. Shelving either because nobody got to it would be the
  // console deciding what matters, which is the operator's job.
  for (const severity of ['critical', 'high', 'medium']) {
    const plan = planDecay([candidate({ severity })], NOW, REGISTERED);
    assert.deepEqual(plan.shelve, [], `${severity} must not be shelved`);
  }
});

test('a young finding is left alone', () => {
  const plan = planDecay(
    [candidate({ first_seen_at: '2026-08-01T00:00:00Z' })],
    NOW,
    REGISTERED,
  );
  assert.deepEqual(plan.shelve, []);
});

test('the clock is first_seen_at, not last_seen_at', () => {
  // last_seen_at refreshes every run, so keying on it would mean a finding the
  // check keeps confirming never ages — precisely backwards.
  const plan = planDecay(
    [{ ...candidate(), first_seen_at: '2026-01-01T00:00:00Z' }],
    NOW,
    REGISTERED,
  );
  assert.equal(plan.shelve.length, 1, 'age is measured from when it first appeared');
});

test('findings orphaned by a removed check are closed, at any severity or age', () => {
  // Nothing emits them, so reconciliation will never resolve them. Leaving them
  // open is not caution — it is a permanent entry nobody can act on.
  const plan = planDecay(
    [
      candidate({ id: 'orphan', check_id: 'deleted_check', severity: 'critical' }),
      candidate({ id: 'fresh-orphan', check_id: 'deleted_check', first_seen_at: NOW.toISOString() }),
    ],
    NOW,
    REGISTERED,
  );
  assert.deepEqual(plan.expire.sort(), ['fresh-orphan', 'orphan']);
  assert.equal(plan.resolution, 'expired', 'nobody looked, so it must not flatter the rate');
});

test('an already-snoozed informational finding is not shelved again', () => {
  const plan = planDecay([candidate({ status: 'snoozed' })], NOW, REGISTERED);
  assert.deepEqual(plan.shelve, []);
});

test('the shelf is no longer than an operator could choose by hand', () => {
  // MAX_SNOOZE_DAYS in the finding routes is 90. Automation must not be granted
  // more reach than the person it is standing in for.
  assert.ok(DEFAULT_DECAY_POLICY.shelveForDays <= 90);
  assert.ok(DEFAULT_DECAY_POLICY.staleAfterDays >= 28, 'longer than any check cadence');
});
