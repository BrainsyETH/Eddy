import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processRevocation, retryDelayMs, type PendingRevocation } from './revocation-queue';

function queue(row: PendingRevocation) {
  const rows = new Map<string, PendingRevocation & { next_attempt_at?: string; last_error?: string }>([[row.id, { ...row }]]);
  const admin = {
    from(table: string) {
      assert.equal(table, 'apple_token_revocations');
      return {
        delete: () => ({ eq: async (_key: string, id: string) => { rows.delete(id); return { error: null }; } }),
        update: (patch: object) => ({ eq: async (_key: string, id: string) => {
          const current = rows.get(id);
          if (current) rows.set(id, { ...current, ...patch });
          return { error: null };
        } }),
      };
    },
  } as unknown as SupabaseClient;
  return { admin, rows };
}
const credentials = { teamId: 'test', keyId: 'test', privateKey: 'unused', clientId: 'test' };
const row = { id: 'deleted-account', refresh_token: 'secret-token', attempts: 0 };

test('failed revocation survives deletion and a later successful retry clears it', async () => {
  const { admin, rows } = queue(row);
  assert.equal(await processRevocation(admin, row, {
    credentials, now: () => 0, revoke: async () => ({ ok: false, error: 'unsafe secret-token message' }),
  }), 'pending');
  assert.equal(rows.get(row.id)?.refresh_token, 'secret-token');
  assert.equal(rows.get(row.id)?.attempts, 1);
  assert.equal(rows.get(row.id)?.next_attempt_at, new Date(5 * 60_000).toISOString());
  assert.equal(rows.get(row.id)?.last_error, 'apple_request_failed');
  assert.equal(await processRevocation(admin, rows.get(row.id)!, {
    credentials, revoke: async token => { assert.equal(token, 'secret-token'); return { ok: true }; },
  }), 'revoked');
  assert.equal(rows.size, 0);
});

test('missing configuration keeps the token and schedules a retry without calling Apple', async () => {
  const { admin, rows } = queue(row);
  assert.equal(await processRevocation(admin, row, {
    credentials: null, revoke: async () => { throw new Error('must not call'); },
  }), 'pending');
  assert.equal(rows.get(row.id)?.last_error, 'not_configured');
});

test('thrown network failures are retryable and do not persist exception text', async () => {
  const { admin, rows } = queue(row);
  assert.equal(await processRevocation(admin, row, {
    credentials, revoke: async () => { throw new Error('secret-token'); },
  }), 'pending');
  assert.equal(rows.get(row.id)?.last_error, 'apple_request_failed');
});

test('backoff is bounded at one day without discarding unresolved credentials', () => {
  assert.equal(retryDelayMs(0), 5 * 60_000);
  assert.equal(retryDelayMs(1), 10 * 60_000);
  assert.equal(retryDelayMs(1000), 24 * 60 * 60_000);
});
