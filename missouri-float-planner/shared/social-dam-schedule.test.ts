import test from 'node:test';
import assert from 'node:assert/strict';
import { damStorySnapshot, damStoryWindows, damStorySummary, damStoryRender, damStoryCaption, DAM_STORY_FIXTURE } from './social-dam-schedule';
import { savedPostMedia } from '../src/lib/social/review';
import { publishVideoToTikTok, publishVideoToTikTokDirect } from '../src/lib/social/tiktok-client';
import { FakeOutboxDb } from '../src/lib/alerts/fake-outbox-db';
import { InstagramAdapter } from '../src/lib/social/instagram-adapter';
import type { DamScheduleDay } from './dam-types';

const now = Date.parse('2026-11-09T16:30:00Z');
const day = (active = [13, 14, 15, 16, 17, 18, 19, 20]): DamScheduleDay => ({
  scheduleDate: '2026-11-09', retrievedAt: '2026-11-09T16:00:00Z', idle: [],
  hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: active.includes(i + 1) ? 100 : 0, cfs: null, isRamp: false })),
});
test('hour-ending data produces noon to 8 PM, preserves gaps and labels midnight', () => {
  assert.deepEqual(damStoryWindows(damStorySnapshot(day(), '2026-11-09', now).hours), ['Noon–8 PM']);
  assert.deepEqual(damStoryWindows(damStorySnapshot(day([1, 2, 13, 24]), '2026-11-09', now).hours), ['Midnight–2 AM', 'Noon–1 PM', '11 PM–midnight']);
  assert.deepEqual(damStoryWindows(Array(24).fill(true)), ['All day']);
  assert.equal(damStoryWindows(Array.from({ length: 24 }, (_, i) => i % 2 === 0)).length, 12);
});
test('minimum flow and a confirmed zero day never imply that water is off', () => {
  const minimum = day([]); minimum.hours.forEach(h => { h.minimumFlow = true; h.megawatts = 5; });
  const snapshot = damStorySnapshot(minimum, minimum.scheduleDate, now);
  assert.equal(snapshot.minimumFlow, true); assert.equal(snapshot.hours.some(Boolean), false);
  assert.equal(damStorySummary(snapshot), 'Only minimum flow scheduled');
  assert.match(damStoryCaption(snapshot), /Only minimum flow scheduled/);
  assert.doesNotMatch(damStoryCaption(snapshot), /No generation scheduled|0 hours|also scheduled/);
  assert.equal(damStorySummary(damStorySnapshot(day([]), minimum.scheduleDate, now)), 'No generation scheduled');
  assert.doesNotMatch(damStoryCaption(snapshot), /water off|safe to wade/i);
  assert.equal(damStorySnapshot(day([]), minimum.scheduleDate, now).hours.some(Boolean), false);
});
test('unposted, incomplete, duplicate, non-finite and stale sources fail closed', () => {
  assert.throws(() => damStorySnapshot(undefined, '2026-11-09', now), /not been posted/);
  for (const hours of [day().hours.slice(1), day().hours.map(h => ({ ...h, hourEnding: 1 })), day().hours.map(h => ({ ...h, megawatts: NaN })), day().hours.map(h => ({ ...h, megawatts: -1 }))]) {
    assert.throws(() => damStorySnapshot({ ...day(), hours }, '2026-11-09', now), /incomplete/);
  }
  for (const retrievedAt of [null, 'invalid', '2026-11-09T14:00:00Z', '2026-11-09T17:00:00Z']) {
    assert.throws(() => damStorySnapshot({ ...day(), retrievedAt }, '2026-11-09', now), /needs a new check/);
  }
});
test('date selection follows Central midnight, including DST days, without substituting dates', () => {
  assert.throws(() => damStorySnapshot(day(), '2026-11-10', now), /not been posted/);
  assert.throws(() => damStorySnapshot(day(), '2026-11-08', now), /today or tomorrow/);
  assert.throws(() => damStorySnapshot(day(), '2026-11-11', now), /today or tomorrow/);
  for (const [instant, date] of [['2026-03-09T04:30:00Z', '2026-03-08'], ['2026-11-02T05:30:00Z', '2026-11-01']]) {
    const source = { ...day(), scheduleDate: date, retrievedAt: instant };
    assert.equal(damStorySnapshot(source, date, Date.parse(instant)).scheduleDate, date);
  }
});
const video = 'https://eddy.public.blob.vercel-storage.com/social-videos/dam.mp4';
const draft = {
  caption: 'Table Rock', platform: 'instagram', media_type: 'video', video_url: video, image_url: null,
  render_request: damStoryRender(DAM_STORY_FIXTURE, 'instagram'),
};

