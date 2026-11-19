import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST as review } from '@/app/api/admin/social/retry/route';
import { POST as callback } from '@/app/api/admin/social/video-callback/route';
import { createAdminToken } from '@/lib/admin-auth';
import { damStoryRender, releaseStorySnapshot } from '@shared/social-dam-schedule';

test('a newer Bagnell reading regenerates the same review item and ignores superseded callbacks', async t => {
  const now = Date.parse('2026-11-19T17:15:00Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  const env = {
    ADMIN_API_SECRET: 'fixture-secret', CRON_SECRET: 'fixture-worker', GH_ACTIONS_TOKEN: 'fixture-render',
    NEXT_PUBLIC_SUPABASE_URL: 'https://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key',
    META_PAGE_ACCESS_TOKEN: 'fixture-token', META_INSTAGRAM_ACCOUNT_ID: 'fixture-account',
  };
  for (const [key, value] of Object.entries(env)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const id = '7af44e55-17d3-41c8-b39e-d0b557d57602';
  const dam = { id: 'ameren-bagnell-dam', name: 'Bagnell Dam' };
  const prior = Date.parse('2026-11-19T16:00:00Z');
  const render = damStoryRender(releaseStorySnapshot(dam, [{ timestamp: prior, dischargeCfs: 6500 }], prior), 'instagram');
  const base = 'https://fixture.public.blob.vercel-storage.com/social-videos/';
  const row = {
    id, platform: 'instagram', status: 'review', auto_publish: false, media_type: 'video',
    video_url: base + 'old.mp4', caption: 'Old caption', updated_at: new Date(prior).toISOString(),
    render_request: render as typeof render & { attemptId?: string },
  };
  const targets: string[] = [];
  const unexpected: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname.endsWith('/getHeadWaterTailWaterReportData')) {
      return Response.json([{ dateTimeStamp: '2026-11-19T11:00:00', headWaterLevel: 660, tailWaterLevel: 570, discharge: 6500 }]);
    }
    if (url.pathname.endsWith('/dispatches')) {
      targets.push((await request.json()).inputs.post_ids);
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith('/admin_activity_log')) return new Response(null, { status: 201 });
    if (url.pathname.endsWith('/social_posts')) {
      assert.equal(url.searchParams.get('id'), 'eq.' + id);
      if (request.method === 'GET') return Response.json(row);
      assert.equal(request.method, 'PATCH');
      assert.equal(url.searchParams.get('status'), 'eq.' + row.status);
      if (row.render_request.attemptId) {
        assert.equal(url.searchParams.get('render_request->>attemptId'), 'eq.' + row.render_request.attemptId);
      } else {
        assert.equal(url.searchParams.get('updated_at'), 'eq.' + row.updated_at);
      }
      Object.assign(row, await request.json());
      return url.searchParams.has('select') ? Response.json([{ id }]) : new Response(null, { status: 204 });
    }
    unexpected.push(url.pathname);
    return new Response(null, { status: 400 });
  });
  const request = (path: string, token: string, body: object) => new NextRequest('http://fixture.invalid/api/admin/social/' + path, {
    method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const act = (action: string, extra = {}) => review(request('retry', createAdminToken(), { id, action, ...extra }));
  const completed = (postIds: string) => callback(request('video-callback', env.CRON_SECRET, {
    postIds, status: 'rendered', audioVerified: true, videoUrl: base + 'replacement.mp4',
  }));
  assert.equal((await act('schedule', { time: '2026-11-19T12:00' })).status, 400);
  const stale = await act('approve');
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'stale_release');
  assert.equal((await act('regenerate')).status, 202);
  assert.equal(row.status, 'rendering');
  assert.equal(row.video_url, null);
  assert.equal(row.auto_publish, false);
  assert.equal(row.render_request.inputProps.snapshot.checkedAt, '2026-11-19T17:00:00.000Z');
  assert.match(row.caption, /6,500/);
  assert.ok(row.render_request.attemptId);
  assert.deepEqual(targets, [id + ':' + row.render_request.attemptId]);
  assert.equal((await act('regenerate')).status, 409);
  assert.equal((await completed(id)).status, 200);
  assert.equal(row.status, 'rendering');
  assert.equal((await completed(targets[0])).status, 200);
  assert.equal(row.status, 'review');
  assert.equal(row.video_url, base + 'replacement.mp4');
  assert.equal((await act('approve')).status, 409);
  assert.deepEqual(unexpected, []);
});
