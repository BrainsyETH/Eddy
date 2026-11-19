import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { forecastStorySnapshot, releaseStorySnapshot, damStorySnapshot, damStoryWindows, damStorySummary, damStoryRender, damStoryCaption, DAM_STORY_FIXTURE } from './social-dam-schedule';
import { savedPostMedia } from '../src/lib/social/review';
import { publishVideoToTikTok, publishVideoToTikTokDirect } from '../src/lib/social/tiktok-client';
import { FakeOutboxDb } from '../src/lib/alerts/fake-outbox-db';
import { InstagramAdapter } from '../src/lib/social/instagram-adapter';
import { damPostOptions, loadDamPost } from '../src/lib/social/dam-story';
import { hasPowerhouse, USACE_DAMS } from '../src/lib/flow-providers/usace-registry';
import { parseSchedulePage, SWPA_PROJECTS } from '../src/lib/usace/swpa';
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
test('the export keeps the posted MW and minimum-flow flags in hour-ending order', () => {
  const source = day([]);
  Object.assign(source.hours[0], { megawatts: 5, minimumFlow: true });
  source.hours[1].megawatts = 55;
  source.hours[2].megawatts = 115;
  source.hours.reverse();
  const snapshot = damStorySnapshot(source, source.scheduleDate, now, 230);
  assert.equal(snapshot.capacityMw, 230);
  assert.deepEqual(snapshot.hourlyMw.slice(0, 4), [5, 55, 115, 0]);
  assert.deepEqual(snapshot.hours.slice(0, 4), [false, true, true, false]);
  assert.deepEqual(damStoryWindows(snapshot.hours), ['1–3 AM']);
  assert.equal(damStorySnapshot(source, source.scheduleDate, now).capacityMw, null);
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
      ...(platform === 'instagram' && { placement: 'story' }),
    });
  }

  for (const patch of [
    { platform: 'facebook' }, { platform: 'tiktok' }, { video_url: null },
    { video_url: 'https://example.com/video.mp4' }, { media_type: 'image' },
    { render_request: { compositionId: 'social-dam-schedule' } },
    { render_request: { ...draft.render_request, inputProps: { ...draft.render_request.inputProps, sample: true } } },
  ]) assert.throws(() => savedPostMedia({ ...draft, ...patch }, checked), /Create a new dam video/);
  const revised = checked.hourlyMw.map((mw, i) => i === 12 ? mw + 1 : mw);
  for (const patch of [{ scheduleDate: '2026-11-10' }, { minimumFlow: true }, { hours: Array(24).fill(false) }, { capacityMw: 200 }, { hourlyMw: revised }]) {
    assert.throws(() => savedPostMedia(draft, { ...checked, ...patch }), /schedule has changed/);
  }
  const legacy = { ...draft.render_request, inputProps: { ...draft.render_request.inputProps, snapshot: { ...checked, hourlyMw: undefined, capacityMw: undefined } } };
  assert.throws(() => savedPostMedia({ ...draft, render_request: legacy }, checked), /Create a new dam video/);
});

test('the composer lists every registered powerhouse and rejects projects outside that list', async () => {
  assert.deepEqual(damPostOptions.map(d => d.id).sort(), Object.values(USACE_DAMS).filter(hasPowerhouse).map(d => d.id).sort());
  assert.equal(damPostOptions.filter(d => d.kind === 'schedule').length, 18);
  assert.equal(damPostOptions.filter(d => d.kind === 'forecast').length, 3);
  assert.deepEqual(damPostOptions.filter(d => d.kind === 'release').map(d => d.id), ['ameren-bagnell-dam']);
  for (const id of ['swl-clearwater-dam', 'toString', '']) await assert.rejects(loadDamPost(id), /powerhouse/);
  await assert.rejects(loadDamPost('ameren-bagnell-dam', '2026-11-10'), /latest measured/);
});

