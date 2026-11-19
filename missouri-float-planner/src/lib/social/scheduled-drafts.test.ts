import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { FacebookAdapter } from './facebook-adapter';
import type { PublishResult } from './types';
import { publishVideoToInstagram } from './meta-client';
import { sendReviewedPost } from './send-reviewed';

type SavedPost = Parameters<typeof sendReviewedPost>[1];
type Client = Parameters<typeof sendReviewedPost>[0];

test('the publisher claims a due approval once and leaves cancelled approvals alone', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create table social_posts (
    id text primary key, status text not null, auto_publish boolean not null default true,
    retry_count int default 0, updated_at timestamptz, error_message text, provider_attempt_id text, platform_post_id text, published_at timestamptz,
    constraint social_posts_status_check check (status in ('review', 'published')));
    insert into social_posts(id,status,auto_publish) values ('legacy','published',true), ('draft','review',false);`);
  await db.exec(await readFile('supabase/migrations/20261119135000_social_scheduled_drafts.sql', 'utf8'));
  await assert.rejects(db.query("update social_posts set status='scheduled' where id='draft'"));
  await assert.rejects(db.query("update social_posts set status='scheduled',scheduled_at=now() where id='legacy'"));
  const at = '2026-11-19T14:00:00Z';
  const schedule = () => db.query("update social_posts set status='scheduled',scheduled_at=$1 where id='draft'", [at]);
  await schedule();
  const oldToken = process.env.META_PAGE_ACCESS_TOKEN;
  const oldId = process.env.META_PAGE_ID;
  process.env.META_PAGE_ACCESS_TOKEN = 'fixture';
  process.env.META_PAGE_ID = 'fixture';
  t.after(() => {
    if (oldToken === undefined) delete process.env.META_PAGE_ACCESS_TOKEN; else process.env.META_PAGE_ACCESS_TOKEN = oldToken;
    if (oldId === undefined) delete process.env.META_PAGE_ID; else process.env.META_PAGE_ID = oldId;
  });
  const provider = t.mock.method(FacebookAdapter.prototype, 'publishPost', async (): Promise<PublishResult> => ({ success: true, platformPostId: 'receipt' }));
  // Exercise the production compare-and-swap against PostgreSQL with a local provider.
  const client = { from: () => ({ update: (fields: Record<string, unknown>) => {
    const params = Object.values(fields);
    const updates = Object.keys(fields).map((key, i) => key + '=$' + (i + 1));
    const predicates: string[] = [];
    const run = async () => ({ data: (await db.query('update social_posts set ' + updates.join(',') + ' where ' + predicates.join(' and ') + ' returning id', params)).rows, error: null });
    const query = {
      eq(key: string, value: unknown) { predicates.push(key + '=$' + params.push(value)); return query; },
      select: run,
      then(resolve: (value: unknown) => void, reject: (error: unknown) => void) { return run().then(resolve, reject); },
    };
    return query;
  } }) } as unknown as Client;
  const post = { id: 'draft', scheduled_at: at, platform: 'facebook', retry_count: 0, media_type: 'image', image_url: null, caption: 'Fixture', render_request: null } as SavedPost;
  await db.query("update social_posts set status='review',scheduled_at=null where id='draft'");
  assert.equal((await sendReviewedPost(client, post, 'scheduled')).status, 409);
  assert.equal(provider.mock.callCount(), 0);
  await schedule();
  const expired = { claimBefore: Date.now() - 1, signal: new AbortController().signal };
  assert.equal((await sendReviewedPost(client, post, 'scheduled', expired)).status, 202);
  assert.equal(provider.mock.callCount(), 0);
  assert.equal((await db.query<{ status: string }>("select status from social_posts where id='draft'")).rows[0].status, 'scheduled');
  const results = await Promise.all([sendReviewedPost(client, post, 'scheduled'), sendReviewedPost(client, post, 'scheduled')]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(provider.mock.callCount(), 1);
  assert.deepEqual((await db.query("select status,platform_post_id from social_posts where id='draft'")).rows, [{ status: 'published', platform_post_id: 'receipt' }]);

  // Expiry during private preparation is retryable. Losing a public receipt is ambiguous.
  for (const ambiguous of [false, true]) {
    await schedule();
    const controller = new AbortController();
    provider.mock.mockImplementationOnce(async () => {
      controller.abort();
      return { success: false, ambiguous, error: 'deadline' };
    });
    const result = await sendReviewedPost(client, post, 'scheduled', { claimBefore: Date.now() + 60_000, signal: controller.signal });
    assert.equal(result.status, ambiguous ? 502 : 202);
    assert.equal((await db.query<{ status: string }>("select status from social_posts where id='draft'")).rows[0].status, ambiguous ? 'unknown' : 'scheduled');
  }
});

test('Instagram exits a stalled processing poll without attempting to publish', async t => {
  const oldAccount = process.env.META_INSTAGRAM_ACCOUNT_ID;
  const oldToken = process.env.META_PAGE_ACCESS_TOKEN;
  process.env.META_INSTAGRAM_ACCOUNT_ID = 'ig-fixture';
  process.env.META_PAGE_ACCESS_TOKEN = 'test-token';
  t.after(() => {
    if (oldAccount === undefined) delete process.env.META_INSTAGRAM_ACCOUNT_ID; else process.env.META_INSTAGRAM_ACCOUNT_ID = oldAccount;
    if (oldToken === undefined) delete process.env.META_PAGE_ACCESS_TOKEN; else process.env.META_PAGE_ACCESS_TOKEN = oldToken;
  });
  const controller = new AbortController();
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
    const path = new URL(input).pathname;
    paths.push(path);
    if (path.endsWith('/media')) return Response.json({ id: 'private-id' });
    assert.ok(path.endsWith('/private-id'));
    controller.abort();
    assert.equal(init.signal?.aborted, true);
    throw new Error('aborted');
  });
  const result = await publishVideoToInstagram({ videoUrl: 'https://example.com/draft.mp4', caption: '', signal: controller.signal });
  assert.equal(result.success, false);
  assert.ok(!result.ambiguous);
  assert.equal(paths.length, 2);
});
