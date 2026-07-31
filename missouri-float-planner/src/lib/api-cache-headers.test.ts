import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cdnCacheHeaders, parseRowLimit, privateNoStore } from './api-utils';

const API = join(process.cwd(), 'src/app/api');
const read = (p: string) => readFileSync(join(API, p), 'utf8');

test('cdnCacheHeaders marks responses shared-cacheable', () => {
  const value = cdnCacheHeaders(300, 3600)['Cache-Control'];
  // `public` matters: without it some shared caches decline to store a response
  // they would otherwise have been allowed to. s-maxage alone mostly works on
  // Vercel, which is why the hand-rolled headers this replaced went unnoticed.
  assert.match(value, /\bpublic\b/);
  assert.match(value, /s-maxage=300\b/);
  // stale-while-revalidate is what stops every client stampeding the origin at
  // the moment the window expires.
  assert.match(value, /stale-while-revalidate=3600\b/);
});

test('privateNoStore is the inverse and names both directives', () => {
  const value = privateNoStore()['Cache-Control'];
  assert.match(value, /\bprivate\b/);
  assert.match(value, /\bno-store\b/);
  assert.doesNotMatch(value, /\bpublic\b/);
  assert.doesNotMatch(value, /s-maxage/);
});

// ── the contract, enforced against the routes themselves ─────────

const ME_ROUTES = [
  'me/profile/route.ts',
  'me/starred-rivers/route.ts',
  'me/alert-subscriptions/route.ts',
  'me/device-tokens/route.ts',
  // Holds an Apple refresh token in flight. A shared cache storing this
  // response would be caching a credential exchange.
  'me/apple-token/route.ts',
];

test('no /api/me route answers with a bare NextResponse.json', () => {
  // A response with NO Cache-Control is eligible for heuristic caching under
  // RFC 9111 — a shared cache may store it and invent a freshness lifetime. For
  // a route whose body differs per caller that is a cross-user leak, so
  // "no header" is not the same as "do not cache". Every response in these
  // files must go through jsonPrivate.
  for (const route of ME_ROUTES) {
    const src = read(route);
    const bare = src.match(/NextResponse\.json\(/g) ?? [];
    assert.equal(
      bare.length,
      0,
      `${route} returns ${bare.length} response(s) without privateNoStore — use jsonPrivate`,
    );
    assert.ok(src.includes('jsonPrivate'), `${route} should import jsonPrivate`);
  }
});

test('no /api/me route is ever CDN-cached', () => {
  for (const route of ME_ROUTES) {
    const src = read(route);
    assert.ok(
      !src.includes('cdnCacheHeaders'),
      `${route} must never be shared-cacheable — its body is per-user`,
    );
  }
});

test('every /api/me route rate-limits on the user, not the IP', () => {
  // Per-IP is actively wrong for a mobile app: carrier NAT collapses thousands
  // of subscribers into one bucket, so one misbehaving client would throttle a
  // whole network.
  for (const route of ME_ROUTES) {
    const src = read(route);
    assert.ok(src.includes('rateLimit('), `${route} has no rate limit`);
    assert.ok(
      src.includes('${user.id}'),
      `${route} rate-limits on something other than user.id`,
    );
    assert.ok(
      !src.includes('getClientIp'),
      `${route} rate-limits per IP; carrier NAT makes that wrong here`,
    );
  }
});

test('public read routes the app depends on are shared-cacheable', () => {
  // These four are what an iOS client hits on launch and on every river tap.
  // /api/rivers/[slug] alone returns a several-hundred-point LineString, so an
  // uncached one is the difference between a CDN hit and a PostGIS query.
  const PUBLIC = [
    'rivers/route.ts',
    'rivers/[slug]/route.ts',
    'rivers/[slug]/access-points/route.ts',
    'alerts/route.ts',
    'app-config/route.ts',
    'gauge-thresholds/route.ts',
    'gauges/count/route.ts',
    'plan/campgrounds/route.ts',
  ];
  for (const route of PUBLIC) {
    assert.ok(
      read(route).includes('cdnCacheHeaders'),
      `${route} serves public data with no CDN caching`,
    );
  }
});

test('the gauge corpus count fails open and keeps its long cache window', () => {
  const src = read('gauges/count/route.ts');
  assert.ok(src.includes('count: null'));
  assert.ok(src.includes('cdnCacheHeaders(3600, 86400)'));
  assert.ok(!src.includes('status: 500'));
});

test('USGS proxies go through the shared helper', () => {
  // They previously hand-rolled the same header string six different times and
  // all six omitted `public`. Freshness is unchanged; the definition is now
  // in one place.
  const USGS = [
    'usgs/mo-dataset/route.ts',
    'usgs/mo-forecast/route.ts',
    'usgs/mo-history/route.ts',
    'usgs/mo-history-bundle/route.ts',
    'usgs/mo-sites/route.ts',
    'usgs/mo-statewide/route.ts',
  ];
  for (const route of USGS) {
    const src = read(route);
    assert.ok(src.includes('cdnCacheHeaders'), `${route} should use cdnCacheHeaders`);
    assert.ok(
      !/'Cache-Control':\s*'s-maxage/.test(src),
      `${route} still hand-rolls a Cache-Control string`,
    );
  }
});

// ── parseRowLimit ──────────────────────────────────────────────────────────
// Same story as the header helper above: one expression, copied into every
// route that pages, wrong in one case in all of them.

test('a negative limit means "no limit given", not one row', () => {
  // THE BUG. `Math.min(MAX, Math.max(1, parseInt(raw) || DEFAULT))` reads as
  // "junk falls back to the default", and for a missing or unparseable value it
  // does — parseInt('') is NaN, which is falsy. But parseInt('-5') is -5, which
  // is TRUTHY, so the fallback never ran and Math.max(1, -5) clamped to 1.
  //
  // Both routes using this order by size — gauges by discharge, public land by
  // acreage — so `?limit=-5` drew the single largest feature in the viewport
  // and reported `capped: true` over a total in the thousands.
  assert.equal(parseRowLimit('-5', 300, 1000), 300);
  assert.equal(parseRowLimit('0', 300, 1000), 300);
  assert.equal(parseRowLimit('-1', 400, 1000), 400);
});

test('an absent or unparseable limit falls back to the default', () => {
  for (const raw of [null, undefined, '', '   ', 'lots', 'NaN']) {
    assert.equal(parseRowLimit(raw, 300, 1000), 300, `parseRowLimit(${JSON.stringify(raw)})`);
  }
});

test('a real limit is honoured and clamped to the ceiling', () => {
  assert.equal(parseRowLimit('50', 300, 1000), 50);
  assert.equal(parseRowLimit('1000', 300, 1000), 1000);
  // The ceiling is what stops a caller pulling a whole table through the API.
  assert.equal(parseRowLimit('99999', 300, 1000), 1000);
});

test('the viewport routes use the shared helper rather than the old expression', () => {
  // Both are public, both page, and both had the hole. Written as a source
  // check for the same reason the cdnCacheHeaders tests above are: the
  // regression is someone hand-rolling it again in the next route.
  for (const route of ['gauges/map/route.ts', 'public-lands/route.ts']) {
    const src = read(route);
    assert.ok(
      !/Math\.max\(1,\s*parseInt/.test(src),
      `${route} still hand-rolls the limit clamp that mishandles a negative value`,
    );
  }
});
