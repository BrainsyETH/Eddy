import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispatchVideos } from './dispatch-videos';
import { FacebookAdapter } from './facebook-adapter';
import { floatPickDestinations, validFloatPickPlacements } from './float-pick-placements';
import { savedPostMedia } from './review';
import { destinationRenderRequest, getCompositionForPost } from './video-renderer';

test('Float Pick preserves older schedules and expands only selected Meta platforms', () => {
  assert.deepEqual(floatPickDestinations(['facebook', 'instagram']).map(d => d.placement), ['reel', 'reel']);
  assert.deepEqual(floatPickDestinations(['facebook', 'instagram', 'tiktok', 'facebook'], { instagram: 'story', facebook: 'both' }), [
    { platform: 'facebook', placement: 'reel' }, { platform: 'facebook', placement: 'story' },
    { platform: 'instagram', placement: 'story' }, { platform: 'tiktok', placement: 'reel' },
  ]);
  assert.ok(validFloatPickPlacements({ instagram: 'both' }));
  for (const value of [[], null, { tiktok: 'both' }, { facebook: 'strory' }]) assert.equal(validFloatPickPlacements(value), false);
});

test('one failed Story dispatch leaves its regular sibling queued and retry preserves the Story', async t => {
  const before = process.env.GH_ACTIONS_TOKEN;
  process.env.GH_ACTIONS_TOKEN = 'fixture';
  t.after(() => { if (before === undefined) delete process.env.GH_ACTIONS_TOKEN; else process.env.GH_ACTIONS_TOKEN = before; });
  type Row = { id: string; auto_publish: boolean; render_request: ReturnType<typeof getCompositionForPost> };
  let inserted: Row[] = [];
  let failed: string[] = [];
  const db = { from: () => ({
    insert(rows: Row[]) { inserted = rows; return { error: null }; },
    update: () => ({ in: (_: string, ids: string[]) => ({ eq: () => { failed = ids; } }) }),
  }) } as unknown as SupabaseClient;
  const sent: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const { inputs } = JSON.parse(String(init.body));
    sent.push(inputs.post_ids);
    return new Response(null, { status: inputs.output_filename.endsWith('-story') ? 503 : 204 });
  });
  const posts = floatPickDestinations(['facebook'], { facebook: 'both' }).map(d => ({
    ...d, riverSlug: 'current', caption: 'caption', imageUrl: 'cover', hashtags: [],
  }));
  const result = await dispatchVideos(db, 'section_guide', { riverName: 'Current River' }, posts, true);
  assert.equal(result.rendering, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(inserted.length, 2);
  assert.ok(inserted.every(r => r.auto_publish));
  assert.deepEqual(sent, inserted.map(r => r.id));
  assert.deepEqual(failed, [inserted[1].id]);
  assert.notEqual(inserted[0].render_request.outputFilename, inserted[1].render_request.outputFilename);
  const media = { platform: 'facebook', caption: 'caption', image_url: 'cover', video_url: 'video', media_type: 'video' };
  const saved = inserted[1].render_request;
  assert.deepEqual(destinationRenderRequest(saved, 'facebook'), saved);
  assert.deepEqual(savedPostMedia({ ...media, render_request: saved }), { caption: '', videoUrl: 'video', mediaType: 'video', placement: 'story' });
  assert.equal(savedPostMedia({ ...media, render_request: inserted[0].render_request }).coverUrl, 'cover');
});

test('Facebook Story uploads privately then finishes once, with a distinct receipt and ambiguous final failure', async t => {
  const page = process.env.META_PAGE_ID, token = process.env.META_PAGE_ACCESS_TOKEN;
  process.env.META_PAGE_ID = 'page'; process.env.META_PAGE_ACCESS_TOKEN = 'test';
  t.after(() => {
    if (page === undefined) delete process.env.META_PAGE_ID; else process.env.META_PAGE_ID = page;
    if (token === undefined) delete process.env.META_PAGE_ACCESS_TOKEN; else process.env.META_PAGE_ACCESS_TOKEN = token;
  });
  const endpoint = 'https://graph.facebook.com/v24.0/page/video_stories';
  const uploadUrl = 'https://rupload.facebook.com/video-upload/v24.0/123';
  let uploadedTo = uploadUrl;
  let uploadOK = true;
  let finish = Response.json({ success: true, post_id: 'story-receipt' });
  let calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    calls.push(String(url));
    if (String(url) === uploadUrl) {
      assert.equal(new Headers(init.headers).get('file_url'), 'https://cdn.example/pick.mp4');
      assert.equal(init.redirect, 'error');
      return Response.json({ success: uploadOK });
    }
    assert.equal(String(url), endpoint);
    const body = init.body as URLSearchParams;
    assert.ok(!body.has('description'));
    if (body.get('upload_phase') === 'start') return Response.json({ upload_url: uploadedTo, video_id: '123' });
    assert.equal(body.get('upload_phase'), 'finish');
    assert.equal(body.get('video_id'), '123');
    return finish;
  });
  const adapter = new FacebookAdapter();
  const send = () => adapter.publishPost({ mediaType: 'video', placement: 'story', caption: '', videoUrl: 'https://cdn.example/pick.mp4' });
  assert.equal((await send()).platformPostId, 'story-receipt');
  assert.deepEqual(calls, [endpoint, uploadUrl, endpoint]);
  finish = new Response(null, { status: 503 });
  assert.equal((await send()).ambiguous, true);
  finish = Response.json({});
  assert.equal((await send()).ambiguous, true);
  calls = []; uploadOK = false;
  assert.equal((await send()).success, false);
  assert.deepEqual(calls, [endpoint, uploadUrl]);
  calls = []; uploadedTo = 'https://elsewhere.example/video-upload/v24.0/123';
  assert.equal((await send()).success, false);
  assert.deepEqual(calls, [endpoint]);
});
