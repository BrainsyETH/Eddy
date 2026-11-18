#!/usr/bin/env npx tsx
/**
 * run-tests.ts — what `npm test` runs.
 *
 * Runs node's test runner, through tsx and tsconfig.test.json, over every file
 * listed in test-files.txt. The list lives in its own file, one path per line,
 * because as a single line in package.json it could not be merged: two branches
 * that each added a test conflicted on it, and resolving either way silently
 * dropped the other's files. See the header of test-files.txt.
 *
 * Arguments are passed to the test runner ahead of the files:
 *   npm test -- --test-name-pattern="flat forecast"
 * To run some files only, call tsx directly:
 *   npx tsx --tsconfig tsconfig.test.json --test src/lib/eddy/read-checks.test.ts
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readTestFiles } from './lib/test-files';

// npm runs scripts from the package root, as every script here assumes.
const projectRoot = process.cwd();
const files = [...new Set(readTestFiles(projectRoot))];
if (files.length === 0) {
  console.error('test-files.txt lists no test files.');
  process.exit(1);
}

const tsx = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const result = spawnSync(tsx, ['--tsconfig', 'tsconfig.test.json', '--test', ...process.argv.slice(2), ...files], {
  cwd: projectRoot,
  stdio: 'inherit',
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
// A null status means the runner was killed by a signal: a failure, not a pass.
process.exit(result.status ?? 1);
