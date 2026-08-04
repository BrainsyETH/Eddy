// scripts/admin/no-blocking-dialogs.test.ts
// Fails CI when an admin action depends on window.prompt/confirm/alert.
//
// ── The failure this guards ─────────────────────────────────────────────
//
// The trust console asked for a resolve reason with window.prompt() and treated
// a null return as "the operator cancelled":
//
//     const answer = window.prompt(...);
//     if (answer === null) return;
//
// Browsers suppress these dialogs once a page has shown a few — the "prevent
// this page from creating additional dialogs" checkbox — and a suppressed
// prompt returns null immediately. So every resolve, single and bulk, silently
// became a button that swallowed the click: no dialog, no error, no network
// request, nothing in any log. The operator's report was "I can't resolve them
// individually or in bulk", and the server-side evidence was an absence.
//
// That is the same shape as the discarded PostgREST error this repo has now
// found five times — a failure that presents as nothing happening — except in
// the UI, where the ledger's own console is the thing that stops working.
//
// ── Why a source scan rather than a component test ──────────────────────
//
// The bug is not that the code is wrong; it is that the code depends on a
// browser affordance that can be withdrawn at runtime, by the user, invisibly.
// No unit test reproduces that, because jsdom's prompt does not get suppressed.
// The only reliable check is that the dependency is not there at all.
//
// Confirmation belongs in the page, where it cannot be turned off, and where an
// operator can see what they are confirming while they type the reason.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const SCANNED = 'src/app/admin';

/** `window.prompt(` etc. — the comment mentioning them by name is fine. */
const DIALOG_CALL = /\bwindow\s*\.\s*(prompt|confirm|alert)\s*\(/g;

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
    return /\.tsx?$/.test(full) ? [relative(ROOT, full)] : [];
  });
}

function stripComments(source: string): string {
  // Crude but sufficient: the point is to ignore prose ABOUT these calls while
  // still catching the calls themselves.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

test('no admin action depends on a dialog the browser can suppress', () => {
  const violations: string[] = [];

  for (const file of walk(SCANNED).filter((f) => !f.endsWith('.test.tsx'))) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    for (const match of stripComments(source).matchAll(DIALOG_CALL)) {
      violations.push(`${file}:${lineOf(source, match.index)} — window.${match[1]}()`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    'Admin actions must confirm in the page, not through window.prompt/confirm/alert. ' +
      'Browsers suppress these after a few uses and a suppressed prompt returns null, ' +
      'which reads as a cancel — so the button silently does nothing, with no error and ' +
      'no request. Render the confirmation as state.\n\n' +
      violations.join('\n'),
  );
});

test('the scan reaches the admin console it claims to', () => {
  // A guard whose file list quietly went empty would pass forever, which is the
  // same absence-looks-like-health failure it exists to catch.
  const files = walk(SCANNED);
  assert.ok(files.length >= 10, `expected to scan the admin app, found ${files.length} files`);
  assert.ok(files.includes('src/app/admin/trust/page.tsx'), 'the trust console must be in scope');
});
