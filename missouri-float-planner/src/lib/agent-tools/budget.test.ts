import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { UsgsProvider } from '@/lib/flow-providers/usgs';
import { memoizeReads } from './read-cache';
import { searchBudget } from './budget';

test('deadline cancels the actual PostgREST request, not just the outer wait', async () => {
  let requestSignal: AbortSignal | null = null;
  const db = createClient<Database>('https://fixture.supabase.co', 'fixture', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (_input, init) => {
        requestSignal = init!.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal!.addEventListener(
            'abort',
            () => reject(requestSignal!.reason),
            { once: true },
          );
        });
      },
    },
  });
  const budget = searchBudget(25);
  try {
    await assert.rejects(
      Promise.resolve(
        memoizeReads(db, budget.signal).from('rivers').select('id'),
      ),
      /deadline/,
    );
    assert.equal((requestSignal as AbortSignal | null)?.aborted, true);
  } finally {
    budget.dispose();
  }
});

test('cancelled modern USGS lookup does not start a legacy fallback', async () => {
  const saved = globalThis.fetch,
    savedMode = process.env.USGS_FLOW_API;
  process.env.USGS_FLOW_API = 'modern';
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      const signal = init!.signal!;
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      });
      if (signal.aborted) reject(signal.reason);
    });
  };
  const budget = searchBudget(25);
  try {
    await assert.rejects(
      new UsgsProvider().fetchLatest(['07064533'], { signal: budget.signal }),
      /deadline/,
    );
    assert.equal(calls, 1);
  } finally {
    budget.dispose();
    globalThis.fetch = saved;
    if (savedMode === undefined) delete process.env.USGS_FLOW_API;
    else process.env.USGS_FLOW_API = savedMode;
  }
});
