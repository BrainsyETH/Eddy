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


test('directory keeps readings and all 24 scheduled hours for its visible charts', async () => {
  const { buildDamDirectoryGroups } = await import('./dam-directory');
  const { buildSnapshot } = await import('./dams');
  const { USACE_DAMS } = await import('@/lib/flow-providers/usace-registry');
  const observedAt = '2026-11-09T15:30:00Z';
  const reading = { value: 780.25, unit: 'ft', at: observedAt, staleness: 'fresh' as const };
  const day = {
    scheduleDate: '2026-11-09',
    retrievedAt: observedAt,
    hours: Array.from({ length: 24 }, (_, i) => ({
      hourEnding: i + 1, megawatts: i >= 8 && i < 18 ? 130 : 0, cfs: null, isRamp: false,
    })),
    idle: [{ from: 1, to: 8 }, { from: 19, to: 24 }],
  };
  const bullShoals = buildSnapshot(USACE_DAMS['swl-bull-shoals-dam'], {
    poolElevation: reading,
    release: { ...reading, value: 3_200, unit: 'cfs' },
    tailwaterTempF: { ...reading, value: 56, unit: 'F' },
  }, [day]);

  const directory = buildDamDirectoryGroups([bullShoals]);
  const result = directory.flatMap(group => group.dams);
  assert.equal(result.length, 1);
  assert.equal(result[0].metrics.poolElevation?.value, 780.25);
  assert.equal(result[0].metrics.release?.value, 3_200);
  assert.equal(result[0].metrics.tailwaterTempF?.value, 56);
  assert.equal(result[0].schedule[0].hours.length, 24, 'index renders a complete day, not a summary string');
  assert.deepEqual(result[0].schedule, bullShoals.schedule, 'future posted days and provenance survive for next-change copy');
  assert.equal(result[0].pattern, undefined, 'detail-only history does not bloat the directory');
  assert.equal(result[0].generationForecast, undefined, 'detail-only forecasts remain on the dam page');
});

test('directory retains all catalogued dams without inventing measurements', async () => {
  const { conditionsDamCatalogue } = await import('@/lib/conditions/dam-catalogue');
  const { buildDamDirectoryGroups } = await import('./dam-directory');
  const { USACE_DAMS } = await import('@/lib/flow-providers/usace-registry');
  const { dams } = conditionsDamCatalogue([]);
  const groups = buildDamDirectoryGroups(dams);
  const all = groups.flatMap(group => group.dams);
  assert.equal(all.length, Object.keys(USACE_DAMS).length);
  assert.equal(new Set(all.map(dam => dam.id)).size, all.length);
  assert.ok(all.every(dam => !dam.metrics.poolElevation && !dam.metrics.release));
  assert.ok(all.every(dam => dam.schedule.length === 0));
});

test('dam directory uses the existing interactive schedule component, not text-only summaries', async () => {
  const { readFileSync } = await import('node:fs');
  const directory = readFileSync('src/components/dam/DamDirectory.tsx', 'utf8');
  const card = readFileSync('src/components/dam/DamListCard.tsx', 'utf8');
  const schedule = readFileSync('src/components/dam/GenerationSchedule.tsx', 'utf8');
  assert.match(directory, /<DamListCard\b/, 'listings must render their full card');
  assert.match(card, /<GenerationSchedule\b/, 'cards must keep the interactive timeline');
  assert.match(schedule, /<DamTimeline\b/, 'the chart must render 24 hourly bars');
});