test('each of the 18 projects renders its own SWPA column and capacity', async t => {
  const source = readFileSync('src/lib/usace/__fixtures__/swpa-mon-2026-07-27.txt', 'utf8');
  const instant = Date.parse('2026-07-27T14:00:00Z');
  t.mock.method(Date, 'now', () => instant);
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    const monday = url.endsWith('/mon.htm');
    const body = monday ? source : source.replace('MONDAY JULY 27', 'TUESDAY JULY 28');
    return new Response(body, { headers: { Date: new Date(instant).toUTCString() } });
  });
  const sheet = parseSchedulePage(source)!;
  for (const option of damPostOptions.filter(d => d.kind === 'schedule')) {
    const snapshot = await loadDamPost(option.id, sheet.scheduleDate);
    assert.ok(snapshot.kind === 'schedule');
    const code = USACE_DAMS[option.id].swpaCode!;
    assert.equal(snapshot.dam?.id, option.id);
    assert.equal(snapshot.capacityMw, SWPA_PROJECTS[code].capacityMw);
    assert.deepEqual(snapshot.hourlyMw, sheet.projects[code].hours.map(hour => hour.megawatts));
    if (code === 'BSD') assert.ok(snapshot.minimumFlow);
  }
});

test('a non-Table Rock draft carries its identity through caption, filename and approval', () => {
  const dam = { id: 'swl-bull-shoals-dam', name: 'Bull Shoals Dam' };
  const snapshot = damStorySnapshot(day(), day().scheduleDate, now, 391, dam);
  assert.ok(damStoryCaption(snapshot).startsWith(dam.name));
  assert.ok(damStoryCaption(snapshot).endsWith('/' + dam.id));
  const render = damStoryRender(snapshot, 'instagram');
  assert.ok(render.outputFilename.startsWith(dam.id));
  const post = { ...draft, render_request: render };
  assert.ok(savedPostMedia(post, snapshot));
  assert.throws(() => savedPostMedia(post, { ...snapshot, dam: { id: 'swl-norfork-dam', name: 'Norfork Dam' } }), /dam or source/);
  // A legacy export with hourly bars belonged to Table Rock.
  const legacy = { ...snapshot };
  delete legacy.dam;
  delete legacy.kind;
  assert.throws(() => savedPostMedia({ ...draft, render_request: damStoryRender(legacy, 'instagram') }, snapshot), /dam or source/);
  assert.ok(savedPostMedia({ ...draft, render_request: damStoryRender(legacy, 'instagram') }, damStorySnapshot(day(), day().scheduleDate, now, 391)));
});

test('a generation forecast preserves gaps and requires a current plan at approval', () => {
  const dam = { id: 'lrn-wolf-creek-dam', name: 'Wolf Creek Dam' };
  const forecast = { source: 'U.S. Army Corps of Engineers, Nashville District', timeZone: 'America/Chicago',
    retrievedAt: day().retrievedAt!, windows: [
      { startUtc: '2026-11-09T16:00Z', endUtc: '2026-11-09T18:00Z', generating: true, peakCfs: 4000 },
      { startUtc: '2026-11-09T20:00Z', endUtc: '2026-11-09T21:00Z', generating: true, peakCfs: 5000 },
      { startUtc: '2026-11-10T06:00Z', endUtc: '2026-11-18T06:00Z', generating: false, peakCfs: null },
    ] };
  const snapshot = forecastStorySnapshot(dam, forecast, day().scheduleDate, now);
  assert.deepEqual(snapshot.windows, ['10 AM – 12 PM', '2 PM – 3 PM']);
  assert.doesNotMatch(damStoryCaption(snapshot), /SWPA|scheduled generation/i);
  assert.throws(() => forecastStorySnapshot(dam, { ...forecast, windows: forecast.windows.slice(0, 1) }, day().scheduleDate, now), /unavailable/);
  assert.throws(() => forecastStorySnapshot(dam, forecast, '2026-11-19', now), /for this date/);
  const idle = forecastStorySnapshot(dam, forecast, '2026-11-10', now);
  assert.equal(idle.generating, false);
  assert.deepEqual(idle.windows, ['all day']);
  const post = { ...draft, render_request: damStoryRender(snapshot, 'instagram') };
  assert.ok(savedPostMedia(post, snapshot));
  const firstHour = Object.keys(snapshot.hours!)[0];
  assert.throws(() => savedPostMedia(post, { ...snapshot, hours: { ...snapshot.hours, [firstHour]: false } }), /forecast has changed/);
  assert.throws(() => savedPostMedia(post, { ...snapshot, hours: {} }), /forecast has changed/);
});

