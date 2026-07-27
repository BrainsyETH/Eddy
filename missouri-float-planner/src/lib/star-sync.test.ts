import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeStars as mergeStarsRaw,
  migrateStars,
  toggleLocal,
  visibleStars,
  type LocalStar,
  type ServerStar,
  type StarKind,
} from '../../../packages/eddy-sync/index';

/** Rivers by default, so every pre-gauge case below reads exactly as it did. */
const mergeStars = (l: LocalStar[], s: ServerStar[], kind: StarKind = 'river') =>
  mergeStarsRaw(l, s, kind);

const EARLY = '2026-07-20T10:00:00.000Z';
const LATE = '2026-07-25T10:00:00.000Z';

const local = (
  entityId: string,
  starred: boolean,
  updatedAt: string,
  name = entityId,
  kind: StarKind = 'river',
): LocalStar => ({ kind, entityId, name, slug: entityId, updatedAt, starred });

const server = (
  entityId: string,
  starredAt: string,
  name = entityId,
  kind: StarKind = 'river',
): ServerStar => ({ kind, entityId, name, slug: entityId, starredAt });

// ── the case a naive union gets wrong ────────────────────────────

test('an unstar is not resurrected by the server copy', () => {
  // This is the whole reason tombstones exist. Union semantics would put the
  // river straight back and the user would see the app ignore their tap.
  const plan = mergeStars([local('current', false, LATE)], [server('current', EARLY)]);

  assert.deepEqual(plan.toUnstar, ['current']);
  assert.deepEqual(plan.toStar, []);
  assert.equal(visibleStars(plan.merged).length, 0);
});

test('the tombstone survives the merge until the DELETE lands', () => {
  // Pruning it here would let the very next sync pull the star back, because
  // the server row is still there until our DELETE is accepted.
  const plan = mergeStars([local('current', false, LATE)], [server('current', EARLY)]);
  const kept = plan.merged.find((e) => e.entityId === 'current');
  assert.ok(kept, 'tombstone was dropped while the server row still exists');
  assert.equal(kept.starred, false);
});

test('a newer star on another device beats an older local unstar', () => {
  // Last-write-wins has to cut both ways, or a stale tombstone would silently
  // veto every other device forever.
  const plan = mergeStars([local('current', false, EARLY)], [server('current', LATE)]);
  assert.deepEqual(plan.toUnstar, []);
  assert.equal(visibleStars(plan.merged).length, 1);
});

// ── ordinary sync ────────────────────────────────────────────────

test('a star made offline is pushed', () => {
  const plan = mergeStars([local('eleven-point', true, LATE)], []);
  assert.deepEqual(plan.toStar, ['eleven-point']);
  assert.equal(visibleStars(plan.merged).length, 1);
});

test('a star from another device is adopted without being pushed back', () => {
  const plan = mergeStars([], [server('jacks-fork', EARLY)]);
  assert.deepEqual(plan.toStar, []);
  assert.deepEqual(plan.toUnstar, []);
  assert.equal(visibleStars(plan.merged).length, 1);
});

test('agreement produces no work at all', () => {
  const plan = mergeStars([local('current', true, EARLY)], [server('current', EARLY)]);
  assert.deepEqual(plan.toStar, []);
  assert.deepEqual(plan.toUnstar, []);
  assert.equal(plan.merged.length, 1);
});

test('a redundant tombstone is pruned so they cannot accumulate', () => {
  // Both sides already agree the river is not starred, so there is nothing left
  // for the tombstone to win against.
  const plan = mergeStars([local('big-river', false, LATE)], []);
  assert.equal(plan.merged.length, 0);
  assert.deepEqual(plan.toStar, []);
  assert.deepEqual(plan.toUnstar, []);
});

test('server names are canonical', () => {
  // A river renamed on the web should not keep a stale label on the device.
  const plan = mergeStars(
    [local('current', true, EARLY, 'Old Name')],
    [server('current', EARLY, 'Current River')],
  );
  assert.equal(plan.merged[0].name, 'Current River');
});

