import assert from 'node:assert/strict';
import test from 'node:test';
import { claimScheduledDestinations } from './stale-scheduled';

type Row = { id: string; platform: 'instagram' | 'facebook'; status: string; auto_publish: boolean };

// A fake social_posts table whose delete applies the same filters as the real
// query. `onRead` / `onDelete` run just before the cron's read and delete,
// which is where an admin retry's compare-and-swap can land.
function table(rows: Row[], hooks: { onRead?: () => void; onDelete?: () => void } = {}) {
  const now = new Date().toISOString();
  const full = rows.map(row => ({ ...row, created_at: now, image_url: null }));
  const adminRetry = (id: string) => { full.find(row => row.id === id && row.status === 'failed')!.status = 'publishing'; };
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ gte: async () => { hooks.onRead?.(); return { data: full.map(row => ({ ...row })), error: null }; } }) }),
      delete: () => ({
        in: (_: string, ids: string[]) => ({
          in: (__: string, statuses: string[]) => ({
            eq: (___: string, auto: boolean) => ({
              select: async () => {
                hooks.onDelete?.();
                hooks.onDelete = undefined;
                const gone = full.filter(row => ids.includes(row.id) && statuses.includes(row.status) && row.auto_publish === auto);
                for (const row of gone) full.splice(full.indexOf(row), 1);
                return { data: gone.map(({ id }) => ({ id })), error: null };
              },
            }),
          }),
        }),
      }),
    }),
  };
  return { db, full, adminRetry };
}

const bothFailed: Row[] = [
  { id: 'ig-failed', platform: 'instagram', status: 'failed', auto_publish: true },
  { id: 'fb-failed', platform: 'facebook', status: 'failed', auto_publish: true },
];
const destinations = [{ platform: 'instagram' as const }, { platform: 'facebook' as const }];
const claim = (db: unknown) => claimScheduledDestinations(db, 'weekly_forecast', 'America/Chicago', destinations);

test('an admin retry that lands before the read keeps that platform; the cron sends no second post there', async () => {
  // Review case 1: the scheduler chose to replace a failed Instagram post,
  // then the admin pressed Retry before cleanup read the rows.
  const t = table(bothFailed, { onRead: () => t.adminRetry('ig-failed') });
  const { ready, taken } = await claim(t.db);
  assert.deepEqual(ready.map(p => p.platform), ['facebook']);
  assert.deepEqual(taken.map(x => x.post.platform), ['instagram']);
  assert.deepEqual(t.full.map(row => [row.id, row.status]), [['ig-failed', 'publishing']], 'only Facebook\'s failed row is replaced');
});

test('an admin retry that lands between the read and the delete keeps that platform; the others still post', async () => {
  // Review case 2: retrying Instagram must not cost Facebook its post.
  const t = table(bothFailed, { onDelete: () => t.adminRetry('ig-failed') });
  const { ready, taken } = await claim(t.db);
  assert.deepEqual(ready.map(p => p.platform), ['facebook']);
  assert.deepEqual(taken.map(x => [x.post.platform, x.reason]), [['instagram', 'an earlier attempt is being retried']]);
  assert.deepEqual(t.full.map(row => [row.id, row.status]), [['ig-failed', 'publishing']]);
});

test('with no competing retry, failed and stuck rows are replaced on every platform', async () => {
  const t = table([
    { id: 'ig-stuck', platform: 'instagram', status: 'pending', auto_publish: true },
    { id: 'fb-failed', platform: 'facebook', status: 'failed', auto_publish: true },
  ]);
  const { ready, taken } = await claim(t.db);
  assert.deepEqual(ready.map(p => p.platform), ['instagram', 'facebook']);
  assert.deepEqual(taken, []);
  assert.deepEqual(t.full, []);
  assert.deepEqual((await claim(table([]).db)).ready.map(p => p.platform), ['instagram', 'facebook']);
});

test('a platform already delivering or delivered is left alone; a failed manual draft does not hold its slot', async () => {
  const t = table([
    { id: 'ig-live', platform: 'instagram', status: 'published', auto_publish: true },
    { id: 'fb-draft', platform: 'facebook', status: 'failed', auto_publish: false },
  ]);
  const { ready, taken } = await claim(t.db);
  assert.deepEqual(ready.map(p => p.platform), ['facebook']);
  assert.deepEqual(taken.map(x => x.post.platform), ['instagram']);
  assert.deepEqual(t.full.map(row => row.id), ['ig-live', 'fb-draft'], 'manual drafts stay in History');
});
