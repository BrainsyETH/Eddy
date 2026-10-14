import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { banSubmitter, type BanPort, type SubmitterReportRow } from './ban-submitter';
import { hashAppleSubject } from './submitter-ban';
import { applyMediaTransitions } from '../uploads/apply-media-transitions';

const USER = '11111111-1111-4111-8111-111111111111';
const REPORT = '22222222-2222-4222-8222-222222222222';
const APPLE_USER = { id: USER, identities: [{ provider: 'apple', identity_data: { sub: 'apple-sub' } }] };
const APPLE_HASH = hashAppleSubject('apple-sub');
const PATH = 'community-visuals/2026-10/33333333-3333-4333-8333-333333333333.webp';
const PUBLIC_URL = `https://x.supabase.co/storage/v1/object/public/images/${PATH}`;

/** An in-memory ban table and report table behind the port. */
function fakePort(options: {
  account?: Awaited<ReturnType<BanPort['getAccount']>>;
  reports?: SubmitterReportRow[];
  takedown?: BanPort['takedownMedia'];
} = {}) {
  const bans: Array<{ user_id: string; apple_subject_hash: string | null }> = [];
  const reports = options.reports ?? [];
  const takedownCalls: SubmitterReportRow[][] = [];
  const port: BanPort = {
    getAccount: async () => options.account ?? { user: APPLE_USER, error: null },
    findBan: async (filter) => ({
      data: bans.filter((ban) =>
        filter.split(',').some((clause) => {
          const [column, , value] = clause.split('.');
          return (ban as Record<string, unknown>)[column] === value;
        })),
      error: null,
    }),
    insertBan: async (row) => {
      bans.push({ user_id: row.user_id, apple_subject_hash: row.apple_subject_hash });
      return { error: null };
    },
    backfillAppleHash: async (userId, hash) => {
      for (const ban of bans) if (ban.user_id === userId && ban.apple_subject_hash === null) ban.apple_subject_hash = hash;
      return { error: null };
    },
    listSubmitterReports: async () => ({ data: reports.map((row) => ({ ...row })), error: null }),
    rejectReports: async (ids) => {
      for (const row of reports) if (ids.includes(row.id)) row.status = 'rejected';
      return { error: null };
    },
    takedownMedia: async (rows) => {
      takedownCalls.push(rows);
      return options.takedown ? options.takedown(rows) : { removed: rows.length, failed: 0 };
    },
  };
  return { port, bans, reports, takedownCalls };
}

const input = { userId: USER, sourceReportId: REPORT, reason: null };

test('an Auth outage records nothing and says so, instead of a weaker ban', async () => {
  const { port, bans } = fakePort({ account: { user: null, error: { status: 500, message: 'auth down' } } });
  const result = await banSubmitter(input, port);
  assert.deepEqual(result, {
    ok: false, status: 503, banned: false,
    error: 'Could not reach the account service, so nothing was banned. Try again.',
  });
  assert.equal(bans.length, 0);
});

test('a deleted account is still banned by user id', async () => {
  const { port, bans } = fakePort({ account: { user: null, error: { status: 404, code: 'user_not_found' } } });
  const result = await banSubmitter(input, port);
  assert.equal(result.ok, true);
  assert.deepEqual(bans, [{ user_id: USER, apple_subject_hash: null }]);
});

test('retrying a ban recorded without the Apple key adds the key', async () => {
  const { port, bans } = fakePort();
  bans.push({ user_id: USER, apple_subject_hash: null }); // the earlier, incomplete ban
  const result = await banSubmitter(input, port);
  assert.equal(result.ok && result.alreadyBanned, true);
  assert.deepEqual(bans, [{ user_id: USER, apple_subject_hash: APPLE_HASH }]);
});

test('a failed photo delete is reported, and a retry tries the rejected row again', async () => {
  let storageWorks = false;
  const { port, reports, takedownCalls } = fakePort({
    reports: [{ id: REPORT, status: 'verified', image_path: null, image_url: PUBLIC_URL }],
    takedown: async (rows) => {
      if (!storageWorks) return { removed: 0, failed: rows.length };
      for (const row of rows) {
        const stored = reports.find((r) => r.id === row.id);
        if (stored) stored.image_url = null;
      }
      return { removed: rows.length, failed: 0 };
    },
  });

  const first = await banSubmitter(input, port);
  assert.equal(first.ok, false);
  assert.equal(!first.ok && first.banned, true);
  assert.match(!first.ok ? first.error : '', /1 photo could not be deleted/);
  assert.equal(reports[0].status, 'rejected', 'the report is down even though its file is not');

  storageWorks = true;
  const retry = await banSubmitter(input, port);
  assert.deepEqual(retry, { ok: true, alreadyBanned: true, appleKey: true, rejected: 0, mediaRemoved: 1 });
  assert.equal(takedownCalls[1][0].id, REPORT, 'the already-rejected row was retried');
  assert.equal(reports[0].image_url, null);
});

// ── The shared takedown helper ─────────────────────────────────────────────

function fakeStorage(failBuckets: Set<string>) {
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
  const removed: string[] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          if (failBuckets.has(bucket)) return { data: null, error: { message: `${bucket} unavailable` } };
          removed.push(...paths.map((path) => `${bucket}/${path}`));
          return { data: [], error: null };
        },
      }),
    },
    from: () => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (_column: string, id: string) => {
          updates.push({ id, values });
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, updates, removed };
}

test('a takedown keeps the reference to any file it failed to delete', async () => {
  const { client, updates, removed } = fakeStorage(new Set(['images']));
  const result = await applyMediaTransitions(client, 'rejected', [
    { id: REPORT, image_path: PATH, image_url: PUBLIC_URL },
  ]);
  assert.deepEqual(result, { published: 0, removed: 0, failed: 1 });
  assert.deepEqual(removed, [`images-quarantine/${PATH}`]);
  assert.deepEqual(updates, [{ id: REPORT, values: { image_path: null } }], 'image_url kept for the retry');
});

test('a complete takedown clears both references', async () => {
  const { client, updates } = fakeStorage(new Set());
  const result = await applyMediaTransitions(client, 'rejected', [
    { id: REPORT, image_path: PATH, image_url: PUBLIC_URL },
  ]);
  assert.deepEqual(result, { published: 0, removed: 1, failed: 0 });
  assert.deepEqual(updates, [{ id: REPORT, values: { image_path: null, image_url: null } }]);
});
