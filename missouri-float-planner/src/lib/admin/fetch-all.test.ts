import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages } from './fetch-all';

const source = (count: number, withTotal: boolean) => {
  const calls: number[] = [];
  const rows = Array.from({ length: count }, (_, i) => i);
  return {
    calls,
    fetchPage: async (page: number, limit: number) => {
      calls.push(page);
      return { rows: rows.slice((page - 1) * limit, page * limit), total: withTotal ? count : null };
    },
  };
};

test('every row is returned, not just the first page', async () => {
  // 53 points of interest against a 50-row default was the original bug.
  const s = source(53, true);
  assert.equal((await fetchAllPages(s.fetchPage, 50)).length, 53);
  assert.deepEqual(s.calls, [1, 2]);
});

test('stops without an extra request when the total is known, and on a short page when it is not', async () => {
  const exact = source(100, true);
  assert.equal((await fetchAllPages(exact.fetchPage, 50)).length, 100);
  assert.deepEqual(exact.calls, [1, 2]);
  const unknown = source(100, false);
  assert.equal((await fetchAllPages(unknown.fetchPage, 50)).length, 100);
  assert.deepEqual(unknown.calls, [1, 2, 3]);
  assert.deepEqual(await fetchAllPages(source(0, true).fetchPage, 50), []);
});

test('a list that never ends is an error, not a partial result', async () => {
  await assert.rejects(fetchAllPages(async () => ({ rows: [1], total: null }), 1), /did not end/);
});
