import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00174_restrict_segment_cache_mutations.sql'),
  'utf8',
);

test('segment_cache public mutation policies are removed', () => {
  for (const operation of ['insert', 'update', 'delete']) {
    assert.match(
      migration,
      new RegExp(`DROP POLICY IF EXISTS segment_cache_${operation} ON (?:public\\.)?segment_cache`, 'i'),
    );
  }
});

test('anon and authenticated roles lose table mutation privileges', () => {
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE (?:public\.)?segment_cache FROM anon, authenticated/i,
  );
});

test('cache mutation functions are not executable by public roles', () => {
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION (?:public\.)?cache_segment\(UUID, UUID\) FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION (?:public\.)?invalidate_segment_cache\(UUID, UUID\) FROM PUBLIC, anon, authenticated/i,
  );
});

test('legacy cache objects are guarded for schemas where they no longer exist', () => {
  assert.match(migration, /to_regclass\('public\.segment_cache'\) IS NOT NULL/i);
  assert.match(migration, /to_regprocedure\('public\.cache_segment\(uuid,uuid\)'\) IS NOT NULL/i);
});
