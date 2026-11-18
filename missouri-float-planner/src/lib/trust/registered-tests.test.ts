import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseTestFiles, readTestFiles } from '../../../scripts/lib/test-files';

// ── Every test file must be named in test-files.txt ──────────────────
//
// `npm test` runs the files listed in test-files.txt, one per line
// (scripts/run-tests.ts). There is no glob, so a test file that nobody
// remembers to add is not a test that fails — it is a test that never runs,
// and it looks exactly like a passing one.
//
// The list used to be a single line in package.json's `test` script. Two
// branches that each added a test conflicted on that line, and resolving
// toward either side silently dropped the other's files: main went red that
// way twice on 2026-11-18, with seven and eight files unregistered. A list of
// lines merges, and .gitattributes marks the file merge=union.
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

test('every test file is listed in test-files.txt', () => {
  const projectRoot = process.cwd();
  const listed = new Set(readTestFiles(projectRoot));
  assert.ok(listed.size > 50, `expected the list to name many files, saw ${listed.size}`);

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
    `these test files exist but never run — add each on its own line to ` +
      `test-files.txt:\n${missing.join('\n')}`,
  );
});

test('every file the list names still exists', () => {
  // The other direction. A renamed or deleted file leaves a stale entry, and
  // `tsx --test` on a path that does not exist fails the whole run — noisy
  // rather than silent, but this says which entry is wrong instead of making
  // someone read a stack trace. A union merge can also bring back a line one
  // side deleted, and this is what reports it.
  const projectRoot = process.cwd();
  const absent = readTestFiles(projectRoot)
    .filter((file) => {
      try {
        return !statSync(path.resolve(projectRoot, file)).isFile();
      } catch {
        return true;
      }
    })
    .sort();

  assert.deepEqual(absent, [], `named in test-files.txt but not on disk:\n${absent.join('\n')}`);
});

test('the list is one file per line, with no file named twice', () => {
  assert.deepEqual(parseTestFiles('# a comment\n\nsrc/a.test.ts\n  src/b.test.ts  \n# another\n'), ['src/a.test.ts', 'src/b.test.ts']);

  const listed = readTestFiles(process.cwd());
  const twice = listed.filter((file, index) => listed.indexOf(file) !== index);
  assert.deepEqual(twice, [], `listed more than once in test-files.txt:\n${twice.join('\n')}`);
  // One path per line is the whole point: a line holding two is a line that
  // conflicts the way the old single-line script did.
  const crowded = listed.filter((line) => /\s/.test(line));
  assert.deepEqual(crowded, [], `more than one path on a line:\n${crowded.join('\n')}`);
});

test('npm test runs the list, and the list is set to merge by union', () => {
  const projectRoot = process.cwd();
  const pkg = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  // If the script went back to naming files itself, the list would stop being
  // what runs, and every guard above would be checking the wrong thing.
  assert.equal(pkg.scripts?.test, 'tsx scripts/run-tests.ts');
  assert.match(readFileSync(path.join(projectRoot, 'scripts/run-tests.ts'), 'utf8'), /readTestFiles\(projectRoot\)/);
  assert.match(readFileSync(path.join(projectRoot, '.gitattributes'), 'utf8'), /^test-files\.txt merge=union$/m);
});
