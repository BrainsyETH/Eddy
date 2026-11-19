import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispatchVideos } from './dispatch-videos';
import { FacebookAdapter } from './facebook-adapter';
import { destinationLabel, expandDestinations, renderPlacement, savedPlacementChoices, validPlacementChoices } from './placements';
import { blocksRepost, postsFromToday } from './post-scheduler';
import { applyRule, defaultDelivery, deliveryOn, planRules, wantedPlatforms, type PlanConfig } from './publishing-plan';
import { draftSendTime } from './draft-time';
import { supportsStory } from './post-types';
import { savedPostMedia } from './review';
import { destinationRenderRequest, getCompositionForPost } from './video-renderer';

test('Float Pick preserves older schedules and expands only selected Meta platforms', () => {
  assert.deepEqual(expandDestinations(['facebook', 'instagram']).map(d => d.placement), ['reel', 'reel']);
  assert.deepEqual(expandDestinations(['facebook', 'instagram', 'tiktok', 'facebook'], { instagram: 'story', facebook: 'both' }), [
    { platform: 'facebook', placement: 'reel' }, { platform: 'facebook', placement: 'story' },
    { platform: 'instagram', placement: 'story' }, { platform: 'tiktok', placement: 'reel' },
  ]);
  assert.ok(validPlacementChoices({ instagram: 'both' }));
  for (const value of [[], null, { tiktok: 'both' }, { facebook: 'strory' }]) assert.equal(validPlacementChoices(value), false);
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
  const posts = expandDestinations(['facebook'], { facebook: 'both' }).map(d => ({
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

test('placement choices apply only to formats with per-destination layouts', () => {
  assert.equal(supportsStory('section_guide'), true);
  for (const kind of ['weekly_forecast', 'river_highlight', 'daily_digest', 'tip', 'nope']) assert.equal(supportsStory(kind), false);
  // A shared format ignores saved choices and gets one regular post per platform, with no placement.
  assert.deepEqual(expandDestinations(['facebook', 'instagram', 'facebook'], { instagram: 'story' }, false),
    [{ platform: 'facebook' }, { platform: 'instagram' }]);
  assert.deepEqual(savedPlacementChoices({ section_guide: { placements: { facebook: 'both' } } }, 'section_guide'), { facebook: 'both' });
  assert.equal(savedPlacementChoices({ section_guide: { placements: { facebook: 'nope' } } }, 'section_guide'), undefined);
  assert.equal(savedPlacementChoices({}, 'weekly_forecast'), undefined);
  assert.equal(renderPlacement({ inputProps: { placement: 'story' } }), 'story');
  assert.equal(renderPlacement({ inputProps: {} }), undefined);
  assert.equal(destinationLabel('instagram', 'story'), 'Instagram Story');
  assert.equal(destinationLabel('facebook', 'reel'), 'Facebook Page video');
  assert.equal(destinationLabel('instagram'), 'Instagram');
});

test('a shared format renders once for every platform, in its own file, and can keep undispatched rows for a fallback', async t => {
  const before = process.env.GH_ACTIONS_TOKEN;
  process.env.GH_ACTIONS_TOKEN = 'fixture';
  t.after(() => { if (before === undefined) delete process.env.GH_ACTIONS_TOKEN; else process.env.GH_ACTIONS_TOKEN = before; });
  type Row = { id: string; eddy_update_id: string | null; render_request: { outputFilename: string } };
  let inserted: Row[] = [];
  let updates = 0;
  const db = { from: () => ({
    insert(rows: Row[]) { inserted = rows; return { error: null }; },
    update: () => { updates++; return { in: () => ({ eq: () => undefined }) }; },
  }) } as unknown as SupabaseClient;
  const sent: { post_ids: string; output_filename: string }[] = [];
  let status = 204;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).inputs);
    return new Response(null, { status });
  });
  const posts = expandDestinations(['facebook', 'instagram'], { instagram: 'story' }, false).map(d => ({
    ...d, riverSlug: null, caption: 'caption', imageUrl: 'cover', hashtags: [], eddyUpdateId: 'update-1',
  }));
  const shared = await dispatchVideos(db, 'weekly_forecast', {}, posts, true);
  assert.equal(shared.rendering, 2);
  assert.equal(sent.length, 1, 'one render for both platforms');
  assert.equal(sent[0].post_ids, inserted.map(r => r.id).join(','));
  assert.equal(inserted[0].render_request.outputFilename, inserted[1].render_request.outputFilename);
  assert.ok(sent[0].output_filename.startsWith(inserted[0].id + '-forecast-'), 'named after the batch, not the day alone');
  assert.ok(inserted.every(r => r.eddy_update_id === 'update-1'));

  status = 503;
  const kept = await dispatchVideos(db, 'weekly_forecast', {}, posts, true, { keepUndispatched: true });
  assert.equal(kept.rendering, 0);
  assert.equal(updates, 0, 'rows stay rendering for the caller to claim');
  assert.deepEqual(kept.undispatched.map(u => u.id), inserted.map(r => r.id));
  assert.deepEqual(kept.warnings, []);
});

test('scheduler dedupe uses the Central date and keeps failed Float Picks for Render again', async () => {
  // 8pm Central on Nov 18 is already Nov 19 in UTC.
  const now = new Date('2026-11-19T02:00:00Z');
  const rows = [
    { id: 'evening', created_at: '2026-11-19T01:00:00Z', status: 'published', auto_publish: true, image_url: null },
    { id: 'morning', created_at: '2026-11-18T15:00:00Z', status: 'failed', auto_publish: true, image_url: null },
    { id: 'yesterday', created_at: '2026-11-18T05:00:00Z', status: 'published', auto_publish: true, image_url: null },
  ];
  const db = { from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ data: rows, error: null }) }) }) }) };
  const today = await postsFromToday(db, 'weekly_forecast', 'America/Chicago', now);
  assert.deepEqual(today.map(r => r.id), ['evening', 'morning']);

  const clip = { ...rows[0], id: 'clip', image_url: 'https://cdn/clip.jpg' };
  const read = { ...rows[0], id: 'read', image_url: 'https://eddy.guide/api/og/social?type=weekend-read&platform=instagram' };
  const readDb = { from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ data: [clip, read], error: null }) }) }) }) };
  assert.deepEqual((await postsFromToday(readDb, 'river_highlight', 'America/Chicago', now)).map(r => r.id), ['read']);

  const failedScheduled = { status: 'failed', auto_publish: true };
  assert.equal(blocksRepost('section_guide', failedScheduled), true);
  assert.equal(blocksRepost('weekly_forecast', failedScheduled), false, 'image-fallback formats retry on the next tick');
  assert.equal(blocksRepost('section_guide', { status: 'failed', auto_publish: false }), false, 'a failed draft never blocks');
  for (const status of ['pending', 'rendering', 'publishing', 'unknown', 'published', 'inbox']) {
    assert.equal(blocksRepost('weekly_forecast', { status, auto_publish: false }), true, status);
  }

  const broken = { from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ data: null, error: { message: 'down' } }) }) }) }) };
  await assert.rejects(postsFromToday(broken, 'weekly_forecast', 'America/Chicago', now), /today's weekly_forecast/);
});

