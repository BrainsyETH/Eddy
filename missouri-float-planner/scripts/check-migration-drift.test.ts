import assert from 'node:assert/strict';
import test from 'node:test';

import { findMigrationDrift, parseCliError, parseMigrationList } from './check-migration-drift';

test('parses Supabase migration list JSON', () => {
  const rows = parseMigrationList(JSON.stringify([
    { local: '00211', remote: '00211', time: '2026-07-01' },
    { local: '00212', remote: '00212', time: '2026-07-02' },
  ]));

  assert.deepEqual(rows, [
    { local: '00211', remote: '00211' },
    { local: '00212', remote: '00212' },
  ]);
  assert.deepEqual(findMigrationDrift(rows), []);
});

test('ignores the frozen legacy split and finds new drift in either direction', () => {
  const rows = parseMigrationList(JSON.stringify({
    _tag: 'Success',
    value: {
      migrations: [
        { Local: '00212', Remote: '' },
        { Local: '', Remote: '20260729165052' },
        { Local: '20260731010000', Remote: '' },
        { Local: '', Remote: '20260731020000' },
      ],
    },
  }));

  assert.deepEqual(findMigrationDrift(rows), [
    { local: '20260731010000', remote: null },
    { local: null, remote: '20260731020000' },
  ]);
});

test('fails closed when CLI output is invalid or changes shape', () => {
  assert.throws(() => parseMigrationList('not json'), /valid JSON/);
  assert.throws(() => parseMigrationList('{"status":"ok"}'), /migration rows/);
});

test('extracts a machine-readable CLI failure', () => {
  assert.equal(
    parseCliError(JSON.stringify({ _tag: 'Error', error: { message: 'Project is not linked' } })),
    'Project is not linked'
  );
  assert.equal(parseCliError('plain stderr'), null);
});
