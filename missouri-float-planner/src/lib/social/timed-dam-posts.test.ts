import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { POST as create } from '@/app/api/admin/social/dam-schedule/route';
import { POST as review } from '@/app/api/admin/social/retry/route';
import { POST as callback } from '@/app/api/admin/social/video-callback/route';
import { createAdminToken } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { InstagramAdapter } from './instagram-adapter';
import { sendReviewedPost } from './send-reviewed';
import type { PublishParams } from './types';

type SavedPost = Parameters<typeof sendReviewedPost>[1];

test('a dam video made with a send time posts itself, waits out an unreachable source and re-renders a revised schedule', async t => {
  const source = readFileSync('src/lib/usace/__fixtures__/swpa-mon-2026-07-27.txt', 'utf8');
  // Monday 9:00 AM Central. The fixture is that day's SWPA sheet.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-07-27T14:00:00Z') });
  const env = {
    ADMIN_API_SECRET: 'fixture-secret', CRON_SECRET: 'fixture-worker', GH_ACTIONS_TOKEN: 'fixture-render',
    NEXT_PUBLIC_SUPABASE_URL: 'https://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key',
    META_PAGE_ACCESS_TOKEN: 'fixture-token', META_INSTAGRAM_ACCOUNT_ID: 'fixture-account',
    SOCIAL_ALERT_WEBHOOK_URL: 'https://alerts.invalid/hook',
  };
  for (const [key, value] of Object.entries(env)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const id = '7af44e55-17d3-41c8-b39e-d0b557d57602';
  const base = 'https://fixture.public.blob.vercel-storage.com/social-videos/';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let row: Record<string, any> = {};
  let sourceUp = true;
  const targets: string[] = [];
  const alerts: string[] = [];
  const unexpected: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === 'www.energy.gov') {
      if (!sourceUp) return new Response(null, { status: 503 });
      const body = url.pathname.endsWith('/mon.htm') ? source : source.replace('MONDAY JULY 27', 'TUESDAY JULY 28');
      return new Response(body, { headers: { Date: new Date().toUTCString() } });
    }
    if (url.pathname.endsWith('/dispatches')) {
      targets.push((await request.json()).inputs.post_ids);
      return new Response(null, { status: 204 });
    }
    if (url.hostname === 'alerts.invalid') { alerts.push((await request.json()).text); return new Response(null, { status: 200 }); }
    if (url.pathname.endsWith('/admin_activity_log')) return new Response(null, { status: 201 });
    if (url.pathname.endsWith('/social_posts')) {
      const one = request.headers.get('accept')?.includes('vnd.pgrst.object');
      if (request.method === 'POST') {
        row = { id, retry_count: 0, video_url: null, image_url: null, error_message: null, updated_at: new Date().toISOString(), ...(await request.json()) };
        return Response.json(one ? row : [row], { status: 201 });
      }
      const matches = [...url.searchParams].every(([key, value]) => {
        if (key === 'select') return true;
        const field = key === 'render_request->>attemptId' ? row.render_request?.attemptId ?? null : row[key] ?? null;
        if (value === 'is.null') return field === null;
        assert.ok(value.startsWith('eq.'), key + '=' + value);
        return String(field) === value.slice(3);
      });
      if (request.method === 'GET') return matches ? Response.json(one ? row : [row]) : Response.json(one ? {} : [], { status: one ? 406 : 200 });
      assert.equal(request.method, 'PATCH');
      if (matches) Object.assign(row, await request.json());
      return url.searchParams.has('select') ? Response.json(matches ? [{ id }] : []) : new Response(null, { status: 204 });
    }
    unexpected.push(request.method + ' ' + url.href);
    return new Response(null, { status: 400 });
  });
  const request = (path: string, token: string, body: object) => new NextRequest('http://fixture.invalid/api/admin/social/' + path, {
    method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const make = (sendAt?: string) => create(request('dam-schedule', createAdminToken(), { damId: 'swl-table-rock-dam', date: '2026-07-27', platforms: ['instagram'], sendAt }));
  const act = (action: string) => review(request('retry', createAdminToken(), { id, action }));
  const rendered = (postIds: string, file: string) => callback(request('video-callback', env.CRON_SECRET, { postIds, status: 'rendered', audioVerified: true, videoUrl: base + file }));
  const due = () => sendReviewedPost(createAdminClient(), structuredClone(row) as SavedPost, 'scheduled');
  const sent: PublishParams[] = [];
  const published = t.mock.method(InstagramAdapter.prototype, 'publishPost', async (params: PublishParams) => {
    sent.push(params);
    return { success: true, platformPostId: 'receipt' };
  });

  // The time has to be one the publisher runs at, on or before the day the video shows.
  for (const sendAt of ['2026-07-27T10:15', '2026-07-27T08:30', '2026-07-28T08:00']) assert.equal((await make(sendAt)).status, 400);
  assert.deepEqual(targets, []);

  // Withdrawn while it renders: the finished video waits for review like any other.
  assert.equal((await make('2026-07-27T10:00')).status, 202);
  assert.deepEqual([row.status, row.scheduled_at, row.auto_publish], ['rendering', '2026-07-27T15:00:00.000Z', false]);
  assert.equal((await act('unschedule')).status, 200);
  await rendered(id, 'first.mp4');
  assert.deepEqual([row.status, row.scheduled_at], ['review', null]);

  // A render that fails has nobody waiting on it, so it is reported.
  assert.equal((await make('2026-07-27T10:00')).status, 202);
  await callback(request('video-callback', env.CRON_SECRET, { postIds: id, status: 'failed', error: 'Renderer crashed' }));
  assert.equal(row.status, 'failed');
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /Renderer crashed/);

  // Left alone, it is scheduled the moment the render lands.
  assert.equal((await make('2026-07-27T10:00')).status, 202);
  await rendered(id, 'first.mp4');
  assert.deepEqual([row.status, row.video_url], ['scheduled', base + 'first.mp4']);

  // 10:00 AM, source unreachable: nothing is sent and nothing is lost.
  t.mock.timers.setTime(Date.parse('2026-07-27T15:00:05Z'));
  sourceUp = false;
  let result = await due();
  assert.deepEqual([result.status, 'retrying' in result.body], [503, true]);
  assert.equal(row.status, 'scheduled');
  assert.match(row.error_message, /^Waiting to send/);

  // 10:30 AM, source back with a schedule that no longer matches the video: render it again, keep the time.
  t.mock.timers.setTime(Date.parse('2026-07-27T15:30:05Z'));
  sourceUp = true;
  row.render_request.inputProps.snapshot.hourlyMw[0] += 5;
  result = await due();
  assert.deepEqual([result.status, 'retrying' in result.body], [503, true]);
  assert.deepEqual([row.status, row.video_url, row.scheduled_at], ['rendering', null, '2026-07-27T15:00:00.000Z']);
  assert.match(row.caption, /Eddy checked Jul 27, 10:30 AM CDT/);
  assert.equal(targets.at(-1), id + ':' + row.render_request.attemptId);
  await rendered(id, 'superseded.mp4');
  assert.equal(row.status, 'rendering');
  await rendered(targets.at(-1)!, 'second.mp4');
  assert.deepEqual([row.status, row.video_url, row.error_message], ['scheduled', base + 'second.mp4', null]);
  assert.equal(published.mock.callCount(), 0);

  // 11:00 AM: the updated video matches the source and goes to the Story.
  t.mock.timers.setTime(Date.parse('2026-07-27T16:00:05Z'));
  result = await due();
  assert.equal(result.status, 200);
  assert.equal(published.mock.callCount(), 1);
  assert.equal(sent[0].placement, 'story');
  assert.deepEqual([row.status, row.platform_post_id], ['published', 'receipt']);

  // More than two hours late with the source still down: give up and say so.
  Object.assign(row, { status: 'scheduled', scheduled_at: '2026-07-27T13:30:00.000Z' });
  sourceUp = false;
  result = await due();
  assert.equal(result.status, 409);
  assert.equal(row.status, 'failed');

  // Regenerating a failed timed post by hand makes a draft for review, not another timed send.
  sourceUp = true;
  assert.equal((await act('regenerate')).status, 202);
  assert.deepEqual([row.status, row.scheduled_at], ['rendering', null]);
  await rendered(targets.at(-1)!, 'third.mp4');
  assert.equal(row.status, 'review');
  assert.equal(alerts.length, 1);
  assert.deepEqual(unexpected, []);
});
