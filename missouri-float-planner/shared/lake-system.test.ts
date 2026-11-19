import assert from 'node:assert/strict';
import test from 'node:test';
import { lakeSystemRowCopy, lakeSystemRowRelation, lakeWeatherIsStale, lakeWindLine } from './lake-system';
import type { LakeSystemRow } from './lake-types';

const NOW = Date.parse('2026-11-19T18:00:00Z');
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

test('a dam row states the observed release and turbine state, and never a schedule', () => {
  const row: LakeSystemRow = { kind: 'dam', stage: 'dam', damId: 'swl-table-rock-dam', name: 'Table Rock Dam', release: { cfs: 7214.4, at: ago(1) }, generating: true };
  const copy = lakeSystemRowCopy(row, NOW);
  assert.deepEqual(copy, { title: 'Table Rock Dam', facts: ['Release 7,214 cfs', 'Generating'], age: '1 hr ago', stale: false });
  assert.doesNotMatch(JSON.stringify(copy), /scheduled|until|start|stop/i, 'a plan needs SWPA\'s caveat beside it; this row has no room for one');
  assert.equal(lakeSystemRowRelation(row), null);
});

test('an unknown turbine state says nothing, and a zero release is a number, not "no release"', () => {
  const copy = lakeSystemRowCopy({ kind: 'dam', stage: 'dam', damId: 'd', name: 'Dam', release: { cfs: 0, at: ago(1) } }, NOW);
  assert.deepEqual(copy?.facts, ['Release 0 cfs']);
  assert.deepEqual(lakeSystemRowCopy({ kind: 'dam', stage: 'dam', damId: 'd', name: 'Dam' }, NOW), { title: 'Dam', facts: [], age: null, stale: false });
});

test('a daily average is labelled and gets the daily freshness limit; a spot reading goes stale at six hours', () => {
  const daily = lakeSystemRowCopy({ kind: 'dam', stage: 'dam', damId: 'nwk-truman-dam', name: 'Harry S. Truman Dam', release: { cfs: 12000, at: ago(30), dailyMean: true } }, NOW);
  assert.deepEqual(daily?.facts, ['Release 12,000 cfs (daily avg)']);
  assert.equal(daily?.stale, false);
  assert.equal(lakeSystemRowCopy({ kind: 'dam', stage: 'dam', damId: 'd', name: 'Dam', release: { cfs: 1, at: ago(40), dailyMean: true } }, NOW)?.stale, true);
  // Truman: one report a day, and nothing says it is an average. It is current at 13 hours and is not called one.
  const report = lakeSystemRowCopy({ kind: 'dam', stage: 'dam', damId: 'nwk-truman-dam', name: 'Harry S. Truman Dam', release: { cfs: 725.84, at: ago(13), daily: true } }, NOW);
  assert.deepEqual(report, { title: 'Harry S. Truman Dam', facts: ['Release 726 cfs (daily report)'], age: '13 hr ago', stale: false });
  assert.equal(lakeSystemRowCopy({ kind: 'inflow', stage: 'coming_in', flow: { cfs: 8200, at: ago(7) } }, NOW)?.stale, true);
  assert.deepEqual(lakeSystemRowCopy({ kind: 'inflow', stage: 'coming_in', flow: { cfs: 8200, at: ago(2) } }, NOW), { title: 'Inflow', facts: ['8,200 cfs into the lake'], age: '2 hr ago', stale: false });
});

test('a river row reads in its own unit, and a river with no reading is still a row', () => {
  assert.deepEqual(
    lakeSystemRowCopy({ kind: 'river', stage: 'coming_in', slug: 'james', state: 'MO', name: 'James River', condition: { code: 'good', label: 'Good' }, reading: { value: 3.416, unit: 'ft', at: ago(0.5) } }, NOW),
    { title: 'James River', facts: ['Good', '3.42 ft'], age: '30 min ago', stale: false },
  );
  assert.deepEqual(lakeSystemRowCopy({ kind: 'river', stage: 'below', slug: 'taneycomo', state: 'MO', name: 'Lake Taneycomo', reading: { value: 7200, unit: 'cfs' } }, NOW)?.facts, ['7,200 cfs']);
  assert.deepEqual(lakeSystemRowCopy({ kind: 'river', stage: 'coming_in', slug: 'kings-river', state: 'AR', name: 'Kings River' }, NOW), { title: 'Kings River', facts: [], age: null, stale: false });
});

test('a downstream dam is titled by its lake and leads with that lake\'s level; an upstream dam names its river', () => {
  const below: LakeSystemRow = { kind: 'dam', stage: 'below', damId: 'ameren-bagnell-dam', name: 'Bagnell Dam', lakeName: 'Lake of the Ozarks', pool: { valueFt: 658.917, at: ago(3) } };
  assert.deepEqual(lakeSystemRowCopy(below, NOW), { title: 'Lake of the Ozarks', facts: ['Level 658.92 ft'], age: '3 hr ago', stale: false });
  assert.equal(lakeSystemRowRelation(below), 'Held by Bagnell Dam');
  const above: LakeSystemRow = { kind: 'dam', stage: 'coming_in', damId: 'swl-beaver-dam', name: 'Beaver Dam', via: 'White River', release: { cfs: 3900, at: ago(1) } };
  assert.equal(lakeSystemRowCopy(above, NOW)?.title, 'Beaver Dam');
  assert.equal(lakeSystemRowRelation(above), 'Releases down the White River');
});

test('a row kind this build does not know yields nothing instead of throwing', () => {
  assert.equal(lakeSystemRowCopy({ kind: 'canal' } as unknown as LakeSystemRow, NOW), null);
});

test('the wind line is a measurement: speed, origin, and a gust only when it exceeds the wind', () => {
  assert.equal(lakeWindLine({ windMph: 12, windFrom: 'SW', windGustMph: 22 }), '12 mph from the SW, gusts 22');
  assert.equal(lakeWindLine({ windMph: 12, windFrom: 'SW' }), '12 mph from the SW');
  assert.equal(lakeWindLine({ windMph: 12, windFrom: 'SW', windGustMph: 12 }), '12 mph from the SW');
  assert.equal(lakeWindLine({ windMph: 0, windFrom: 'N' }), 'Calm');
  for (const line of [lakeWindLine({ windMph: 3, windFrom: 'N' }), lakeWindLine({ windMph: 35, windFrom: 'N', windGustMph: 50 })]) {
    assert.doesNotMatch(line, /safe|good|rough|dangerous|light|strong/i, 'no verdict: Eddy does not know the boat');
  }
});

test('weather past two hours is outdated; weather with no stamp makes no claim either way', () => {
  assert.equal(lakeWeatherIsStale({ observedAt: ago(1) }, NOW), false);
  assert.equal(lakeWeatherIsStale({ observedAt: ago(2.5) }, NOW), true);
  assert.equal(lakeWeatherIsStale({ observedAt: 'not a date' }, NOW), true);
  assert.equal(lakeWeatherIsStale({}, NOW), false);
});