test('a checked dam draft delivers the saved video to its own destination only after review', () => {
  const checked = { ...DAM_STORY_FIXTURE, checkedAt: new Date(now).toISOString() };
  for (const platform of ['instagram', 'tiktok'] as const) {
    const post = { ...draft, platform, render_request: damStoryRender(DAM_STORY_FIXTURE, platform) };
    assert.throws(() => savedPostMedia(post), /owner approval/);
    assert.deepEqual(savedPostMedia(post, checked), {
      caption: 'Table Rock', mediaType: 'video', videoUrl: video,
      ...(platform === 'instagram' && { instagramPlacement: 'story' }),
    });
  }

  for (const patch of [
    { platform: 'facebook' }, { platform: 'tiktok' }, { video_url: null },
    { video_url: 'https://example.com/video.mp4' }, { media_type: 'image' },
    { render_request: { compositionId: 'social-dam-schedule' } },
    { render_request: { ...draft.render_request, inputProps: { ...draft.render_request.inputProps, sample: true } } },
  ]) assert.throws(() => savedPostMedia({ ...draft, ...patch }, checked), /Create a new dam video/);
  for (const patch of [{ scheduleDate: '2026-11-10' }, { minimumFlow: true }, { hours: Array(24).fill(false) }]) {
    assert.throws(() => savedPostMedia(draft, { ...checked, ...patch }), /schedule has changed/);
  }
});

test('Instagram Story and Reel submissions use their respective containers', async t => {
  const savedToken = process.env.META_PAGE_ACCESS_TOKEN;
  const savedAccount = process.env.META_INSTAGRAM_ACCOUNT_ID;
  process.env.META_PAGE_ACCESS_TOKEN = 'fixture';
  process.env.META_INSTAGRAM_ACCOUNT_ID = 'fixture-ig';
  try {
    const containers: URLSearchParams[] = [];
    let published = 0;
    t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
      if (url.endsWith('/media')) {
        containers.push(init?.body as URLSearchParams);
        return Response.json({ id: 'container' });
      }
      if (url.endsWith('/media_publish')) {
        assert.equal(JSON.parse(init?.body as string).creation_id, 'container');
        published++;
        return Response.json({ id: 'published' });
      }
      return Response.json({ status_code: 'FINISHED' });
    });
    const adapter = new InstagramAdapter();
    const media = savedPostMedia(draft, DAM_STORY_FIXTURE);
    assert.equal((await adapter.publishPost({ ...media, coverUrl: 'cover' })).success, true);
    assert.equal((await adapter.publishPost({ ...media, instagramPlacement: undefined, coverUrl: 'cover' })).success, true);
    assert.equal(published, 2);
    assert.equal(containers[0].get('media_type'), 'STORIES');
    assert.equal(containers[0].get('video_url'), video);
    assert.equal(containers[0].has('cover_url') || containers[0].has('caption'), false);
    assert.equal(containers[1].get('media_type'), 'REELS');
    assert.equal(containers[1].get('cover_url'), 'cover');
    assert.equal(containers[1].get('caption'), 'Table Rock');
  } finally {
    if (savedToken === undefined) delete process.env.META_PAGE_ACCESS_TOKEN; else process.env.META_PAGE_ACCESS_TOKEN = savedToken;
    if (savedAccount === undefined) delete process.env.META_INSTAGRAM_ACCOUNT_ID; else process.env.META_INSTAGRAM_ACCOUNT_ID = savedAccount;
  }
});

test('TikTok uses the chosen posting mode and preserves uncertain upload receipts', async t => {
  const savedKey = process.env.TIKTOK_CLIENT_KEY;
  const savedSecret = process.env.TIKTOK_CLIENT_SECRET;
  process.env.TIKTOK_CLIENT_KEY = 'fixture';
  process.env.TIKTOK_CLIENT_SECRET = 'fixture';
  const db = new FakeOutboxDb().seed('social_tokens', [{
    platform: 'tiktok', access_token: 'fixture', access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  }]);
  const paths: string[] = [];
  let responseStatus = 201;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url === video) return new Response('video bytes');
    if (url === 'https://fixture.invalid/upload') return new Response(null, { status: responseStatus });
    const path = new URL(url).pathname;
    paths.push(path);
    if (path.endsWith('/creator_info/query/')) return Response.json({ data: { privacy_level_options: ['SELF_ONLY'] } });
    return Response.json({ data: { publish_id: 'fixture-id', upload_url: 'https://fixture.invalid/upload' } });
  });
  try {
    assert.equal((await publishVideoToTikTok({ videoUrl: video }, db)).success, true);
    assert.equal((await publishVideoToTikTokDirect({ videoUrl: video, caption: 'Table Rock' }, db)).success, true);
    assert.deepEqual(paths, ['/v2/post/publish/inbox/video/init/', '/v2/post/publish/creator_info/query/', '/v2/post/publish/video/init/']);
    responseStatus = 503;
    const uncertain = await publishVideoToTikTok({ videoUrl: video }, db);
    assert.equal(uncertain.success, false);
    assert.equal(uncertain.ambiguous, true);
    assert.equal(uncertain.postId, 'fixture-id');
  } finally {
    if (savedKey === undefined) delete process.env.TIKTOK_CLIENT_KEY; else process.env.TIKTOK_CLIENT_KEY = savedKey;
    if (savedSecret === undefined) delete process.env.TIKTOK_CLIENT_SECRET; else process.env.TIKTOK_CLIENT_SECRET = savedSecret;
  }
});
