import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { gaugeShareRedirect, gaugeRedirectPath } from './gauges/share-redirect';
import { createGaugeRedirectCache } from './gauges/redirect-cache';
import { loadSharedPlan, savedPlanLookupStatus } from './shared-plan-load';
import { sharedPlanMetadata } from './og/shared-plan-metadata';
import { linkPreviewResponse } from './og/link-preview-response';
import { linkPreviewFile, linkPreviewAsset, type LinkPreviewKind } from './og/link-preview';
import { generateMetadata as planMetadata } from '../app/plan/[shortCode]/layout';
import { generateImageMetadata as riverImageMetadata } from '../app/rivers/[state]/[slug]/opengraph-image';
import { generateImageMetadata as damImageMetadata } from '../app/dams/[damId]/opengraph-image';

// Exercise actual catalog reads in route tests, independent of warm instances.
const redirect = (url: string) => gaugeShareRedirect(new NextRequest(url), gaugeRedirectPath);

let databaseFixture = 0;

function publicDatabase(t: TestContext, respond: (url: URL, init?: RequestInit) => Response) {
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: `https://sharing-test-${++databaseFixture}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-only-key' })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  return t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) =>
    respond(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url), init));
}

test('gauge shares return a temporary HTTP 307 to the canonical river, preserving the query', async t => {
  const requests: URL[] = [];
  publicDatabase(t, (url, init) => {
    requests.push(url);
    assert.ok(init?.signal, 'routing queries have a deadline');
    if (url.pathname.endsWith('/gauge_stations')) return Response.json([{ id: 'station-1' }]);
    assert.equal(url.searchParams.get('is_primary'), 'eq.true');
    assert.equal(url.searchParams.get('rivers.active'), 'eq.true');
    return Response.json([{ rivers: { slug: 'current', state: 'MO', active: true } }]);
  });
  const response = await redirect('https://eddy.guide/gauges/07067000?from=friend');
  assert.equal(response?.status, 307);
  assert.equal(response?.headers.get('cache-control'), 'no-store');
  assert.equal(response?.headers.get('location'), 'https://eddy.guide/rivers/missouri/current?from=friend');
  assert.equal(await response?.text(), '', 'no HTML meta refresh');
  assert.equal(requests.length, 2);
});

test('legacy river-slug gauges redirect directly to the state-qualified route', async t => {
  publicDatabase(t, () => Response.json([{ slug: 'buffalo', state: 'AR' }]));
  const response = await redirect('https://eddy.guide/gauges/buffalo');
  assert.equal(response?.headers.get('location'), 'https://eddy.guide/rivers/arkansas/buffalo');
});

test('orphan gauges remain readable and image/index routes never run redirect queries', async t => {
  const fetch = publicDatabase(t, () => Response.json([]));
  const response = await redirect('https://eddy.guide/gauges/12345678');
  assert.equal(response?.headers.get('x-middleware-next'), '1');
  for (const path of ['/gauges', '/gauges/12345678/opengraph-image', '/gauges/12345678/twitter-image', '/api/gauges/12345678']) {
    assert.equal(await redirect(`https://eddy.guide${path}`), null);
  }
  assert.equal(fetch.mock.callCount(), 1);
});

test('a routing database outage returns retryable 503 rather than a wrong destination', async t => {
  publicDatabase(t, () => Response.json({ message: 'unavailable' }, { status: 503 }));
  const response = await redirect('https://eddy.guide/gauges/07067000');
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get('location'), null);
  assert.equal(response?.headers.get('cache-control'), 'no-store');
  assert.equal(response?.headers.get('retry-after'), '30');
});

test('a missing plan, RPC failure and malformed response are distinct', () => {
  assert.equal(savedPlanLookupStatus([], null), 404);
  assert.equal(savedPlanLookupStatus(null, { message: 'timeout' }), 503);
  assert.equal(savedPlanLookupStatus([], { message: 'timeout' }), 503);
  assert.equal(savedPlanLookupStatus(null, null), 503);
  assert.equal(savedPlanLookupStatus([{ short_code: 'abc123' }], null), 200);
});