test('the planner inherits existing deliveries and a single-day edit only changes that occurrence', () => {
  const config: PlanConfig = { media_schedule: { daily_digest: {}, river_highlight: {}, section_guide: { mon: 'video', fri: 'image' } },
    section_guide: { time_cst: '17:00', placements: { facebook: 'both' } } };
  const base = defaultDelivery(config, 'section_guide');
  assert.deepEqual(planRules(config), [{ format: 'section_guide', days: ['mon', 'fri'], delivery: base }]);
  const friday = { ...base, instagram: 'story' as const, facebook: 'off' as const, time: '09:30', tiktok: false };
  const saved = { ...config, media_schedule: applyRule(config, 'section_guide', ['fri'], ['fri'], friday) };
  assert.deepEqual(deliveryOn(saved, 'section_guide', 'mon'), base);
  assert.deepEqual(deliveryOn(saved, 'section_guide', 'fri'), friday);
  assert.deepEqual(wantedPlatforms(friday, ['facebook', 'instagram', 'tiktok']), ['instagram']);
  assert.deepEqual(wantedPlatforms(friday, ['facebook', 'tiktok']), []);
  assert.throws(() => applyRule(saved, 'section_guide', [], ['mon'], friday), /already has/);
  assert.equal(planRules({ ...saved, media_schedule: applyRule(saved, 'section_guide', ['fri'], [], friday) }).length, 1);
  assert.throws(() => applyRule(config, 'daily_digest', [], ['mon'], friday), /valid/);
  assert.throws(() => applyRule(config, 'river_highlight', [], ['mon'], defaultDelivery(config, 'river_highlight')), /valid/);
  assert.throws(() => applyRule(config, 'weekly_forecast', [], ['mon'], { ...base, facebook: 'regular', time: '27:00' }), /valid/);
});

test('one-time approvals store the Central publishing tick as an instant and reject expired or impossible times', () => {
  const now = Date.parse('2026-03-07T16:00:00Z');
  assert.equal(draftSendTime('2026-03-07T11:30', {}, now), '2026-03-07T17:30:00.000Z');
  assert.equal(draftSendTime('2026-07-01T11:30', {}, now), '2026-07-01T16:30:00.000Z');
  for (const time of ['2026-03-07T09:30', '2026-03-08T02:30', '2026-07-01T11:15']) {
    assert.throws(() => draftSendTime(time, {}, now));
  }
  const dam = { compositionId: 'social-dam-schedule', inputProps: { snapshot: { scheduleDate: '2026-03-07' } } };
  assert.throws(() => draftSendTime('2026-03-09T10:00', dam, now), /date shown/);
});
