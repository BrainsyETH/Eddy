#!/usr/bin/env npx tsx
// Runs only the web tests this branch's changes can affect: `npm run test:changed`.
// A fast inner loop, NOT a gate. `npm test` (and `make check-web`, and CI) still
// run everything. Selection rules: scripts/lib/test-selection.ts.
//
//   npm run test:changed                     # vs. the merge base with origin/main, plus uncommitted and untracked files
//   npm run test:changed -- --base HEAD~1    # vs. any ref
//   npm run test:changed -- --list           # print the selection and why, run nothing

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { manifestChangeMatters, registeredTests, repoGraph, selectTests } from './lib/test-selection';

const webRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const baseFlag = args.indexOf('--base');

function git(...gitArgs: string[]): string {
  const run = spawnSync('git', gitArgs, { cwd: webRoot, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ${gitArgs.join(' ')} failed:\n${run.stderr}`);
  return run.stdout.trim();
}

function defaultBase(): string {
  for (const ref of ['origin/main', 'main']) {
    const run = spawnSync('git', ['merge-base', 'HEAD', ref], { cwd: webRoot, encoding: 'utf8' });
    if (run.status === 0) return run.stdout.trim();
  }
  throw new Error('no origin/main or main to compare against; pass --base <ref>');
}

const base = baseFlag >= 0 ? args[baseFlag + 1] : defaultBase();
const repoRoot = git('rev-parse', '--show-toplevel');
const changedFromRoot = new Set(
  [
    git('diff', '--name-only', base),
    git('ls-files', '--others', '--exclude-standard', '--full-name', repoRoot),
  ]
    .join('\n')
    .split('\n')
    .filter(Boolean),
);
const manifestAtBase = spawnSync('git', ['show', `${base}:./package.json`], { cwd: webRoot, encoding: 'utf8' });
const manifestNow = readFileSync(path.join(webRoot, 'package.json'), 'utf8');
const changed = [...changedFromRoot]
  .map((f) => path.relative(webRoot, path.join(repoRoot, f)))
  .filter((f) => f !== 'package.json' || manifestChangeMatters(manifestAtBase.status === 0 ? manifestAtBase.stdout : null, manifestNow))
  .sort();

const tests = registeredTests(JSON.parse(manifestNow));
const selection = selectTests({ tests, changed, webRoot, graph: repoGraph(webRoot) });

console.log(`${changed.length} changed file(s) since ${base.slice(0, 12)}`);
if (selection.everything) {
  console.log(`running all ${tests.length} test files: ${selection.reasons.get(tests[0])}`);
} else {
  console.log(`running ${selection.tests.length} of ${tests.length} test files:`);
  for (const t of selection.tests) console.log(`  ${t}  (${selection.reasons.get(t)})`);
}
if (listOnly) process.exit(0);

const run = spawnSync(
  path.join(webRoot, 'node_modules', '.bin', 'tsx'),
  ['--tsconfig', 'tsconfig.test.json', '--test', ...selection.tests],
  { cwd: webRoot, stdio: 'inherit' },
);
process.exit(run.status ?? 1);
