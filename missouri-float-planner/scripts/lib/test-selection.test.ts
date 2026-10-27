import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  ALWAYS_RUN,
  manifestChangeMatters,
  moduleSpecifiers,
  pathLiterals,
  registeredTests,
  repoGraph,
  selectTests,
} from './test-selection';

const webRoot = process.cwd();
const tests = registeredTests(JSON.parse(readFileSync(path.join(webRoot, 'package.json'), 'utf8')));
const graph = repoGraph(webRoot);
const select = (...changed: string[]) => selectTests({ tests, changed, webRoot, graph });

test('import specifiers are found in every form the suite uses', () => {
  const source = `
    import assert from 'node:assert/strict';
    import {
      a,
      b,
    } from '../lib/thing';
    import type { T } from "@eddy/types";
    export { c } from './c';
    import './side-effect';
    const lazy = await import('@/lib/lazy');
    const old = require('../old');
  `;
  assert.deepEqual(new Set(moduleSpecifiers(source)), new Set([
    'node:assert/strict', '../lib/thing', '@eddy/types', './c', './side-effect', '@/lib/lazy', '../old',
  ]));
});

test('path-like literals are kept; prose, URLs and interpolations are not', () => {
  const literals = pathLiterals(`
    join(APP, 'src', 'components', 'MapLayersSheet.tsx');
    readFileSync('../docs/ios-release-runbook.md');
    const ROOTS = ['src', 'shared'];
    fetch('https://eddy.guide/api');
    assert.ok(x, 'expected the script to name many files');
    const p = \`src/\${name}.ts\`;
  `);
  for (const kept of ['src', 'components', 'MapLayersSheet.tsx', '../docs/ios-release-runbook.md', 'shared']) {
    assert.ok(literals.includes(kept), kept);
  }
  assert.ok(!literals.some((l) => l.startsWith('https:') || l.includes(' ') || l.includes('${')));
});

test('a change to a shared module selects the tests that import it, directly or not', () => {
  const s = select('shared/condition-system.ts');
  assert.equal(s.everything, false);
  assert.ok(s.tests.includes('shared/condition-system.test.ts'));
  // Through src/lib/conditions.ts, not a direct import.
  assert.ok(s.tests.includes('src/lib/conditions.test.ts'));
  assert.ok(s.tests.length < tests.length / 2, `selected ${s.tests.length} of ${tests.length}`);
});

test('files a test reads rather than imports select it', () => {
  assert.ok(select('../docs/ios-release-runbook.md').tests.includes('src/lib/ios-release-runbook.test.ts'));
  assert.ok(select('../.github/workflows/app-ci.yml').tests.includes('scripts/security/workflow-action-pins.test.ts'));
  assert.ok(select('scripts/ingestion/service-river-facts.csv').tests.includes('scripts/import-service-river-facts.test.ts'));
});

test('iOS app source reaches the web tests that cover it', () => {
  assert.ok(select('../eddy-ios/src/lib/floatSession.ts').tests.includes('src/lib/float-session.test.ts'));
});

test('a changed or new test file runs, and the registration guard always runs', () => {
  const s = select('src/lib/rate-limit.test.ts');
  assert.ok(s.tests.includes('src/lib/rate-limit.test.ts'));
  for (const t of ALWAYS_RUN) assert.ok(s.tests.includes(t));
  assert.deepEqual(select().tests, ALWAYS_RUN);
});

test('registering a test is not a manifest change; anything else in package.json is', () => {
  const before = JSON.stringify({ scripts: { test: 'tsx --test a.test.ts', lint: 'eslint' }, dependencies: { zod: '4.6.7' } });
  const registered = JSON.stringify({ scripts: { test: 'tsx --test a.test.ts b.test.ts', lint: 'eslint' }, dependencies: { zod: '4.6.7' } });
  const bumped = JSON.stringify({ scripts: { test: 'tsx --test a.test.ts', lint: 'eslint' }, dependencies: { zod: '4.6.8' } });
  assert.equal(manifestChangeMatters(before, registered), false);
  assert.equal(manifestChangeMatters(before, bumped), true);
  assert.equal(manifestChangeMatters(null, registered), true, 'a new manifest matters');
});

test('manifest, lockfile and tsconfig changes run everything', () => {
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.test.json', '../.nvmrc']) {
    const s = select('src/lib/rate-limit.ts', file);
    assert.equal(s.everything, true, file);
    assert.deepEqual(s.tests, tests);
  }
});
