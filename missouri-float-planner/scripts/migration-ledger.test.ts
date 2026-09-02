import assert from 'node:assert/strict';
import test from 'node:test';

import { LEGACY_REMOTE_THROUGH } from './check-migration-drift';
import {
  LEDGER_BASELINE,
  checkLedger,
  findLedgerDrift,
  localMigrationVersions,
  parseLedger,
  readRepoLedger,
} from './lib/migration-ledger';

// ── The ledger is the record; this test is what makes it one ─────────
//
// Migrations are applied through the Supabase API, which stamps its own
// version. Until 2026-09-02 the only record of what production held was a
// header comment per file, and comments drift: four said NOT YET APPLIED over
// migrations production had held for weeks, three files carried versions
// production had never seen, and three merged migrations sat unapplied under a
// newer one — the state `supabase db push` refuses without --include-all. The
// live check (`make check-db`) needs credentials, so CI never saw any of it.
//
// This file checks the ledger against the checkout without credentials. It
// cannot know what production holds; it can know that the ledger and the
// files agree with each other, and that no file is sitting in the trap.

test('the ledger baseline is the drift checker\'s baseline', () => {
  assert.equal(LEDGER_BASELINE, LEGACY_REMOTE_THROUGH);
});

test('parses sections, ignores comments, keeps order', () => {
  const ledger = parseLedger(`
    # comment
    [applied]
    20260801000000  # trailing comment
    20260802000000

    [pending]
    20260801120000
  `);
  assert.deepEqual(ledger, {
    applied: ['20260801000000', '20260802000000'],
    pending: ['20260801120000'],
  });
});

test('refuses a malformed ledger rather than guessing', () => {
  assert.throws(() => parseLedger('20260801000000'), /before any \[section\]/);
  assert.throws(() => parseLedger('[applied]\n2026080100000'), /not a 14-digit version/);
  assert.throws(() => parseLedger('[applied]\n20260802000000\n20260801000000'), /out of order/);
  assert.throws(() => parseLedger('[applied]\n20260801000000\n[pending]\n20260801000000'), /listed twice/);
  assert.throws(() => parseLedger('[other]\n20260801000000'), /unknown section/);
  assert.throws(() => parseLedger(`[applied]\n${LEDGER_BASELINE}`), /legacy baseline/);
});

test('local versions come from filenames after the baseline only', () => {
  assert.deepEqual(
    localMigrationVersions([
      '00212_legacy.sql',
      '20260729165052_at_baseline.sql',
      '20260802000000_b.sql',
      '20260801000000_a.sql',
      'README.md',
      '20260803000000_not_sql.txt',
    ]),
    ['20260801000000', '20260802000000']
  );
});

test('a clean ledger reports nothing, and a newer unlisted file is a feature branch, not a problem', () => {
  const ledger = parseLedger('[applied]\n20260801000000\n20260802000000');
  assert.deepEqual(checkLedger(ledger, ['20260801000000', '20260802000000', '20260803000000']), []);
});

test('an applied version with no file means the file was applied under another version', () => {
  const ledger = parseLedger('[applied]\n20260801000000\n20260802000000');
  const problems = checkLedger(ledger, ['20260801000000', '20260802000030']);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /20260802000000 has no local migration file/);
});

test('an older file in neither section is the --include-all trap', () => {
  const ledger = parseLedger('[applied]\n20260801000000\n20260803000000');
  const problems = checkLedger(ledger, ['20260801000000', '20260802000000', '20260803000000']);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /20260802000000 is older than the newest applied version 20260803000000/);
  assert.match(problems[0], /--include-all/);

  const listed = parseLedger('[applied]\n20260801000000\n20260803000000\n[pending]\n20260802000000');
  assert.deepEqual(checkLedger(listed, ['20260801000000', '20260802000000', '20260803000000']), []);
});

test('a pending line must name a file that exists and is not applied', () => {
  const stale = parseLedger('[applied]\n20260801000000\n[pending]\n20260802000000');
  const problems = checkLedger(stale, ['20260801000000']);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /pending version 20260802000000 has no local migration file/);
});

test('cross-checking against the live project reports both directions after the baseline', () => {
  const ledger = parseLedger('[applied]\n20260801000000\n20260802000000');
  const drift = findLedgerDrift(['00212', LEDGER_BASELINE, '20260801000000', '20260803000000'], ledger);
  assert.deepEqual(drift, {
    missingFromLedger: ['20260803000000'],
    missingFromRemote: ['20260802000000'],
  });
});

test('the repo ledger and the migrations directory agree', () => {
  const { ledger, local } = readRepoLedger();
  const problems = checkLedger(ledger, local);
  assert.deepEqual(problems, [], ['supabase/production-migrations.txt disagrees with supabase/migrations:', ...problems].join('\n  '));
  assert.ok(ledger.applied.length > 0, 'the ledger lists nothing as applied');
});
