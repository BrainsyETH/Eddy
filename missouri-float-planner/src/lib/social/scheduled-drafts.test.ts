import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { FacebookAdapter } from './facebook-adapter';
import { sendReviewedPost } from './send-reviewed';

type SavedPost = Parameters<typeof sendReviewedPost>[1];
type Client = Parameters<typeof sendReviewedPost>[0];

test('the publisher claims a due approval once and leaves cancelled approvals alone', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create table social_posts (
    id text primary key, status text not null, auto_publish boolean not null default true,
    retry_count int default 0, updated_at timestamptz, error_message text, platform_post_id text, published_at timestamptz,
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
  const provider = t.mock.method(FacebookAdapter.prototype, 'publishPost', async () => ({ success: true, platformPostId: 'receipt' }));
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
  const results = await Promise.all([sendReviewedPost(client, post, 'scheduled'), sendReviewedPost(client, post, 'scheduled')]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(provider.mock.callCount(), 1);
  assert.deepEqual((await db.query("select status,platform_post_id from social_posts where id='draft'")).rows, [{ status: 'published', platform_post_id: 'receipt' }]);
});
