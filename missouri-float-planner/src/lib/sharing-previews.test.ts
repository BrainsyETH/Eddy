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
import { generateImageMetadata as guideImageMetadata } from '../app/blog/[slug]/opengraph-image';
import { guideCard, GENERIC_GUIDE_CARD } from './og/guide-card';
import { publicPageMetadata, ROUTE_SHARE_IMAGE, SHARE_IMAGES } from './seo';

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
    assert.match(metadata.alt, photo ? /red kayak beside the Current River/ : /illustration of a river/);
    assert.equal(metadata.contentType, photo ? 'image/jpeg' : 'image/png');
    assert.doesNotMatch(metadata.alt, / or /);
  }
  for (const [damId, photo] of [['ameren-bagnell-dam', true], ['table-rock', false]] as const) {
    const [metadata] = await damImageMetadata({ params: Promise.resolve({ damId }) });
    assert.match(metadata.alt, photo ? /aerial photograph of Bagnell Dam/ : /illustration of a dam/);
    assert.equal(metadata.contentType, photo ? 'image/jpeg' : 'image/png');
  }
});

// ── The guide card names its guide ────────────────────────────────────────
// Next refuses a no-store fetch while it renders an ISR route, and supabase-js
// returns that refusal as `error`. Read that way, every guide's card silently
// fell back to "Float Trip Guide" and Facebook scraped it as the preview.
test('the guide card reads its title through the cacheable public client', async t => {
  const fetch = publicDatabase(t, (url, init) => {
    assert.equal(url.pathname, '/rest/v1/blog_posts');
    assert.equal(url.searchParams.get('slug'), 'eq.caddo-river-float-trips-arkansas');
    assert.equal(url.searchParams.get('status'), 'eq.published');
    assert.equal(init?.cache, 'force-cache', 'a no-store read is refused inside an ISR image route');
    assert.equal(new Headers(init?.headers).get('apikey'), 'test-only-key', 'public RLS, not the service role');
    return Response.json([{ title: 'Caddo River Float Trip Guide: Caddo Gap & Glenwood', category: 'River Guides' }]);
  });
  assert.deepEqual(await guideCard('caddo-river-float-trips-arkansas'),
    { title: 'Caddo River Float Trip Guide: Caddo Gap & Glenwood', eyebrow: 'River Guide' });
  const [metadata] = await guideImageMetadata({ params: Promise.resolve({ slug: 'caddo-river-float-trips-arkansas' }) });
  assert.equal(metadata.alt, 'Eddy guide title card: Caddo River Float Trip Guide: Caddo Gap & Glenwood');
  assert.equal(fetch.mock.callCount(), 2);
});

test('a failed guide lookup throws instead of publishing the generic card', async t => {
  publicDatabase(t, () => Response.json({ message: 'unavailable' }, { status: 503 }));
  await assert.rejects(guideCard('caddo-river-float-trips-arkansas'), /Guide card lookup failed/);
  // The page's own metadata calls this; it loses the title, not the page.
  const [metadata] = await guideImageMetadata({ params: Promise.resolve({ slug: 'caddo-river-float-trips-arkansas' }) });
  assert.equal(metadata.alt, 'Eddy guide title card');
});

test('a slug with no published guide is the only case that gets the generic card', async t => {
  publicDatabase(t, () => Response.json([]));
  assert.equal(await guideCard('not-a-guide'), null);
  assert.equal(GENERIC_GUIDE_CARD.title, 'Float Trip Guide');
});

test('a long guide title is cut at a word boundary the card can fit', async t => {
  const title = 'Spring River (Arkansas) Float Trip Guide: Mammoth Spring, Hardy, Many Islands & Day Floats';
  publicDatabase(t, () => Response.json([{ title, category: 'Field Notes' }]));
  const card = await guideCard('long');
  assert.ok(card!.title.length <= 76 && card!.title.endsWith('…'));
  assert.equal(card!.eyebrow, 'Field Notes', 'an unmapped category is its own kicker');
});