test('a mixed set resolves each river independently', () => {
  const plan = mergeStars(
    [
      local('a', true, LATE), // local only  → push
      local('b', false, LATE), // unstarred after server → delete
      local('c', false, EARLY), // stale tombstone → server wins
    ],
    [server('b', EARLY), server('c', LATE), server('d', EARLY)],
  );

  assert.deepEqual(plan.toStar, ['a']);
  assert.deepEqual(plan.toUnstar, ['b']);
  const visible = visibleStars(plan.merged).map((e) => e.entityId).sort();
  assert.deepEqual(visible, ['a', 'c', 'd']);
});

// ── robustness ───────────────────────────────────────────────────

test('a missing or malformed timestamp loses rather than throwing', () => {
  // Date.parse('') is NaN; comparing NaN would make every branch false and
  // quietly pick the wrong winner.
  const plan = mergeStars([local('current', false, 'not-a-date')], [server('current', EARLY)]);
  assert.deepEqual(plan.toUnstar, [], 'an unparseable local time must not win');
  assert.equal(visibleStars(plan.merged).length, 1);
});

test('junk entries in the local store are ignored', () => {
  const dirty = [null, { name: 'no id' }, local('current', true, EARLY)] as unknown as LocalStar[];
  const plan = mergeStars(dirty, []);
  assert.deepEqual(plan.toStar, ['current']);
});

// ── toggling ─────────────────────────────────────────────────────

test('toggling writes a tombstone rather than deleting the entry', () => {
  const first = toggleLocal([], { entityId: 'current', name: 'Current', slug: 'current' }, EARLY);
  assert.equal(first[0].starred, true);

  const second = toggleLocal(first, { entityId: 'current', name: 'Current', slug: 'current' }, LATE);
  assert.equal(second.length, 1, 'the entry must remain, carrying starred: false');
  assert.equal(second[0].starred, false);
  assert.equal(second[0].updatedAt, LATE);
});

test('toggling never duplicates a river', () => {
  let list: LocalStar[] = [];
  const river = { entityId: 'current', name: 'Current', slug: 'current' };
  for (let i = 0; i < 5; i++) list = toggleLocal(list, river, EARLY);
  assert.equal(list.length, 1);
  assert.equal(list[0].starred, true, 'five toggles from empty should end starred');
});

// ── migration off the pre-sync format ────────────────────────────

test('v1 entries are all treated as starred', () => {
  // v1 had no `starred` field: it represented an unstar by removing the entry,
  // so everything present was starred by definition.
  const migrated = migrateStars([
    { entityId: 'current', name: 'Current River', slug: 'current', starredAt: EARLY },
  ]);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].starred, true);
  assert.equal(migrated[0].updatedAt, EARLY, 'starredAt should carry over as updatedAt');
});

test('a corrupt store migrates to empty instead of throwing', () => {
  assert.deepEqual(migrateStars(null), []);
  assert.deepEqual(migrateStars('nonsense'), []);
  assert.deepEqual(migrateStars([null, 42, { noId: true }]), []);
});

test('already-migrated entries survive a second migration unchanged', () => {
  const already = [local('current', false, LATE)];
  const migrated = migrateStars(already);
  assert.equal(migrated[0].starred, false, 'a tombstone must not be flipped back to starred');
  assert.equal(migrated[0].updatedAt, LATE);
});

// ── two kinds, one store ─────────────────────────────────────────

test('a rivers-only sync leaves gauge stars and tombstones completely alone', () => {
  // THE failure this parameter exists to prevent. Both kinds share one local
  // array but sync through separate endpoints, so a merge that ignored `kind`
  // would push the gauge id to /api/me/starred-rivers and prune the gauge
  // tombstone as redundant — the rivers server has no row for either, so both
  // look like "the server agrees this is not starred". Silent, and total.
  const localStars: LocalStar[] = [
    local('river-a', true, EARLY),
    local('gauge-a', true, EARLY, 'gauge-a', 'gauge'),
    local('gauge-b', false, LATE, 'gauge-b', 'gauge'),
  ];

  const plan = mergeStars(localStars, [server('river-a', EARLY)], 'river');

  assert.deepEqual(plan.toStar, [], 'a gauge must never be pushed to the rivers endpoint');
  assert.deepEqual(plan.toUnstar, []);
  // Both gauge entries survive, tombstone included.
  const gauges = plan.merged.filter((e) => e.kind === 'gauge');
  assert.equal(gauges.length, 2, 'both gauge entries carried through untouched');
  assert.equal(gauges.find((e) => e.entityId === 'gauge-b')?.starred, false, 'tombstone kept');
});

