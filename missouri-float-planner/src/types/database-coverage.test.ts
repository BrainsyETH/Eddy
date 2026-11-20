// Every table the code queries by name must exist in the generated types or
// be declared in a migration that the production ledger still lists as pending.
//
// The Supabase clients are untyped today (createAdminClient returns a plain
// SupabaseClient), so src/types/database.ts protects almost nothing — and it
// had quietly fallen behind the schema: six tables queried in code were not in
// it. Typing the clients is a gradual migration; this check is the cheap floor
// under it. Once a migration is marked applied, its tables must appear in
// database.ts. This catches typos and missed type generation before release.
//
// Regenerate with `npm run db:gen-types` (reads the schema only) and remove
// entries from KNOWN_MISSING as they appear. Never add one for a real table:
// regenerate instead.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_DIR, readRepoLedger } from '../../scripts/lib/migration-ledger';

/**
 * Queried in code but absent from database.ts, as of 2026-11-11 (checked
 * against production read-only):
 */
const KNOWN_MISSING = new Map<string, string>([
  ['chat_logs', 'does NOT exist in production (00078 never applied); chat is disabled — see api/chat/route.ts'],
  // In production since 2026-11-17 (20261117041752_eddy_generation_log.sql), but database.ts has not been
  // regenerated since. Run `npm run db:gen-types` and remove this entry; this test fails once it has.
  ['eddy_generation_log', 'exists in production; database.ts not regenerated since 20261117041752'],
  // In production since 2026-11-13 (20261113033326_release_arrival_trial.sql), but database.ts has not
  // been regenerated since. Run `npm run db:gen-types` and remove these entries; this test fails once it has.
  ['release_arrival_passes', 'exists in production; database.ts not regenerated since 20261113033326'],
  ['release_arrival_predictions', 'exists in production; database.ts not regenerated since 20261113033326'],
  ['release_arrival_outcomes', 'exists in production; database.ts not regenerated since 20261113033326'],
  // In production since 2026-11-18 (20261118215519_dam_generation_alerts.sql, ADR 0020), but database.ts
  // has not been regenerated since. Run `npm run db:gen-types` and remove these entries; this test fails
  // once it has.
  ['dam_generation_alerts', 'exists in production; database.ts not regenerated since 20261118215519'],
  ['dam_generation_alert_events', 'exists in production; database.ts not regenerated since 20261118215519'],
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function declaredPublicTables(sql: string): string[] {
  // Ignore comments, string literals and dollar-quoted function bodies.
  const ddl = sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|(\$(?:[a-z_]\w*)?\$)[\s\S]*?\1/gi, ' ');
  return [...ddl.matchAll(/^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(/gim)]
    .map((match) => match[1].toLowerCase());
}

test('pending DDL contributes only explicitly declared public tables', () => {
  assert.deepEqual(declaredPublicTables(`
    -- CREATE TABLE public.example (id int);
    /* CREATE TABLE public.old_example (id int); */
    DO $body$
    BEGIN
      CREATE TABLE public.at_runtime (id int);
    END;
    $body$;
    CREATE TABLE private.internal_only (id int);
    CREATE TABLE IF NOT EXISTS public.new_alerts (id int);
  `), ['new_alerts']);
});

test('every table queried by name is in the generated types or a pending migration', () => {
  const types = readFileSync('src/types/database.ts', 'utf8');
  const known = new Set([...types.matchAll(/^ {6}(\w+): \{\n {8}Row:/gm)].map((m) => m[1]));
  assert.ok(known.size > 50, 'database.ts did not parse as expected');

  const { ledger } = readRepoLedger();
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (!name.endsWith('.sql') || !ledger.pending.includes(name.split('_')[0])) continue;
    for (const table of declaredPublicTables(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))) known.add(table);
  }

  const queried = new Set<string>();
  for (const file of sourceFiles('src')) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)) queried.add(m[1]);
  }

  const missing = [...queried].filter((table) => !known.has(table)).sort();
  assert.deepEqual(missing, [...KNOWN_MISSING.keys()].sort(),
    'A queried table is absent from database.ts and pending migrations (check the name or regenerate types), or a KNOWN_MISSING entry is now resolved');
});
