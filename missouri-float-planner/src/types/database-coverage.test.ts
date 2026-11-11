// Every table the code queries by name must exist in the generated types.
//
// The Supabase clients are untyped today (createAdminClient returns a plain
// SupabaseClient), so src/types/database.ts protects almost nothing — and it
// had quietly fallen behind the schema: six tables queried in code were not in
// it. Typing the clients is a gradual migration; this check is the cheap floor
// under it. A table that appears in a `.from('…')` must be in database.ts, so a
// typo or a table that does not exist shows up here instead of as a runtime
// error in production.
//
// Regenerate with `npm run db:gen-types` (reads the schema only) and remove
// entries from KNOWN_MISSING as they appear. Never add one for a real table:
// regenerate instead.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Queried in code but absent from database.ts, as of 2026-11-11 (checked
 * against production read-only):
 */
const KNOWN_MISSING = new Map<string, string>([
  ['chat_logs', 'does NOT exist in production (00078 never applied); chat is disabled — see api/chat/route.ts'],
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

test('every table queried by name is in the generated database types', () => {
  const types = readFileSync('src/types/database.ts', 'utf8');
  const known = new Set([...types.matchAll(/^ {6}(\w+): \{\n {8}Row:/gm)].map((m) => m[1]));
  assert.ok(known.size > 50, 'database.ts did not parse as expected');

  const queried = new Set<string>();
  for (const file of sourceFiles('src')) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)) queried.add(m[1]);
  }

  const missing = [...queried].filter((table) => !known.has(table)).sort();
  assert.deepEqual(missing, [...KNOWN_MISSING.keys()].sort(),
    'A table is queried that database.ts does not know (typo, or regenerate types), or a KNOWN_MISSING entry is now resolved');
});