test('a gauge unstarred here is not resurrected by the gauge server copy', () => {
  // The tombstone rule, restated for gauges — so a future refactor that
  // special-cases rivers fails here rather than in someone's Favorites list.
  const plan = mergeStars(
    [local('gauge-a', false, LATE, 'gauge-a', 'gauge')],
    [server('gauge-a', EARLY, 'gauge-a', 'gauge')],
    'gauge',
  );

  assert.deepEqual(plan.toUnstar, ['gauge-a']);
  assert.equal(plan.merged.find((e) => e.entityId === 'gauge-a')?.starred, false);
});

test('a river and a gauge sharing an id are distinct stars', () => {
  // Exactly what the composite key buys. Ids are uuids from different tables
  // and could collide; keying on the id alone would let one overwrite the other.
  const same = 'shared-uuid';
  const localStars: LocalStar[] = [
    local(same, true, EARLY),
    local(same, true, EARLY, same, 'gauge'),
  ];

  const plan = mergeStars(localStars, [server(same, EARLY)], 'river');

  assert.equal(plan.merged.filter((e) => e.entityId === same).length, 2);
  assert.deepEqual(plan.toStar, [], 'the river is on the server; only it was considered');
  assert.equal(plan.merged.find((e) => e.kind === 'gauge')?.starred, true);
});

test('chaining the two merges settles both kinds', () => {
  // How the hook actually calls it: rivers first, then gauges against the
  // result. Neither pass may undo the other's work.
  const localStars: LocalStar[] = [
    local('river-a', true, LATE),
    local('gauge-a', true, LATE, 'gauge-a', 'gauge'),
  ];

  const riverPlan = mergeStars(localStars, [], 'river');
  assert.deepEqual(riverPlan.toStar, ['river-a']);

  const gaugePlan = mergeStars(riverPlan.merged, [], 'gauge');
  assert.deepEqual(gaugePlan.toStar, ['gauge-a']);
  assert.equal(gaugePlan.merged.length, 2, 'the river star survived the gauge pass');
});

test('visibleStars orders both kinds on one clock', () => {
  const ordered = visibleStars([
    local('river-a', true, EARLY),
    local('gauge-a', true, LATE, 'gauge-a', 'gauge'),
  ]);
  assert.deepEqual(ordered.map((e) => e.entityId), ['gauge-a', 'river-a']);
});

// ── the v2 → v3 migration ────────────────────────────────────────

test('a stored v2 payload becomes river-kind entries', () => {
  // v2 keyed on riverId and had no `kind`. Everything in it predates gauges.
  const migrated = migrateStars([
    { riverId: 'current', name: 'Current River', slug: 'current', updatedAt: EARLY, starred: true },
  ]);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].kind, 'river');
  assert.equal(migrated[0].entityId, 'current');
});

test('a v2 TOMBSTONE survives the migration', () => {
  // The one that matters. A v2 tombstone exists precisely because the server
  // row still exists, so dropping it on upgrade lets the next sync pull the
  // star straight back — the exact bug tombstones were introduced to stop.
  const migrated = migrateStars([
    { riverId: 'current', name: 'Current', slug: 'current', updatedAt: LATE, starred: false },
  ]);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].starred, false, 'the tombstone must not be dropped');
  assert.equal(migrated[0].kind, 'river');
});

test('a v3 payload round-trips, gauges included', () => {
  const migrated = migrateStars([
    { kind: 'gauge', entityId: 'g1', name: 'Kelly Crossing', slug: 'crooked-creek', updatedAt: EARLY, starred: true, usgsSiteId: '07055607' },
  ]);
  assert.equal(migrated[0].kind, 'gauge');
  assert.equal(migrated[0].usgsSiteId, '07055607');
});

test('an entry with an unrecognised kind is treated as a river, not dropped', () => {
  // Same posture as everything else here: losing a star is bad, and a store
  // that refuses to parse is worse. Anything that is not 'gauge' is a river,
  // which is what every payload before v3 contained.
  const migrated = migrateStars([
    { entityId: 'x', kind: 'planet', name: 'x', slug: 'x', updatedAt: EARLY, starred: true },
  ]);
  assert.equal(migrated[0].kind, 'river');
});
