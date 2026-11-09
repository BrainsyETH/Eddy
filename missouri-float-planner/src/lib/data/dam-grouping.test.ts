import assert from 'node:assert/strict';
import test from 'node:test';
import { groupDamsForIndex, isNavigationDam } from './dam-grouping';
import type { DamSnapshot } from '@shared/dam-types';

// The bug this file exists for: /dams used to filter exactly two states into
// two hardcoded sections, so the eight Oklahoma and Texas dams added with the
// SWPA expansion rendered in neither — reachable at /dams/[damId] and returned
// by /api/dams, but absent from the index that links to them.

function dam(id: string, state: string, name = id): DamSnapshot {
  return {
    id,
    name,
    lakeName: null,
    state,
    lat: 0,
    lon: 0,
    hasTurbines: true,
    metrics: {},
    generating: null,
    schedule: [],
    sources: [],
  } as DamSnapshot;
}

test('every dam lands in exactly one group', () => {
  const dams = [
    dam('swl-table-rock-dam', 'MO'),
    dam('swl-bull-shoals-dam', 'AR'),
    dam('swt-tenkiller-dam', 'OK'),
    dam('swt-denison-dam', 'TX'),
    dam('swl-dardanelle-dam', 'AR'),
  ];
  const groups = groupDamsForIndex(dams);
  const placed = groups.flatMap((g) => g.dams.map((d) => d.id));
  assert.equal(placed.length, dams.length, 'no dam may be dropped');
  assert.equal(new Set(placed).size, dams.length, 'no dam may appear twice');
});

test('Missouri and Arkansas lead, then states alphabetically', () => {
  // Home states first because that is where every river Eddy carries is, so
  // those are the dams with a float below them.
  const groups = groupDamsForIndex([
    dam('swt-denison-dam', 'TX'),
    dam('swt-tenkiller-dam', 'OK'),
    dam('swl-bull-shoals-dam', 'AR'),
    dam('swl-table-rock-dam', 'MO'),
  ]);
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Missouri', 'Arkansas', 'Oklahoma', 'Texas']
  );
});

test('navigation locks and dams are grouped last, together', () => {
  // Arkansas River barge pools. Real generation schedules, but nobody floats
  // below one, and interleaving them pushes Beaver and Bull Shoals below the fold.
  const groups = groupDamsForIndex([
    dam('swl-ozark-dam', 'AR'),
    dam('swl-dardanelle-dam', 'AR'),
    dam('swt-robert-s-kerr-dam', 'OK'),
    dam('swt-webbers-falls-dam', 'OK'),
    dam('swl-bull-shoals-dam', 'AR'),
  ]);
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Arkansas', 'Arkansas River locks & dams']
  );
  assert.deepEqual(groups[0].dams.map((d) => d.id), ['swl-bull-shoals-dam']);
  assert.equal(groups[1].dams.length, 4);
});

test('navigation dams are identified by id, not by their name', () => {
  // "Lock & Dam" in a title is a naming convention; a convention is not a fact
  // to branch on. A reservoir that happened to be named that way must not move.
  assert.equal(isNavigationDam('swl-dardanelle-dam'), true);
  assert.equal(isNavigationDam('swl-table-rock-dam'), false);
  const groups = groupDamsForIndex([dam('swl-table-rock-dam', 'MO', 'Table Rock Lock & Dam')]);
  assert.deepEqual(groups.map((g) => g.label), ['Missouri']);
});

test('an empty state produces no heading', () => {
  // A source outage that drops every dam in a state should remove its heading,
  // not leave an empty one behind.
  assert.deepEqual(groupDamsForIndex([]), []);
  const groups = groupDamsForIndex([dam('swt-tenkiller-dam', 'OK')]);
  assert.deepEqual(groups.map((g) => g.label), ['Oklahoma']);
});


test('directory preserves the registry and distinguishes readings from unavailable information', async () => {
  const { buildDamDirectoryGroups } = await import('./dam-directory');
  const { buildSnapshot } = await import('./dams');
  const { USACE_DAMS } = await import('@/lib/flow-providers/usace-registry');
  const now = Date.parse('2026-11-09T16:00:00Z');
  const measured = {
    value: 780.25,
    unit: 'ft',
    at: new Date(now - 30 * 60_000).toISOString(),
    staleness: 'fresh' as const,
  };
  const tableRock = buildSnapshot(USACE_DAMS['swl-table-rock-dam'], {
    poolElevation: measured,
    release: { ...measured, value: 3_200, unit: 'cfs' },
    generationFlow: { ...measured, value: 6_400, unit: 'cfs' },
  }, []);
  const clearwater = buildSnapshot(USACE_DAMS['swl-clearwater-dam'], {}, []);
  const groups = buildDamDirectoryGroups([tableRock, clearwater], now);
  const all = groups.flatMap(group => group.dams);
  assert.equal(all.length, 2);
  const rock = all.find(d => d.id === 'swl-table-rock-dam');
  const gate = all.find(d => d.id === 'swl-clearwater-dam');
  assert.equal(rock?.lakeLevel?.value, 780.25);
  assert.equal(rock?.release?.value, 3_200);
  assert.equal(rock?.generation?.kind, 'generating');
  assert.equal(rock?.hasHourlySchedule, true);
  assert.equal(gate?.lakeLevel, null, 'a missing reading never becomes zero');
  assert.equal(gate?.generation, null, 'a gate-operated dam does not become idle');
  assert.equal(gate?.hasHourlySchedule, false);
});

test('directory includes every catalogued dam even when snapshots are missing', async () => {
  const { conditionsDamCatalogue } = await import('@/lib/conditions/dam-catalogue');
  const { buildDamDirectoryGroups } = await import('./dam-directory');
  const { USACE_DAMS } = await import('@/lib/flow-providers/usace-registry');
  const { dams } = conditionsDamCatalogue([]);
  const directory = buildDamDirectoryGroups(dams, Date.parse('2026-11-09T16:00:00Z'));
  const all = directory.flatMap(group => group.dams);
  assert.equal(all.length, Object.keys(USACE_DAMS).length);
  assert.equal(new Set(all.map(dam => dam.id)).size, all.length);
  assert.ok(all.every(dam => dam.lakeLevel === null && dam.release === null));
});
