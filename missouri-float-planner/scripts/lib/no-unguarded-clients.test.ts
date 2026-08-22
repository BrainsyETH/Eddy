import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// A static ratchet, in the style of src/lib/ai/no-hardcoded-models.test.ts.
//
// scripts/lib/db.ts is the one sanctioned way for an operator script to open a
// Supabase connection: it resolves both credential conventions in one place
// and refuses to hand out a WRITE client unless EXPECTED_SUPABASE_REF names
// the target project. That guard only means something if scripts cannot
// quietly route around it — which is exactly what every pre-existing script
// did, each with its own copy of env parsing and client construction.
//
// This test scans scripts/**/*.ts for direct client construction (a
// `createClient(` call from @supabase/supabase-js, or any use of the app's
// `createAdminClient`) outside scripts/lib/db.ts. Two assertions:
//
//   1. No NEW file may construct a client directly — use
//      getScriptClient({ script, write }) from scripts/lib/db.ts instead.
//   2. The allowlist below may only SHRINK. It is the not-yet-migrated
//      backlog, frozen at the moment the guard landed: every NONE-guard and
//      write-default script from docs/data-pipeline.md was migrated then;
//      what remains is read-only checks and dry-default writers. When you
//      touch one of these files, migrate it and delete its row — an entry
//      that no longer constructs its own client fails the test until removed.
//
// Type-only imports (`import { type SupabaseClient } from '@supabase/supabase-js'`)
// are deliberately not flagged — the guard is about who constructs clients,
// not who names their type.

const LEGACY_DIRECT_CLIENTS = new Set([
  'scripts/calibrate-float-times.ts',
  'scripts/check-access-slugs.ts',
  'scripts/check-eddy-knowledge.ts',
  'scripts/check-service-model.ts',
  'scripts/compare-usgs-percentiles.ts',
  'scripts/fetch-drainage-areas.ts',
  'scripts/fetch-nws-flood-stages.ts',
  'scripts/fix-gauge-associations.ts',
  'scripts/fix-niangua-gauge.ts',
  'scripts/import-floatmissouri.ts',
  'scripts/import-nhd-rivers-from-tnm.ts',
  'scripts/ingestion/camping-availability-dryrun.ts',
  'scripts/ingestion/geocode-services-dryrun.ts',
  'scripts/run-migrations.ts',
  'scripts/run-seeds.ts',
  'scripts/seed-nearby-services.ts',
  'scripts/validate-data.ts',
  'scripts/verify-river-directions.ts',
]);

const ROOT = process.cwd();
const SCRIPTS_DIR = resolve(ROOT, 'scripts');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

function constructsClientDirectly(source: string): boolean {
  return /\bcreateClient\s*\(/.test(source) || /\bcreateAdminClient\b/.test(source);
}

test('every script constructs its Supabase client through scripts/lib/db.ts', () => {
  const offenders: string[] = [];
  const stillLegacy = new Set<string>();

  for (const file of walk(SCRIPTS_DIR)) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (rel === 'scripts/lib/db.ts') continue; // the sanctioned constructor
    if (!constructsClientDirectly(readFileSync(file, 'utf8'))) continue;
    if (LEGACY_DIRECT_CLIENTS.has(rel)) {
      stillLegacy.add(rel);
    } else {
      offenders.push(rel);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `New direct Supabase client construction in scripts/: ${offenders.join(', ')}. ` +
      `Use getScriptClient({ script, write }) from scripts/lib/db.ts — write:true requires ` +
      `EXPECTED_SUPABASE_REF, which is the point.`,
  );

  const stale = [...LEGACY_DIRECT_CLIENTS].filter((f) => !stillLegacy.has(f));
  assert.deepEqual(
    stale,
    [],
    `Allowlist entries that no longer construct their own client (migrated or deleted) — ` +
      `remove them so the ratchet only tightens: ${stale.join(', ')}`,
  );
});