test('an unrevised forecast is still approved later in the day, and a revised hour is not', () => {
  // The source trims its windows to the hour now running, so the same plan reads shorter all day.
  const dam = { id: 'lrn-wolf-creek-dam', name: 'Wolf Creek Dam' };
  const midnight = Date.parse('2026-11-09T06:00:00Z');
  const hour = 3_600_000;
  const at = (h: number) => new Date(midnight + h * hour).toISOString();
  const plan = (from: number, generation: [number, number] | null, checked: number) => {
    const on = (h: number) => !!generation && h >= generation[0] && h < generation[1];
    const windows = [];
    for (let h = from, end = h; h < 24 * 9; h = end) {
      while (end < 24 * 9 && on(end) === on(h)) end++;
      windows.push({ startUtc: at(h), endUtc: at(end), generating: on(h), peakCfs: on(h) ? 9000 : null });
    }
    return { source: 'U.S. Army Corps of Engineers, Nashville District', timeZone: 'America/Chicago', retrievedAt: new Date(checked).toISOString(), windows };
  };
  const read = (from: number, generation: [number, number] | null) => {
    const checked = midnight + from * hour + 300_000;
    return forecastStorySnapshot(dam, plan(from, generation, checked), '2026-11-09', checked);
  };
  for (const generation of [[12, 18], null] as ([number, number] | null)[]) {
    const made = read(7, generation);
    const post = { ...draft, render_request: damStoryRender(made, 'instagram') };
    for (const later of [9, 13, 20]) assert.ok(savedPostMedia(post, read(later, generation)));
  }
  assert.deepEqual([read(7, [12, 18]).windows, read(13, [12, 18]).windows], [['12 PM – 6 PM'], ['1 PM – 6 PM']]);
  assert.deepEqual([read(7, null).windows, read(9, null).windows], [['7 AM – midnight'], ['9 AM – midnight']]);
  const post = { ...draft, render_request: damStoryRender(read(7, [12, 18]), 'instagram') };
  for (const revised of [[12, 20], [14, 18], null] as ([number, number] | null)[]) {
    assert.throws(() => savedPostMedia(post, read(9, revised)), /forecast has changed/);
  }
  // A draft made before the hourly plan was saved is matched by its labels, as before.
  const legacy = read(7, [12, 18]);
  delete legacy.hours;
  const old = { ...draft, render_request: damStoryRender(legacy, 'instagram') };
  assert.ok(savedPostMedia(old, read(9, [12, 18])));
  assert.throws(() => savedPostMedia(old, read(13, [12, 18])), /forecast has changed/);
});

test('a release update uses fresh measured cfs, preserves missing hours and checks for revisions', () => {
  const dam = { id: 'ameren-bagnell-dam', name: 'Bagnell Dam' };
  const readings = [{ timestamp: now - 7_200_000, dischargeCfs: 0 }, { timestamp: now, dischargeCfs: 6500 }];
  const snapshot = releaseStorySnapshot(dam, readings, now);
  assert.deepEqual(snapshot.hourlyCfs.slice(-3), [0, null, 6500]);
  assert.match(damStoryCaption(snapshot), /Measured release: 6,500 cfs/);
  assert.doesNotMatch(damStoryCaption(snapshot), /generation schedule|SWPA/i);
  for (const time of [now + 3 * 3_600_000, now - 3_600_000]) assert.throws(() => releaseStorySnapshot(dam, readings, time), /unavailable/);
  const post = { ...draft, render_request: damStoryRender(snapshot, 'instagram') };
  assert.ok(savedPostMedia(post, snapshot));
  assert.throws(() => savedPostMedia(post, { ...snapshot, releaseCfs: 6510 }), /release has changed/);
  const nextHour = now + 3_600_000;
  const updated = releaseStorySnapshot(dam, [...readings, { timestamp: nextHour, dischargeCfs: 6500 }], nextHour);
  assert.throws(() => savedPostMedia(post, updated), /newer Ameren reading/);
  assert.ok(savedPostMedia({ ...post, render_request: damStoryRender(updated, 'instagram') }, updated));
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
    assert.equal((await adapter.publishPost({ ...media, placement: undefined, coverUrl: 'cover' })).success, true);
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
