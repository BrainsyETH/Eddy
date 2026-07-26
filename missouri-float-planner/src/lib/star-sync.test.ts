import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeStars,
  migrateLegacyStars,
  toggleLocal,
  visibleStars,
  type LocalStar,
  type ServerStar,
} from '../../../packages/eddy-sync/index';

const EARLY = '2026-07-20T10:00:00.000Z';
const LATE = '2026-07-25T10:00:00.000Z';

const local = (
  riverId: string,
  starred: boolean,
  updatedAt: string,
  name = riverId,
): LocalStar => ({ riverId, name, slug: riverId, updatedAt, starred });

const server = (riverId: string, starredAt: string, riverName = riverId): ServerStar => ({
  riverId,
  riverName,
  riverSlug: riverId,
  starredAt,
});

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
  const kept = plan.merged.find((e) => e.riverId === 'current');
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
  const visible = visibleStars(plan.merged).map((e) => e.riverId).sort();
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
  const first = toggleLocal([], { riverId: 'current', name: 'Current', slug: 'current' }, EARLY);
  assert.equal(first[0].starred, true);

  const second = toggleLocal(first, { riverId: 'current', name: 'Current', slug: 'current' }, LATE);
  assert.equal(second.length, 1, 'the entry must remain, carrying starred: false');
  assert.equal(second[0].starred, false);
  assert.equal(second[0].updatedAt, LATE);
});

test('toggling never duplicates a river', () => {
  let list: LocalStar[] = [];
  const river = { riverId: 'current', name: 'Current', slug: 'current' };
  for (let i = 0; i < 5; i++) list = toggleLocal(list, river, EARLY);
  assert.equal(list.length, 1);
  assert.equal(list[0].starred, true, 'five toggles from empty should end starred');
});

// ── migration off the pre-sync format ────────────────────────────

test('v1 entries are all treated as starred', () => {
  // v1 had no `starred` field: it represented an unstar by removing the entry,
  // so everything present was starred by definition.
  const migrated = migrateLegacyStars([
    { riverId: 'current', name: 'Current River', slug: 'current', starredAt: EARLY },
  ]);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].starred, true);
  assert.equal(migrated[0].updatedAt, EARLY, 'starredAt should carry over as updatedAt');
});

test('a corrupt store migrates to empty instead of throwing', () => {
  assert.deepEqual(migrateLegacyStars(null), []);
  assert.deepEqual(migrateLegacyStars('nonsense'), []);
  assert.deepEqual(migrateLegacyStars([null, 42, { noId: true }]), []);
});

test('already-migrated entries survive a second migration unchanged', () => {
  const already = [local('current', false, LATE)];
  const migrated = migrateLegacyStars(already);
  assert.equal(migrated[0].starred, false, 'a tombstone must not be flipped back to starred');
  assert.equal(migrated[0].updatedAt, LATE);
});
