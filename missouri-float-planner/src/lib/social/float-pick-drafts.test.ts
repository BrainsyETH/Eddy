import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canAutoPublish, savedPostMedia } from './review';
import type { ScheduledPost, SocialPlatform } from './types';

type Row = Record<string, unknown>;
type Handler = (request: unknown) => Promise<Response>;

// Run the actual handlers with an in-memory database and recording platform
// adapters. No credentials, render dispatches, or external publication occur.
function harness(options: { dispatch?: boolean; skipInsert?: string } = {}) {
  const rows: Row[] = [];
  const publications: string[] = [];
  const renders: Row[] = [];
  let sequence = 0;
  const split = (input: string) => {
    let depth = 0;
    let start = 0;
    const parts: string[] = [];
    for (let i = 0; i < input.length; i++) {
      if (input[i] === '(') depth++;
      if (input[i] === ')') depth--;
      if (input[i] === ',' && depth === 0) { parts.push(input.slice(start, i)); start = i + 1; }
    }
    return [...parts, input.slice(start)];
  };
  const matches = (row: Row, expression: string): boolean => {
    if (expression.startsWith('and(')) return split(expression.slice(4, -1)).every(e => matches(row, e));
    const [field, op, ...rest] = expression.split('.');
    const value = rest.join('.');
    return op === 'in' ? value.slice(1, -1).split(',').includes(String(row[field]))
      : String(row[field]) === value;
  };
  const db = { from(table: string) {
    let operation = 'select';
    let values: Row = {};
    let single = false;
    const filters: Array<(r: Row) => boolean> = [];
    const q = {
      select() { return q; },
      insert(value: Row) { operation = 'insert'; values = value; return q; },
      update(value: Row) { operation = 'update'; values = value; return q; },
      delete() { operation = 'delete'; return q; },
      eq(key: string, value: unknown) { filters.push(r => r[key] === value); return q; },
      neq(key: string, value: unknown) { filters.push(r => r[key] !== value); return q; },
      in(key: string, value: unknown[]) { filters.push(r => value.includes(r[key])); return q; },
      or(value: string) { filters.push(r => split(value).some(e => matches(r, e))); return q; },
      lt(key: string, value: string | number) { filters.push(r => (r[key] as typeof value) < value); return q; },
      gte(key: string, value: string) { filters.push(r => String(r[key]) >= value); return q; },
      gt() { return q; }, is() { return q; }, order() { return q; }, limit() { return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      then(resolve: (value: unknown) => unknown) {
        if (operation === 'insert') {
          if (values.platform === options.skipInsert) return Promise.resolve(resolve({ data: null, error: { message: 'insert failed' } }));
          const row = { id: String(++sequence), created_at: new Date().toISOString(), auto_publish: true, ...values };
          rows.push(row);
          return Promise.resolve(resolve({ data: row, error: null }));
        }
        const selected = table === 'social_posts' ? rows.filter(r => filters.every(f => f(r))) : [];
        if (operation === 'update') selected.forEach(r => Object.assign(r, values));
        if (operation === 'delete') selected.forEach(r => rows.splice(rows.indexOf(r), 1));
        return Promise.resolve(resolve({ data: single ? selected[0] ?? null : selected, count: selected.length, error: null }));
      },
    };
    return q;
  } };
  const scheduled: ScheduledPost[] = [];
  const retryable: Row[] = [];
  const config = { posting_enabled: true, highlight_conditions: [], media_schedule: {
    section_guide: { tue: 'video' },
  }, section_guide: { time_cst: '07:00' } };
  const dependencies: Record<string, unknown> = {
    'next/server': { NextResponse: Response },
    '@/lib/admin/dashboard/job-run': { withJobRun: (_name: string, fn: Handler) => fn },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/admin-auth': { requireAdminAuth: () => null },
    '@/lib/security/machine-auth': { hasValidMachineBearer: () => true },
    '@/lib/social/post-scheduler': { getScheduledPosts: async () => ({ posts: scheduled, diagnostics: {} }), getRetryablePosts: async () => retryable },
    '@/lib/social/review': { canAutoPublish, savedPostMedia },
    '@/lib/social/adapters': { getAdapter: (platform: string) => ({ publishPost: async () => {
      publications.push(platform); return { success: true, delivery: platform === 'tiktok' ? 'inbox' : 'published' };
    } }) },
    '@/lib/social/video-renderer': { getCompositionForPost: () => ({ compositionId: 'social-route-portrait', inputProps: { route: 'saved-route' }, outputFilename: 'float.mp4' }),
      triggerVideoRender: async (request: Row) => { renders.push(request); return options.dispatch !== false; } },
    '@/lib/social/cron-lock': { tryCronLock: async () => true, releaseCronLock: async () => {} },
    '@/lib/social/post-context': { buildPostContext: async () => ({ renderData: {}, riverSlug: 'current',
      caption: () => ({ caption: 'A float', hashtags: [] }), imageUrl: () => 'https://example.test/cover.jpg' }) },
    './content-formatter': {}, './live-conditions': { overlayLiveConditions: async () => [] },
    './weekend-read': { weekendReadDue: () => false }, './tiktok-cap': {},
    '@shared/condition-system': {},
    './config-helpers': { getOrCreateConfig: async () => ({ data: config }) },
    './local-time': { getLocalDay: () => 2, getLocalMinutes: () => 420 },
    './holiday-weekends': { upcomingHolidayWeekend: () => null },
  };
  dependencies['./review'] = dependencies['@/lib/social/review'];
  dependencies['./post-context'] = dependencies['@/lib/social/post-context'];
  dependencies['./adapters'] = { getEnabledPlatforms: async () => ['facebook', 'instagram'] };
  function load(path: string) {
    const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports: Record<string, Handler> = {};
    runInNewContext(code, { exports, Response, URL, Date, process: { env: { CRON_SECRET: 'test' } },
      console: { log() {}, error() {} },
      require: (name: string) => { assert.ok(name in dependencies, `Unexpected import: ${name}`); return dependencies[name]; },
    });
    return exports;
  }
  const request = { headers: new Headers({ authorization: 'Bearer test' }), nextUrl: new URL('https://example.test/cron') };
  return { rows, publications, renders, scheduled, retryable, load,
    run: () => load('app/api/cron/post-social/route.ts').GET(request),
    callback: () => load('app/api/admin/social/video-callback/route.ts').POST({ ...request, json: async () => ({
      postIds: rows.map(r => r.id).join(','), status: 'rendered', videoUrl: 'https://example.test/video.mp4', audioVerified: true,
    }) }),
  };
}

function pick(platform: SocialPlatform, mediaType: 'video' | 'image' = 'video'): ScheduledPost {
  return { postType: 'section_guide', platform, riverSlug: 'current', caption: 'A float',
    imageUrl: 'https://example.test/cover.jpg', mediaType, hashtags: [], eddyUpdateId: null };
}

test('scheduled Float Picks share one render, hold Meta drafts, and deliver TikTok to its inbox', async () => {
  const h = harness();
  h.scheduled.push(pick('facebook'), pick('instagram'), pick('tiktok'));
  await h.run();
  assert.equal(h.renders.length, 1);
  assert.equal(h.rows.length, 3);
  assert.ok(h.rows.every(r => r.render_request));
  assert.deepEqual(h.rows.map(r => r.auto_publish), [false, false, true]);
  await h.callback();
  assert.deepEqual(h.rows.map(r => r.status), ['review', 'review', 'inbox']);
  assert.deepEqual(h.publications, ['tiktok']);
  await h.callback();
  assert.deepEqual(h.publications, ['tiktok'], 'callback retries must not publish drafts');
});

test('failed dispatch preserves Meta video drafts for rerender without an image publication', async () => {
  const h = harness({ dispatch: false, skipInsert: 'facebook' });
  h.scheduled.push(pick('facebook'), pick('instagram'));
  await h.run();
  assert.deepEqual(h.publications, []);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].platform, 'instagram');
  assert.equal(h.rows[0].status, 'failed');
  assert.equal(h.rows[0].auto_publish, false);
  assert.equal(h.rows[0].media_type, 'video');
  assert.ok(h.rows[0].render_request);
});

