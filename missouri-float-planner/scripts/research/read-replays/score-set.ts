#!/usr/bin/env npx tsx
/**
 * score-set.ts — scores outputs on the saved mornings, or compares two sets.
 *
 * Offline: reads files only, calls nothing.
 *
 * An output set is `stored` (what production published on each recorded
 * morning) or a file replay.ts wrote. Every output is scored, model-written
 * and fallback alike, and the fallbacks are counted with their reasons; see
 * the header of score.ts for why.
 *
 * Usage (from missouri-float-planner/):
 *   npx tsx scripts/research/read-replays/score-set.ts stored
 *   npx tsx scripts/research/read-replays/score-set.ts results/replay-<...>.json
 *   npx tsx scripts/research/read-replays/score-set.ts results/replay-before.json results/replay-after.json
 *   npx tsx scripts/research/read-replays/score-set.ts stored --write-baseline   # rewrites results/baseline-stored.*
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compareOutputs, formatScore, scoreOutputs, type ReplayOutput } from './score';
import { loadMornings, RESULTS_DIR, SET_DIR, storedOutputs } from './set';

function load(name: string): { label: string; outputs: ReplayOutput[] } {
  if (name === 'stored') {
    return { label: 'stored: what production published on each recorded morning', outputs: storedOutputs(loadMornings()) };
  }
  const path = [resolve(name), join(SET_DIR, name)].find((p) => existsSync(p));
  if (!path) throw new Error(`No output set at ${name}`);
  const file = JSON.parse(readFileSync(path, 'utf8')) as { meta?: { label?: string; ranAt?: string; models?: Record<string, string> }; outputs: ReplayOutput[] };
  const meta = file.meta;
  const models = meta?.models ? ` (${Object.entries(meta.models).map(([w, m]) => `${w} ${m}`).join(', ')})` : '';
  return { label: `${meta?.label ?? name}, ${meta?.ranAt ?? 'undated'}${models}`, outputs: file.outputs };
}

function main() {
  const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (names.length < 1 || names.length > 2) throw new Error('Name one output set to score, or two to compare (each "stored" or a replay file).');

  if (names.length === 2) {
    const [before, after] = names.map(load);
    console.log(compareOutputs(before.outputs, after.outputs, { before: before.label, after: after.label }));
    return;
  }
  const set = load(names[0]);
  const score = scoreOutputs(set.outputs);
  const text = formatScore(score, `Read checks on the saved mornings. ${set.label}.`);
  console.log(text);

  if (process.argv.includes('--write-baseline')) {
    if (names[0] !== 'stored') throw new Error('--write-baseline writes the stored baseline; a replay file is its own record.');
    writeFileSync(join(RESULTS_DIR, 'baseline-stored.txt'), `${text}\n`);
    const { outputs, ...totals } = score;
    writeFileSync(join(RESULTS_DIR, 'baseline-stored.json'), `${JSON.stringify({ ...totals, outputs }, null, 2)}\n`);
    console.log(`\nWrote ${join(RESULTS_DIR, 'baseline-stored.txt')} and .json`);
  }
}

try {
  main();
} catch (e) {
  console.error(`\n❌ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
