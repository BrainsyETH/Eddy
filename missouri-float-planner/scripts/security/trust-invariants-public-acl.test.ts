import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── what this guards, and why it is a text assertion ─────────────
//
// Everywhere else in the trust subsystem I argued that asserting on migration
// TEXT is weaker than asserting on the live catalog, because a file cannot
// prove a statement reached production. That is still true — and this test is
// deliberately the other kind, because it guards a different property.
//
// The live-catalog half is already covered: trust_schema_invariants() runs
// hourly against production and reports what it finds. What no runtime check
// can catch is the QUERY ITSELF being blind, because a blind query returns a
// confident pass. That is a property of the source, so the source is where it
// has to be asserted.
//
// The bug: aclexplode() represents the pseudo-role PUBLIC as grantee 0, which
// has no pg_roles row. `join pg_roles r on r.oid = a.grantee` therefore drops
// every PUBLIC grant, and `GRANT INSERT ... TO PUBLIC` — which reaches anon,
// since anon is a member of PUBLIC — passed the check clean.

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

/** The live definition is the newest migration that defines the function. */
function latestInvariantsMigration(): { name: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS_DIR, files[i]), 'utf-8');
    if (sql.includes('function public.trust_schema_invariants()')) {
      return { name: files[i], sql };
    }
  }
  throw new Error('No migration defines trust_schema_invariants()');
}

/** Just the executable statements — the headers discuss the bug at length. */
function withoutComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

test('the grant checks do not inner-join pg_roles on the ACL grantee', () => {
  // The regression, stated as the shape that caused it. An inner join here is
  // the bug: it cannot represent PUBLIC, and its failure mode is a false pass
  // on a security invariant.
  const { name, sql } = latestInvariantsMigration();
  const code = withoutComments(sql);

  assert.equal(
    /\n\s*join pg_roles r on r\.oid = a\.grantee/.test(code),
    false,
    `${name} inner-joins pg_roles on the ACL grantee, which drops PUBLIC (grantee 0)`,
  );
});

test('every aclexplode grant check accepts grantee 0', () => {
  const { name, sql } = latestInvariantsMigration();
  const code = withoutComments(sql);

  const aclUses = (code.match(/aclexplode\(/g) ?? []).length;
  const publicAware = (code.match(/a\.grantee = 0/g) ?? []).length;

  assert.ok(aclUses > 0, `${name} no longer uses aclexplode — update this guard if deliberate`);
  assert.equal(
    publicAware,
    aclUses,
    `${name} has ${aclUses} aclexplode call(s) but only ${publicAware} accept grantee 0 (PUBLIC)`,
  );
});

test('PUBLIC is named in the output rather than rendered as an empty string', () => {
  // coalesce(r.rolname, 'PUBLIC') — without it the LEFT join produces a null
  // rolname, string_agg drops the row, and the detail says "write grants still
  // held ()" while naming nothing.
  const { name, sql } = latestInvariantsMigration();
  assert.match(
    withoutComments(sql),
    /coalesce\(r\.rolname, 'PUBLIC'\)/,
    `${name} does not label grantee 0 as PUBLIC in its detail output`,
  );
});

test('the function stays execute-revoked from the public roles', () => {
  // Its output is a list of the schema's weak spots.
  const { name, sql } = latestInvariantsMigration();
  const code = withoutComments(sql);
  assert.match(code, /revoke all on function public\.trust_schema_invariants\(\)/, name);
  assert.match(code, /grant execute on function public\.trust_schema_invariants\(\) to service_role/, name);
});
