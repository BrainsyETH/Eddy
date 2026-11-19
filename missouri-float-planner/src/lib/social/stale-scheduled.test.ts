import assert from 'node:assert/strict';
import test from 'node:test';
import { clearStaleScheduled } from './stale-scheduled';

// A fake social_posts table whose delete applies the same filters as the real
// query, so a row whose status changes between the read and the delete survives.
function table(rows: { id: string; status: string; auto_publish: boolean }[], beforeDelete?: () => void) {
  const now = new Date().toISOString();
  const full = rows.map(row => ({ ...row, created_at: now, image_url: null, format: 'weekly_forecast' }));
  return {
    rows: full,
    from: () => ({
      select: () => ({ eq: () => ({ gte: async () => ({ data: full.map(row => ({ ...row })), error: null }) }) }),
      delete: () => ({
        in: (_: string, ids: string[]) => ({
          in: (__: string, statuses: string[]) => ({
            eq: (___: string, auto: boolean) => ({
              select: async () => {
                beforeDelete?.();
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
}

test('an earlier attempt claimed by an admin retry survives cleanup, and the cron skips its new attempt', async () => {
  const db = table([
    { id: 'failed-a', status: 'failed', auto_publish: true },
    { id: 'failed-b', status: 'failed', auto_publish: true },
    { id: 'draft', status: 'failed', auto_publish: false },
  ], () => {
    // The admin retry's compare-and-swap lands between the read and the delete.
    db.rows.find(row => row.id === 'failed-b')!.status = 'publishing';
  });
  const result = await clearStaleScheduled(db, 'weekly_forecast', 'America/Chicago');
  assert.deepEqual(result, { cleared: 1, claimed: true });
  assert.deepEqual(db.rows.map(row => [row.id, row.status]), [['failed-b', 'publishing'], ['draft', 'failed']]);
});

test('with no competing retry every stale scheduled row is cleared and the new attempt goes ahead', async () => {
  const db = table([
    { id: 'failed', status: 'failed', auto_publish: true },
    { id: 'stuck', status: 'pending', auto_publish: true },
    { id: 'live', status: 'published', auto_publish: true },
  ]);
  assert.deepEqual(await clearStaleScheduled(db, 'weekly_forecast', 'America/Chicago'), { cleared: 2, claimed: false });
  assert.deepEqual(db.rows.map(row => row.id), ['live']);
  assert.deepEqual(await clearStaleScheduled(table([]), 'weekly_forecast', 'America/Chicago'), { cleared: 0, claimed: false });
});
