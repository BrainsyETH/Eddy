import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ladderChanges, ladderRefusal, LADDER_COLUMNS, type Ladder } from './ladder-guard';

// What production held for the North Fork at Tecumseh on 2026-11-19, as the
// database returns it, and what the dossier would have written over it.
const stored: Ladder = {
  threshold_unit: 'cfs', level_too_low: '200.00', level_low: '475.00', level_optimal_min: '628.00',
  level_optimal_max: '1000.00', level_high: '1000.00', level_dangerous: '2200.00',
};
const dossier: Ladder = {
  threshold_unit: 'cfs', level_too_low: 200, level_low: null, level_optimal_min: 282,
  level_optimal_max: 811, level_high: 1000, level_dangerous: 8440,
};

test('a re-ingest that would change a live ladder is named level by level', () => {
  assert.deepEqual(ladderChanges(stored, dossier), [
    'level_low 475 → (none)',
    'level_optimal_min 628 → 282',
    'level_optimal_max 1000 → 811',
    'level_dangerous 2200 → 8440',
  ]);
  // Before the dossier carried the owner's floor, it would have removed that too.
  assert.ok(ladderChanges(stored, { ...dossier, level_too_low: null }).includes('level_too_low 200 → (none)'));
  // A change of rating unit is a change of ladder even when the numbers match.
  assert.deepEqual(ladderChanges(stored, { ...stored, threshold_unit: 'ft' }), ['threshold_unit cfs → ft']);
});

test('a dossier that agrees with what is stored changes nothing, however the numbers are typed', () => {
  const same: Ladder = { threshold_unit: 'cfs', level_too_low: 200, level_low: 475, level_optimal_min: 628, level_optimal_max: 1000, level_high: 1000, level_dangerous: 2200 };
  assert.deepEqual(ladderChanges(stored, same), []);
  assert.deepEqual(ladderChanges({ ...stored, level_low: null }, { ...same, level_low: null }), []);
});

test('a gauge with no levels yet may be given its first ladder', () => {
  const none = Object.fromEntries(LADDER_COLUMNS.map((column) => [column, null])) as Ladder;
  assert.deepEqual(ladderChanges(none, dossier), []);
  assert.deepEqual(ladderChanges(null, dossier), []);
  assert.deepEqual(ladderChanges(undefined, dossier), []);
});

test('the refusal names the river, each gauge and what to do instead', () => {
  const message = ladderRefusal('north-fork-white', new Map([['07057500', ladderChanges(stored, dossier)]]));
  assert.match(message, /^north-fork-white is active, and this dossier would change its float levels:\n {2}07057500: level_low 475 → \(none\); /);
  assert.match(message, /reviewed migration, not a re-ingest/);
  assert.match(message, /Nothing was written\.$/);
});

test('the ingest checks an active river before its first write', () => {
  const source = readFileSync(join(__dirname, 'ingest-dossier.ts'), 'utf8');
  const guard = source.indexOf('ladderChanges(');
  assert.ok(guard > 0, 'ingest-dossier.ts does not call the ladder guard');
  assert.match(source, /if \(river\.active\) \{[\s\S]*?ladderChanges\(/);
  // Before the first write to any table.
  for (const write of ["from('rivers').update(", "from('gauge_stations').insert(", "from('river_gauges').update(", "from('river_gauges').insert("]) {
    const at = source.indexOf(write);
    assert.ok(at > guard, `${write} comes before the ladder guard`);
  }
});

test("the North Fork's dossier carries the owner's floor and records that it disagrees with production", () => {
  const dossierFile = JSON.parse(readFileSync(join(__dirname, 'dossiers', 'north-fork-white.json'), 'utf8'));
  const thresholds = dossierFile.sections[0].thresholds as Array<{ level: string; value: number; unit: string; source: string }>;
  const floor = thresholds.find((t) => t.level === 'too_low');
  assert.ok(floor, 'no too_low anchor');
  assert.equal(floor.value, 200);
  assert.equal(floor.unit, 'cfs');
  assert.match(floor.source, /OWNER-APPROVED 2026-11-19/);
  assert.doesNotMatch(JSON.stringify(dossierFile.sections[0].characteristics), /285/);
  assert.ok((dossierFile.research.openQuestions as string[]).some((q) => /^LADDER DISAGREES WITH PRODUCTION/.test(q)));
});
