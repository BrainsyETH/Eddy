import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// ── Every test file must be named in the test script ─────────────────────
//
// package.json's `test` script lists each file explicitly. There is no glob, so
// a test file that nobody remembers to add is not a test that fails — it is a
// test that never runs, and it looks exactly like a passing one.
//
// This is not hypothetical. src/lib/trust/checks/service-geo-consistency.test.ts
// shipped in 82680ab — a commit titled "Make the service pin check something
// that runs, not something we remember" — and was never added to the script. Its
// fourteen assertions had never executed once when the first version of this
// guard was written. They pass, which is the unsettling part: nothing would have
// told anyone if they did not.
//
// Tests deliberately live under the web app while importing pure logic from
// the mobile app and shared packages. Keep one runner (and its test tsconfig),
// but make its explicit registration list mechanically complete.
//
// Runs as its own CI step (.github/workflows/app-ci.yml) rather than as a test
// file, so the check cannot be skipped by the same forgetfulness it exists to
// catch. `make check-web` runs it in the same position.
const repositoryRoot = path.resolve(process.cwd(), '..');
const webRoot = process.cwd();
const searchRoots = ['missouri-float-planner', 'eddy-ios', 'packages'];
const generatedDirectories = new Set([
  '.expo',
  '.next',
  'build',
  'dist',
  'node_modules',
]);

function discoverTests(directory: string, tests: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (generatedDirectories.has(entry.name)) continue;
      if (entry.name === 'out' && path.basename(directory) === 'remotion') continue;
      discoverTests(fullPath, tests);
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      tests.push(path.relative(webRoot, fullPath).split(path.sep).join('/'));
    }
  }
}

const packageJson = JSON.parse(
  readFileSync(path.join(webRoot, 'package.json'), 'utf8'),
) as { scripts?: Record<string, string> };
const testCommand = packageJson.scripts?.test ?? '';
const registered = new Set(testCommand.match(/[\w./-]+\.test\.tsx?/g) ?? []);
const discovered: string[] = [];

for (const root of searchRoots) {
  discoverTests(path.join(repositoryRoot, root), discovered);
}

// Guards the guard. A walk that silently found nothing, or a regex that stopped
// matching the script, would otherwise report a clean run forever — the exact
// failure mode this script exists to prevent, relocated one level up.
if (discovered.length < 50) {
  console.error(`Discovery found only ${discovered.length} test files; the walk is broken.`);
  process.exit(1);
}
if (registered.size < 50) {
  console.error(`Parsed only ${registered.size} paths from the test script; the parse is broken.`);
  process.exit(1);
}

const discoveredSet = new Set(discovered);
const missing = discovered.filter((test) => !registered.has(test)).sort();
const absent = [...registered].filter((test) => !discoveredSet.has(test)).sort();

if (missing.length > 0) {
  console.error('Test files missing from package.json test command:');
  for (const test of missing) console.error(test);
}

if (absent.length > 0) {
  console.error('Test files registered in package.json but not found:');
  for (const test of absent) console.error(test);
}

if (missing.length > 0 || absent.length > 0) process.exitCode = 1;
else console.log(`All ${discovered.length} test files are registered.`);
