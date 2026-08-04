// scripts/security/trust-supabase-error-handling.test.ts
// Fails CI when a Supabase call in the trust subsystem discards its error.
//
// ── Why a source scan and not a code review ──────────────────────────────
//
// The defect this guards is `const { data } = await supabase...` — see the
// header of src/lib/trust/db.ts for the four times it has shipped. It has one
// property that makes review a poor defence: the correct line and the broken
// line differ by seven characters, in the middle of a chain that is otherwise
// identical, and the broken one produces no symptom. It fails by being quiet.
//
// A reviewer catches it by noticing an absence. A regex catches it every time,
// on every file, for free. This is the same trade segment-cache-policy.test.ts
// and workflow-action-pins.test.ts already make in this directory: assert on
// source text, because the property being asserted is a property OF the source.
//
// ── What this cannot do ──────────────────────────────────────────────────
//
// It proves the error is READ, not that it is handled well. A caller could
// destructure `error` and ignore the variable. That is a different and far more
// visible mistake — an unused binding is a lint error and reads as deliberate on
// the page — and it has never been the one that shipped.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();

/**
 * The trust subsystem plus the routes and helpers that write its records.
 *
 * admin-auth.ts is in scope for one function: logAdminAction() swallowed its
 * insert error, so a failed audit write was reported as a successful operator
 * action. The audit log is trust evidence and is held to the same bar.
 */
const SCANNED_ROOTS = [
  'src/lib/trust',
  'src/app/api/admin/trust',
  'src/app/api/cron/trust-tick',
];

const SCANNED_FILES = ['src/lib/admin-auth.ts'];

/**
 * db.ts is where the error IS checked — it is the one file allowed to
 * destructure a raw result, because unwrap() throws on it two lines later.
 *
 * fake-supabase.ts models the client rather than calling it, and every *.test.ts
 * is free to assert on whatever shape it likes.
 */
const EXEMPT = new Set(['src/lib/trust/db.ts', 'src/lib/trust/fake-supabase.ts']);

function walk(dir: string): string[] {
  const absolute = resolve(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(absolute, entry);
    if (statSync(full).isDirectory()) return walk(relative(ROOT, full));
    return full.endsWith('.ts') ? [relative(ROOT, full)] : [];
  });
}

function filesToScan(): string[] {
  return [...SCANNED_ROOTS.flatMap(walk), ...SCANNED_FILES]
    .filter((f) => !f.endsWith('.test.ts'))
    .filter((f) => !EXEMPT.has(f))
    .sort();
}

/** Whether an awaited expression is a PostgREST call rather than ordinary async work. */
function isSupabaseCall(expression: string): boolean {
  return /\bsupabase\b/i.test(expression) && /\.(from|rpc)\s*\(/.test(expression);
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

test('every destructured Supabase result in the trust subsystem reads its error', () => {
  const violations: string[] = [];

  for (const file of filesToScan()) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    // `[^;]+` is safe here: a PostgREST chain never contains a semicolon, and
    // the character class spans newlines, so multi-line chains are matched whole.
    const pattern = /const\s*\{([^}]*)\}\s*=\s*await\s+([^;]+);/g;

    for (const match of source.matchAll(pattern)) {
      const [, bindings, expression] = match;
      if (!isSupabaseCall(expression)) continue;
      if (/\berror\b/.test(bindings)) continue;
      violations.push(
        `${file}:${lineOf(source, match.index)} — destructures {${bindings.trim()}} without error`,
      );
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Supabase results must read their error half. PostgREST resolves with ` +
      `{ data: null, error } instead of throwing, so discarding the error turns ` +
      `every failure into an empty result — which looks exactly like good news. ` +
      `Use the helpers in src/lib/trust/db.ts.\n\n${violations.join('\n')}`,
  );
});

test('no Supabase write in the trust subsystem discards its result entirely', () => {
  const violations: string[] = [];

  for (const file of filesToScan()) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    // A bare `await supabase.from(...)...;` statement — not assigned, not
    // returned, not destructured. This is the form ledger.ts used for every
    // finding mutation, and it is the worst of the family: it reads like a
    // statement that either works or throws, and it is neither.
    const pattern = /(^|\n)[ \t]*await\s+((?:[A-Za-z_$][\w$]*\.)*supabase\s*\n?[\s\S]{0,600}?);/gi;

    for (const match of source.matchAll(pattern)) {
      const expression = match[2];
      if (!isSupabaseCall(expression)) continue;
      violations.push(
        `${file}:${lineOf(source, match.index)} — awaited Supabase call with its result discarded`,
      );
    }
  }

  assert.deepEqual(
    violations,
    [],
    `An awaited Supabase call whose result is thrown away cannot fail loudly. ` +
      `A constraint violation, a revoked grant or a dropped column resolves ` +
      `quietly and the caller reports success. Use mustWrite() from ` +
      `src/lib/trust/db.ts.\n\n${violations.join('\n')}`,
  );
});

test('the scan actually reaches the files it claims to', () => {
  // A guard whose file list silently went empty would pass forever — the same
  // "absence looks like health" failure the trust ledger exists to catch, in the
  // test written to catch it. So assert the corpus, not just the result.
  const files = filesToScan();
  assert.ok(files.length >= 15, `expected to scan the trust subsystem, found ${files.length} files`);
  for (const expected of [
    'src/lib/trust/ledger.ts',
    'src/lib/trust/checks/river-geometry.ts',
    'src/lib/admin-auth.ts',
    'src/app/api/cron/trust-tick/route.ts',
  ]) {
    assert.ok(files.includes(expected), `${expected} must be in scope`);
  }
});
