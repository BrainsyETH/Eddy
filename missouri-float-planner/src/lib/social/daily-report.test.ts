import { POST_TYPES } from './post-types';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { FakeOutboxDb } from '../alerts/fake-outbox-db';
import * as reportHelpers from './daily-report';
import * as outcomes from './publish-outcome';
import { hasValidMachineBearer } from '../security/machine-auth';
import assert from 'node:assert/strict';
import test from 'node:test';
import { reportFixture, reportRiver, reportDam, REPORT_FIXTURE_NOW as now } from '../../../scripts/fixtures/daily-report';
import { riverReportSlide, damReportSlide, rotateReportKeys, reportImageUrls, dailyReportStamp } from './daily-report';
import { savedPostMedia } from './review';
import { publishCarousel } from './meta-client';
import { InstagramAdapter } from './instagram-adapter';
import { FacebookAdapter } from './facebook-adapter';

test('river slides preserve the actual chart and reject stale, suspect, and missing data', () => {
  const slide = riverReportSlide(reportRiver, now)!;
  assert.equal(slide.kind, 'river');
  if (slide.kind !== 'river') throw new Error('Wrong widget');
  assert.equal(slide.data.chart, reportRiver.chart);
  assert.equal(slide.data.take, null);
  assert.match(slide.takeaway, /past 24 hours/);
  assert.equal(riverReportSlide({ ...reportRiver, chart: null }, now), null);
  assert.equal(riverReportSlide(reportRiver, now + 4 * 3_600_000), null);
  assert.equal(riverReportSlide({ ...reportRiver, primary: { ...reportRiver.primary!, readingSuspect: true } }, now), null);
});

test('dam slides distinguish a posted zero from missing hours and stale schedules', () => {
  const data = structuredClone(reportDam);
  assert.match(damReportSlide(data, now)!.takeaway, /8 hours today/);
  data.dam.schedule[0].hours.forEach(h => { h.megawatts = 0; });
  assert.match(damReportSlide(data, now)!.takeaway, /does not mean there is no water release/);
  data.dam.schedule[0].hours.pop();
  assert.match(damReportSlide(data, now)!.takeaway, /Some schedule hours are unavailable/);
  assert.equal(damReportSlide(data, now + 2 * 3_600_000), null);
});

test('daily rotation is stable across UTC midnight and gives every place equal turns', () => {
  const keys = ['a', 'b', 'c', 'd'];
  assert.deepEqual(rotateReportKeys(keys, Date.parse('2026-11-10T23:00Z')), rotateReportKeys(keys, Date.parse('2026-11-11T02:00Z')));
  assert.equal(new Set(keys.map((_, i) => rotateReportKeys([...keys, 'a'], now + i * 86_400_000)[0])).size, 4);
  assert.match(dailyReportStamp(new Date(now).toISOString()), /9:30 AM CT/);
});

const urls = [1, 2].map(i => `https://fixture.public.blob.vercel-storage.com/daily-reports/id/slide-${i}.jpg`);
test('review and retry require every captured image and refuse old reports', () => {
  const report = { ...reportFixture, capturedAt: new Date().toISOString(), imageUrls: urls };
  const post = { caption: 'Daily report', media_type: 'image', image_url: urls[0], video_url: null, render_request: report };
  assert.deepEqual(savedPostMedia(post).imageUrls, urls);
  assert.equal(savedPostMedia(post).imageUrl, undefined, 'cover is not a delivery fallback');
  assert.throws(() => savedPostMedia({ ...post, render_request: { ...report, imageUrls: urls.slice(0, 1) } }), /incomplete/);
  assert.throws(() => savedPostMedia({ ...post, render_request: { ...report, capturedAt: '2020-01-01T00:00:00Z' } }), /out of date/);
  assert.equal(reportImageUrls({ ...report, imageUrls: [urls[0], urls[0]] }), null);
  assert.equal(reportImageUrls({ ...report, imageUrls: ['https://example.com/a.jpg', urls[1]] }), null);
});

