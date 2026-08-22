import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Tests deliberately live under the web app while importing pure logic from
// the mobile app and shared packages. Keep one runner (and its test tsconfig),
// but make its explicit registration list mechanically complete.
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

const missing = discovered.filter((test) => !registered.has(test)).sort();
const absent = [...registered]
  .filter((test) => !discovered.includes(test))
  .sort();

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