test('the recipient can distinguish 404, offline, server failure and successful retry', async () => {
  const signal = new AbortController().signal;
  const run = (status: number, body: unknown) => loadSharedPlan('abc123', signal, async () => Response.json(body, { status }));
  assert.deepEqual(await run(404, {}), { kind: 'not-found' });
  assert.deepEqual(await run(503, {}), { kind: 'unavailable' });
  assert.deepEqual(await run(200, {}), { kind: 'unavailable' });
  assert.deepEqual(await loadSharedPlan('abc123', signal, async () => { throw new TypeError('offline'); }), { kind: 'unavailable' });
  const plan = { river: { name: 'Current River' } };
  assert.deepEqual(await run(200, { plan }), { kind: 'loaded', plan });
});

test('saved-plan metadata identifies the route without republishing a saved safety verdict', () => {
  const metadata = sharedPlanMetadata('abc123', {
    river: 'Current River', putIn: 'Akers', takeOut: 'Pulltite', distance_miles: '10.2',
    estimated_float_min_minutes: 240, estimated_float_max_minutes: 360,
  });
  assert.equal(metadata.openGraph?.title, 'Akers → Pulltite · Current River');
  assert.equal(metadata.twitter?.title, metadata.openGraph?.title);
  assert.match(metadata.description!, /10.2 miles/);
  assert.match(metadata.description!, /estimated when saved/);
  assert.match(metadata.description!, /Open for current conditions/);
  assert.doesNotMatch(metadata.description!, /Live|Good|Floatable|Currently/);
  assert.equal(metadata.openGraph?.url, 'https://eddy.guide/plan/abc123');
  assert.equal(metadata.alternates?.canonical, 'https://eddy.guide/plan/abc123');
  assert.match(String(metadata.other?.['apple-itunes-app']), /eddy:\/\/\/float\/abc123/);
});

test('missing plans are noindex; temporary metadata errors never claim missing or expiry', () => {
  const missing = sharedPlanMetadata('abc123', 'not-found');
  assert.deepEqual(missing.robots, { index: false });
  const temporary = sharedPlanMetadata('abc123', 'unavailable');
  assert.equal(temporary.robots, undefined);
  assert.match(String(temporary.title), /temporarily unavailable/);
  assert.doesNotMatch(temporary.description!, /not found|expired/i);
});

test('metadata resolves the actual shortCode without incrementing views or exposing private fields', async t => {
  publicDatabase(t, (url, init) => {
    if (url.pathname.endsWith('/rpc/get_float_plan_by_code')) {
      assert.deepEqual(JSON.parse(String(init?.body)), { p_short_code: 'realCode', p_increment_view: false });
      return Response.json([{ river_id: 'internal-river', start_access_id: 'internal-start', end_access_id: 'internal-end',
        user_id: 'private-account', condition_at_creation: 'good', notes: 'private notes', distance_miles: 10 }]);
    }
    if (url.pathname.endsWith('/rivers')) return Response.json({ name: 'Current River' });
    return Response.json({ name: url.searchParams.get('id') === 'eq.internal-start' ? 'Akers' : 'Pulltite' });
  });
  const metadata = await planMetadata({ params: Promise.resolve({ shortCode: 'realCode' }), children: null });
  assert.equal(metadata.openGraph?.title, 'Akers → Pulltite · Current River');
  assert.doesNotMatch(JSON.stringify(metadata), /internal-|private-|private notes|good/);
});

test('a metadata RPC outage yields a retry message rather than Plan Not Found', async t => {
  publicDatabase(t, () => Response.json({ message: 'database unavailable' }, { status: 503 }));
  const metadata = await planMetadata({ params: Promise.resolve({ shortCode: 'realCode' }), children: null });
  assert.equal(metadata.title, 'Float plan temporarily unavailable');
});