test('Instagram publishes an ordered carousel parent; Facebook attaches every photo', async t => {
  const env = { META_PAGE_ACCESS_TOKEN: process.env.META_PAGE_ACCESS_TOKEN, META_PAGE_ID: process.env.META_PAGE_ID, META_INSTAGRAM_ACCOUNT_ID: process.env.META_INSTAGRAM_ACCOUNT_ID };
  Object.assign(process.env, { META_PAGE_ACCESS_TOKEN: 'fixture-token', META_PAGE_ID: 'fb', META_INSTAGRAM_ACCOUNT_ID: 'ig' });
  try {
    const calls: { url: string; body: URLSearchParams }[] = [];
    t.mock.method(globalThis, 'fetch', async (url: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
      if (!init?.method) return Response.json({ status_code: 'FINISHED' });
      const body = new URLSearchParams(init.body as string);
      calls.push({ url: String(url), body });
      return Response.json({ id: `id${calls.length}` });
    });
    let attempt = '';
    assert.equal((await new InstagramAdapter().publishPost({ caption: 'Report', imageUrls: urls, onProviderAttempt: id => { attempt = id; } })).success, true);
    assert.deepEqual(calls.slice(0, 2).map(c => c.body.get('image_url')), urls);
    assert.ok(calls.slice(0, 2).every(c => c.body.get('is_carousel_item') === 'true'));
    assert.equal(calls[2].body.get('media_type'), 'CAROUSEL');
    assert.equal(calls[2].body.get('children'), 'id1,id2');
    assert.equal(attempt, 'id3');
    assert.equal(calls[3].body.get('creation_id'), attempt);
    calls.length = 0;
    assert.equal((await new FacebookAdapter().publishPost({ caption: 'Report', imageUrls: urls })).success, true);
    assert.ok(calls.slice(0, 2).every(c => c.body.get('published') === 'false'));
    assert.deepEqual(calls.slice(0, 2).map(c => c.body.get('url')), urls);
    assert.equal(calls[2].body.get('attached_media[0]'), JSON.stringify({ media_fbid: 'id1' }));
    assert.equal(calls[2].body.get('attached_media[1]'), JSON.stringify({ media_fbid: 'id2' }));
  } finally {
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('partial carousel preparation never publishes, and final timeouts remain ambiguous', async t => {
  const saved = { ...process.env };
  Object.assign(process.env, { META_PAGE_ACCESS_TOKEN: 'fixture', META_PAGE_ID: 'fb', META_INSTAGRAM_ACCOUNT_ID: 'ig' });
  try {
    let calls = 0;
    const fetch = t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return calls === 2 ? Response.json({ error: { message: 'bad image' } }, { status: 400 }) : Response.json({ id: 'photo' });
    });
    const failed = await publishCarousel({ platform: 'facebook', caption: 'Report', imageUrls: urls });
    assert.equal(failed.success, false);
    assert.equal(calls, 2, 'no feed call after a child fails');
    fetch.mock.mockImplementation(async (url: Parameters<typeof globalThis.fetch>[0]) => {
      if (String(url).endsWith('/feed')) throw new Error('timeout after acceptance');
      return Response.json({ id: 'photo' });
    });
    assert.equal((await publishCarousel({ platform: 'facebook', caption: 'Report', imageUrls: urls })).ambiguous, true);
    assert.equal((await new InstagramAdapter().publishPost({ caption: 'Report', imageUrls: [urls[0]], imageUrl: urls[0] })).success, false);
  } finally {
    for (const key of ['META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID', 'META_INSTAGRAM_ACCOUNT_ID']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});

function callbackHarness(autoPublish: boolean) {
  const id = '11111111-1111-4111-8111-111111111111';
  const report = { ...reportFixture, capturedAt: new Date().toISOString() };
  const db = new FakeOutboxDb(report.capturedAt).seed('social_posts', [{ id, post_type: 'daily_digest', media_type: 'image', platform: 'instagram', status: 'rendering', auto_publish: autoPublish, caption: 'Report', image_url: null, video_url: null, render_request: report }]);
  let publishes = 0;
  const exported: { POST?: (r: NextRequest) => Promise<NextResponse> } = {};
  const source = readFileSync(new URL('../../app/api/admin/social/carousel-callback/route.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: exported, process: { env: { CRON_SECRET: 'fixture' } }, console, Date, JSON,
    require: (name: string) => {
      const modules: Record<string, unknown> = {
        'next/server': { NextResponse }, '@/lib/supabase/admin': { createAdminClient: () => db },
        '@/lib/security/machine-auth': { hasValidMachineBearer }, '@/lib/social/daily-report': reportHelpers,
        '@/lib/social/review': { savedPostMedia }, '@/lib/social/publish-outcome': outcomes,
        '@/lib/social/adapters': { getAdapter: () => ({ publishPost: async () => { publishes++; return { success: true, platformPostId: 'published-id' }; } }) },
      };
      assert(name in modules, `Unexpected dependency ${name}`); return modules[name];
    },
  });
  const send = (body = {}, token = 'fixture') => exported.POST!(new NextRequest('https://eddy.guide/api/admin/social/carousel-callback', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ postIds: id, status: 'rendered', capturedAt: report.capturedAt, imageUrls: urls, ...body }) }));
  return { db, send, publishes: () => publishes };
}

test('render callback keeps manual carousels in review and never publishes a duplicate', async () => {
  const manual = callbackHarness(false);
  assert.equal((await manual.send()).status, 200);
  assert.equal(manual.db.rows('social_posts')[0].status, 'review');
  assert.equal(manual.publishes(), 0);
  const scheduled = callbackHarness(true);
  assert.equal((await scheduled.send()).status, 200);
  assert.equal((await scheduled.send()).status, 200);
  assert.equal(scheduled.publishes(), 1);
  assert.equal(scheduled.db.rows('social_posts')[0].status, 'published');
});

test('callback rejects missing images, wrong snapshots, unauthenticated calls and failed receipts', async () => {
  const h = callbackHarness(true);
  assert.equal((await h.send({}, 'wrong')).status, 401);
  assert.equal((await h.send({ imageUrls: urls.slice(0, 1) })).status, 400);
  assert.equal((await h.send({ capturedAt: '2000-01-01T00:00:00Z' })).status, 400);
  assert.equal(h.publishes(), 0);
  h.db.fail({ table: 'social_posts', mode: 'update', times: 1 });
  assert.equal((await h.send()).status, 500);
  assert.equal(h.publishes(), 0);
  assert.equal(h.db.rows('social_posts')[0].status, 'rendering');
  assert.equal((await h.send({ status: 'failed' })).status, 200);
  assert.equal(h.db.rows('social_posts')[0].status, 'failed');
});

test('Daily Report uses image output while Weekend Forecast retains its reel', () => {
  assert.deepEqual(POST_TYPES.daily_digest.media, ['image']);
  assert.equal(POST_TYPES.daily_digest.composition, undefined);
  assert.equal(POST_TYPES.weekly_forecast.composition, 'social-digest-portrait');
});
