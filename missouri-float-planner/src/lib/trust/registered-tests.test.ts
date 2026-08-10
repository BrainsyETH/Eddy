import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// ── Every test file must be named in the test script ─────────────────
//
// package.json's `test` script lists each file explicitly. There is no glob, so
// a test file that nobody remembers to add is not a test that fails — it is a
// test that never runs, and it looks exactly like a passing one.
//
// This is not hypothetical. src/lib/trust/checks/service-geo-consistency.test.ts
// shipped in 82680ab — a commit titled "Make the service pin check something
// that runs, not something we remember" — and was never added to the script. Its
// fourteen assertions had never executed once when this guard was written. They
// pass, which is the unsettling part: nothing would have told anyone if they did
// not.
//
// The house alternative would be a glob, and the header of the test script is
// not the place to relitigate that. This closes the gap the explicit list
// leaves, the same way no-legacy-urls.test.ts closes the one a shared constant
// leaves: by making completeness mechanical rather than remembered.

const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'build']);
const SEARCH_ROOTS = ['src', 'shared', 'scripts'];

function walk(directory: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

test('every test file is listed in the package.json test script', () => {
  const projectRoot = process.cwd();
  const pkg = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const script = pkg.scripts?.test ?? '';
  assert.ok(script.length > 0, 'package.json has no test script');

  const listed = new Set(script.match(/[\w./-]+\.test\.tsx?/g) ?? []);
  assert.ok(listed.size > 50, `expected the script to name many files, saw ${listed.size}`);

  const onDisk: string[] = [];
  for (const root of SEARCH_ROOTS) {
    for (const file of walk(path.resolve(projectRoot, root))) {
      onDisk.push(path.relative(projectRoot, file));
    }
  }

  // Guards the guard: a walk that silently found nothing would pass forever.
  assert.ok(onDisk.length > 50, `expected to find test files on disk, saw ${onDisk.length}`);

  const missing = onDisk.filter((file) => !listed.has(file)).sort();
  assert.deepEqual(
    missing,
    [],
    `these test files exist but never run — add them to the "test" script in ` +
      `package.json:\n${missing.join('\n')}`,
  );
});

test('every file the test script names still exists', () => {
  // The other direction. A renamed or deleted file leaves a stale entry, and
  // `tsx --test` on a path that does not exist fails the whole run — noisy
  // rather than silent, but this says which entry is wrong instead of making
  // someone read a stack trace.
  const projectRoot = process.cwd();
  const pkg = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const listed = (pkg.scripts?.test ?? '').match(/[\w./-]+\.test\.tsx?/g) ?? [];

  const absent = listed
    .filter((file) => {
      try {
        return !statSync(path.resolve(projectRoot, file)).isFile();
      } catch {
        return true;
      }
    })
    .sort();

  assert.deepEqual(absent, [], `named in the test script but not on disk:\n${absent.join('\n')}`);
});