test('every published image decodes at 1200×630 and stays under 200KB without any network', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('image generation must be offline'); });
  const examples: [LinkPreviewKind, string?][] = [['river', 'current'], ['river', 'unknown'], ['gauge'], ['dam', 'ameren-bagnell-dam'], ['dam', 'unknown'], ['access'], ['plan']];
  for (const [kind, slug] of examples) {
    const response = await linkPreviewResponse(kind, slug);
    const bytes = Buffer.from(await response.arrayBuffer());
    const dimensions = await sharp(bytes).metadata();
    const asset = linkPreviewAsset(kind, slug);
    assert.equal(response.headers.get('content-type'), asset.contentType);
    assert.equal(dimensions.format, asset.contentType === 'image/jpeg' ? 'jpeg' : 'png');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=86400, s-maxage=86400');
    assert.equal(dimensions.width, 1200);
    assert.equal(dimensions.height, 630);
    assert.ok(bytes.length < 200_000, `${kind}/${slug} exceeds image budget`);
    assert.deepEqual(bytes, await readFile(`public/share/${linkPreviewFile(kind, slug)}`));
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('an unknown place never borrows another named location’s photograph', () => {
  assert.equal(linkPreviewFile('river', 'jacks-fork'), 'river-v1.png');
  assert.equal(linkPreviewFile('dam', 'table-rock'), 'dam-v1.png');
  assert.equal(linkPreviewFile('access', 'akers'), 'access-v1.png');
  assert.equal(linkPreviewFile('river', 'constructor'), 'river-v1.png');
});

test('image metadata describes the selected photograph or illustration with its actual MIME type', async () => {
  for (const [slug, photo] of [['current', true], ['jacks-fork', false]] as const) {
    const [metadata] = await riverImageMetadata({ params: Promise.resolve({ slug }) });
    assert.match(metadata.alt, photo ? /red canoe beside the Current River/ : /illustration of a river/);
    assert.equal(metadata.contentType, photo ? 'image/jpeg' : 'image/png');
    assert.doesNotMatch(metadata.alt, / or /);
  }
  for (const [damId, photo] of [['ameren-bagnell-dam', true], ['table-rock', false]] as const) {
    const [metadata] = await damImageMetadata({ params: Promise.resolve({ damId }) });
    assert.match(metadata.alt, photo ? /aerial photograph of Bagnell Dam/ : /illustration of a dam/);
    assert.equal(metadata.contentType, photo ? 'image/jpeg' : 'image/png');
  }
});

test('redirect cache coalesces concurrent reads and refreshes changed mappings at the TTL', async () => {
  let clock = 0;
  let calls = 0;
  let destination = '/rivers/missouri/current';
  const cached = createGaugeRedirectCache(async () => { calls++; return destination; }, { ttlMs: 100, now: () => clock });
  assert.deepEqual(await Promise.all([cached('1'), cached('1')]), [destination, destination]);
  assert.equal(calls, 1);
  destination = '/rivers/missouri/jacks-fork';
  clock = 99;
  assert.equal(await cached('1'), '/rivers/missouri/current');
  clock = 100;
  assert.equal(await cached('1'), destination);
  assert.equal(calls, 2);
});

test('redirect cache bounds entries, caches orphan results, and never retains errors', async () => {
  const calls: string[] = [];
  let unavailable = true;
  const cached = createGaugeRedirectCache(async slug => {
    calls.push(slug);
    if (slug === 'error' && unavailable) throw new Error('offline');
    return null;
  }, { maxEntries: 2 });
  await cached('a'); await cached('b'); await cached('a'); await cached('c'); await cached('b');
  assert.deepEqual(calls, ['a', 'b', 'c', 'b']);
  await assert.rejects(cached('error'), /offline/);
  unavailable = false;
  assert.equal(await cached('error'), null);
  assert.equal(calls.filter(slug => slug === 'error').length, 2);
});
