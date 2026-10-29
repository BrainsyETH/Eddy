import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripComments, walk } from './source-copy-sweep';

/**
 * Three verbs name Eddy's three trip flows, on the website and in the app:
 * Plan a float (choose a put-in and take-out), Find a float (Eddy suggests
 * one), Start a float (record it). Keeping one is Save / Saved floats.
 *
 * The planner alone used to answer to eight names — Build a Route, Plan a
 * Trip, Open the planner, Float this route among them — so a floater could not
 * tell that two buttons led to the same place. The rule lives in
 * `.stitch/DESIGN.md` ("Voice & naming"); this sweep keeps the retired names
 * from drifting back into copy. URLs, route names and analytics event names
 * are not copy and are not checked.
 */
const RETIRED = [
  /\bbuild (?:a|this) route\b/i,
  /\bfind a route\b/i,
  /\bfloat this route\b/i,
  /\bplan a trip\b/i,
  /\bopen the planner\b/i,
  /\bstart tracking\b/i,
  /\bfloats? (?:to|from) favorites\b/i,
];

const ROOTS = ['src/app', 'src/components', 'src/lib', 'shared', '../eddy-ios/app', '../eddy-ios/src'];

test('trip flows use Plan, Find and Start, not the retired names', () => {
  const files = ROOTS.flatMap((root) => walk(root)).filter((file) => !/\.(?:test|spec)\.tsx?$/.test(file));

  const offenders = files.flatMap((file) =>
    stripComments(readFileSync(file, 'utf8'))
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => RETIRED.some((pattern) => pattern.test(line)))
      .map(({ line, number }) => `${file}:${number} — ${line.trim()}`),
  );

  assert.deepEqual(
    offenders,
    [],
    `Use Plan a float / Find a float / Start a float / Save (see .stitch/DESIGN.md):\n${offenders.join('\n')}`,
  );
});