test('image Float Picks wait for review while another scheduled format still publishes', async () => {
  const h = harness();
  h.scheduled.push(pick('facebook', 'image'), pick('instagram', 'image'), { ...pick('facebook', 'image'), postType: 'daily_digest' });
  await h.run();
  assert.deepEqual(h.rows.map(r => r.status), ['review', 'review', 'published']);
  assert.deepEqual(h.publications, ['facebook']);
});

test('older automatic Float Picks are held at callback and cannot escape through cron retry', async () => {
  const h = harness();
  h.rows.push({ id: 'old', post_type: 'section_guide', platform: 'instagram', status: 'rendering', auto_publish: true });
  await h.callback();
  assert.equal(h.rows[0].status, 'review');
  assert.equal(h.rows[0].auto_publish, false);
  Object.assign(h.rows[0], { status: 'failed', auto_publish: true });
  h.retryable.push(h.rows[0]);
  await h.run();
  assert.deepEqual(h.publications, []);
});

test('review and failed drafts consume the daily slot with no TikTok connected', async () => {
  for (const status of ['review', 'failed']) {
    const h = harness();
    h.rows.push({ id: 'draft', post_type: 'section_guide', platform: 'instagram', status,
      auto_publish: false, created_at: new Date().toISOString() });
    const scheduler = h.load('lib/social/post-scheduler.ts');
    const result = await scheduler.getScheduledPosts(undefined) as unknown as { posts: ScheduledPost[] };
    assert.equal(result.posts.length, 0, `${status} draft must prevent another render`);
  }
  const h = harness();
  const scheduler = h.load('lib/social/post-scheduler.ts');
  const result = await scheduler.getScheduledPosts(undefined) as unknown as { posts: ScheduledPost[] };
  assert.equal(result.posts.length, 2);
  assert.ok(result.posts.every(p => p.autoPublish === false));
});

test('only explicit approval publishes a Meta Float Pick draft', async () => {
  const h = harness();
  h.rows.push({ id: 'draft', post_type: 'section_guide', platform: 'instagram', status: 'review',
    auto_publish: false, caption: 'A float', media_type: 'video', video_url: 'https://example.test/video.mp4' });
  const response = await h.load('app/api/admin/social/retry/route.ts').POST({ json: async () => ({ id: 'draft', action: 'approve' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(h.publications, ['instagram']);
  assert.equal(h.rows[0].status, 'published');
});