test('no link-image route reads the database with a client Next refuses during ISR', async () => {
  const { readdir } = await import('node:fs/promises');
  const images = (await readdir('src/app', { recursive: true }))
    .filter(entry => /(^|\/)(opengraph|twitter)-image\.tsx$/.test(entry));
  assert.ok(images.length >= 18, `found only ${images.length} link-image routes`);
  for (const entry of images) {
    const source = await readFile(`src/app/${entry}`, 'utf8');
    assert.doesNotMatch(source, /createAdminClient|createPublicReadClient|supabase\/server/,
      `src/app/${entry} is cached; a no-store client fails silently there. Use createPublicCatalogClient.`);
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

// ── Every public page names itself in link previews ───────────────────────
// Nested metadata is replaced, not merged: a page that sets only a title and
// description inherits the root's whole openGraph object, so it unfurls as
// the homepage with og:url pointing there. These routes either render the
// homepage itself, are noindex embeds/admin, or are error states.
const INHERITS_ROOT_PREVIEW = new Set([
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/not-found.tsx',
]);

async function metadataRoutes(): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir('src/app', { recursive: true });
  const files: string[] = [];
  for (const entry of entries) {
    const file = `src/app/${entry}`;
    if (!/(^|\/)(page|layout)\.tsx$/.test(entry)) continue;
    if (/^(admin|api)\//.test(entry) || /^embed\/.+\//.test(entry)) continue;
    const source = await readFile(file, 'utf8');
    if (/export (const metadata|(async )?function generateMetadata)/.test(source)) files.push(file);
  }
  return files.sort();
}

test('every public route sets its own Open Graph metadata instead of inheriting the homepage', async () => {
  const files = await metadataRoutes();
  assert.ok(files.length >= 25, `found only ${files.length} metadata routes`);
  for (const file of files) {
    if (INHERITS_ROOT_PREVIEW.has(file)) continue;
    const source = await readFile(file, 'utf8');
    assert.match(source, /publicPageMetadata\(|openGraph:|sharedPlanMetadata\(/,
      `${file} sets a title without openGraph, so it unfurls as the homepage`);
  }
});

test('routes that rely on their own image files actually ship both of them', async () => {
  const { access } = await import('node:fs/promises');
  for (const file of await metadataRoutes()) {
    if (!(await readFile(file, 'utf8')).includes('ROUTE_SHARE_IMAGE')) continue;
    const dir = file.slice(0, file.lastIndexOf('/'));
    for (const image of ['opengraph-image.tsx', 'twitter-image.tsx']) {
      await access(`${dir}/${image}`).catch(() => assert.fail(`${file} uses ROUTE_SHARE_IMAGE without ${image}`));
    }
  }
});

test('public page metadata always carries a described image and the page’s own URL', () => {
  for (const image of Object.values(SHARE_IMAGES)) {
    const metadata = publicPageMetadata('About', 'About Eddy.', '/about', image);
    assert.equal(metadata.openGraph?.url, metadata.alternates?.canonical);
    assert.equal(metadata.openGraph?.siteName, 'Eddy');
    assert.deepEqual(metadata.openGraph?.images, [{ url: image.url, width: 1200, height: 630, alt: image.alt }]);
    assert.deepEqual(metadata.twitter?.images, [{ url: image.url, alt: image.alt }]);
    assert.ok(image.alt.length > 10);
  }
  const route = publicPageMetadata('Rivers', 'Rivers.', '/rivers', ROUTE_SHARE_IMAGE);
  assert.ok(!Object.hasOwn(route.openGraph!, 'images'), 'route image files win over config in the same segment');
});

test('static illustrations named as fallback share images exist and fit the card budget', async () => {
  for (const image of Object.values(SHARE_IMAGES)) {
    if (!image.url.startsWith('/share/')) continue;
    const bytes = await readFile(`public${image.url}`);
    const { width, height } = await sharp(bytes).metadata();
    assert.equal(width, 1200);
    assert.equal(height, 630);
  }
});

test('no page title repeats the brand once the root template appends it', async () => {
  for (const file of await metadataRoutes()) {
    if (file === 'src/app/layout.tsx') continue;
    const source = await readFile(file, 'utf8');
    for (const [, title] of source.matchAll(/title: ['"`]([^'"`]+)['"`]/g)) {
      assert.doesNotMatch(title, /(\| |— |- )Eddy$/, `${file}: "${title}" becomes "… Eddy | Eddy"`);
    }
    for (const [, title] of source.matchAll(/publicPageMetadata\(\s*['"`]([^'"`]+)['"`]/g)) {
      assert.doesNotMatch(title, /(\| |— |- )Eddy$/, `${file}: "${title}" becomes "… Eddy | Eddy"`);
    }
  }
});
