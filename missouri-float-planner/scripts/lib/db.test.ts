import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getScriptClient, loadEnvLocal } from './db';

// These tests exercise the real .env.local loader, so the FIRST thing this
// file does is move cwd into a temp directory with a fixture file — otherwise
// loadEnvLocal would slurp the developer's actual .env.local into process.env
// and every assertion below would depend on their machine. The node test
// runner executes each test file in its own process, so the chdir cannot leak
// into other suites.
const dir = mkdtempSync(join(tmpdir(), 'eddy-db-guard-'));
writeFileSync(
  join(dir, '.env.local'),
  [
    'NEXT_PUBLIC_SUPABASE_URL="https://testref.supabase.co"',
    "SUPABASE_SERVICE_ROLE_KEY='service-role-key'",
    '# a stored pin must NOT count as confirmation — the loader skips this line',
    'EXPECTED_SUPABASE_REF=testref',
    'export QUOTED_EXTRA=plain',
    '',
  ].join('\n'),
);
process.chdir(dir);

for (const name of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'EXPECTED_SUPABASE_REF',
  'QUOTED_EXTRA',
]) {
  delete process.env[name];
}

// The file is authoritative: a stale shell export must lose to it.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stale-shell-value.supabase.co';

test('loadEnvLocal loads the file, strips quotes, and overrides the shell', () => {
  loadEnvLocal();
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://testref.supabase.co');
  assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, 'service-role-key');
  assert.equal(process.env.QUOTED_EXTRA, 'plain');
});

test('loadEnvLocal never reads EXPECTED_SUPABASE_REF from the file', () => {
  assert.equal(process.env.EXPECTED_SUPABASE_REF, undefined);
});

test('a read client needs no pin', () => {
  const client = getScriptClient({ script: 'db-test', write: false });
  assert.equal(typeof client.from, 'function');
});

test('an unpinned write aborts with the copy-paste remedy', () => {
  assert.throws(
    () => getScriptClient({ script: 'db-test', write: true }),
    /export EXPECTED_SUPABASE_REF=testref/,
  );
});

test('a mismatched pin aborts', () => {
  process.env.EXPECTED_SUPABASE_REF = 'someotherref';
  try {
    assert.throws(
      () => getScriptClient({ script: 'db-test', write: true }),
      /'testref' != EXPECTED_SUPABASE_REF 'someotherref'/,
    );
  } finally {
    delete process.env.EXPECTED_SUPABASE_REF;
  }
});

test('a matching pin from the shell allows the write client', () => {
  process.env.EXPECTED_SUPABASE_REF = 'testref';
  try {
    const client = getScriptClient({ script: 'db-test', write: true });
    assert.equal(typeof client.from, 'function');
  } finally {
    delete process.env.EXPECTED_SUPABASE_REF;
  }
});

test('legacy credential names still work but warn', () => {
  const saved = { ...process.env };
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (msg: unknown) => warnings.push(String(msg));
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = 'https://legacyref.supabase.co';
    process.env.SUPABASE_KEY = 'legacy-key';
    const client = getScriptClient({ script: 'db-test', write: false });
    assert.equal(typeof client.from, 'function');
    assert.match(warnings.join('\n'), /legacy name/);
    assert.match(warnings.join('\n'), /SUPABASE_URL, SUPABASE_KEY/);
  } finally {
    console.warn = realWarn;
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_KEY;
  }
});
