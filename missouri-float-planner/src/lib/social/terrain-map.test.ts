import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTerrainMap } from './terrain-map';
import type { LngLat } from '../../../shared/social-route-journey';

test('map preparation uploads once and returns a token-free immutable URL', async (t) => {
  const before = process.env.MAPBOX_ACCESS_TOKEN;
  process.env.MAPBOX_ACCESS_TOKEN = 'test-map-token';
  t.after(() => { if (before === undefined) delete process.env.MAPBOX_ACCESS_TOKEN; else process.env.MAPBOX_ACCESS_TOKEN = before; });
  let uploads = 0;
  const result = await prepareTerrainMap([[-91, 37], [-90.9, 37.1]], {
    fetch: async (url) => {
      assert.equal(new URL(String(url)).searchParams.get('access_token'), 'test-map-token');
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
    },
    put: async (path, _body, options) => {
      uploads++;
      assert.match(path, /^social-maps\/terrain-.*\.png$/);
      assert.equal(options.access, 'public');
      return { url: 'https://example.com/map.png', downloadUrl: '', pathname: path, contentType: 'image/png', contentDisposition: '', etag: 'test-etag' };
    },
  });
  assert.equal(uploads, 1);
  assert.equal(result, 'https://example.com/map.png');
});
test('provider errors and non-images stop before uploading', async (t) => {
  const before = process.env.MAPBOX_ACCESS_TOKEN;
  process.env.MAPBOX_ACCESS_TOKEN = 'test-map-token';
  t.after(() => { if (before === undefined) delete process.env.MAPBOX_ACCESS_TOKEN; else process.env.MAPBOX_ACCESS_TOKEN = before; });
  for (const response of [new Response('denied', { status: 401 }), new Response('error'), new Response('', { headers: { 'content-type': 'image/png' } })]) {
    await assert.rejects(prepareTerrainMap([[-91, 37], [-90.9, 37.1]], {
      fetch: async () => response,
      put: async () => { assert.fail('invalid map must never upload'); },
    }));
  }
});

test('missing map configuration prevents dispatch rather than publishing a plain reel', async (t) => {
  const previousMap = process.env.MAPBOX_ACCESS_TOKEN;
  const previousGh = process.env.GH_ACTIONS_TOKEN;
  delete process.env.MAPBOX_ACCESS_TOKEN;
  process.env.GH_ACTIONS_TOKEN = 'test-github-token';
  t.after(() => {
    if (previousMap === undefined) delete process.env.MAPBOX_ACCESS_TOKEN; else process.env.MAPBOX_ACCESS_TOKEN = previousMap;
    if (previousGh === undefined) delete process.env.GH_ACTIONS_TOKEN; else process.env.GH_ACTIONS_TOKEN = previousGh;
  });
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('must not dispatch without a map'); });
  const { triggerVideoRender } = await import('./video-renderer');
  assert.equal(await triggerVideoRender({ postIds: 'test', compositionId: 'social-route-portrait', inputProps: { routeCoordinates: [[-91, 37], [-90.9, 37.1]] }, outputFilename: 'test' }), false);
});

test('a prepared terrain snapshot in the props is dispatched as-is, with no provider request', async (t) => {
  const previousMap = process.env.MAPBOX_ACCESS_TOKEN;
  const previousGh = process.env.GH_ACTIONS_TOKEN;
  delete process.env.MAPBOX_ACCESS_TOKEN;
  process.env.GH_ACTIONS_TOKEN = 'test-github-token';
  t.after(() => {
    if (previousMap === undefined) delete process.env.MAPBOX_ACCESS_TOKEN; else process.env.MAPBOX_ACCESS_TOKEN = previousMap;
    if (previousGh === undefined) delete process.env.GH_ACTIONS_TOKEN; else process.env.GH_ACTIONS_TOKEN = previousGh;
  });
  const urls: string[] = [];
  let dispatched: { inputs: { input_props: string } } | null = null;
  t.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    urls.push(String(url));
    dispatched = JSON.parse(String(init?.body));
    return new Response(null, { status: 204 });
  });
  const { triggerVideoRender } = await import('./video-renderer');
  const inputProps = { routeCoordinates: [[-91, 37], [-90.9, 37.1]], terrainMapUrl: 'https://example.com/shared.png' };
  assert.equal(await triggerVideoRender({ postIds: 'test', compositionId: 'social-route-portrait', inputProps, outputFilename: 'test' }), true);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/api\.github\.com\//);
  assert.equal(JSON.parse(dispatched!.inputs.input_props).terrainMapUrl, 'https://example.com/shared.png');
});

test('destination renders of one Float Pick share a single terrain preparation', async () => {
  const { shareTerrainMap, getCompositionForPost } = await import('./video-renderer');
  const data = { riverName: 'Current River', distanceMi: 7.6, routeCoordinates: [[-91, 37], [-90.9, 37.1]] as LngLat[] };
  const requests = (['instagram', 'facebook', 'tiktok'] as const).map(platform => getCompositionForPost('section_guide', data, platform));
  let prepared = 0;
  const shared = await shareTerrainMap(requests, async () => { prepared++; return 'https://example.com/once.png'; });
  assert.equal(prepared, 1);
  assert.deepEqual(shared.map(render => render.inputProps.terrainMapUrl), Array(3).fill('https://example.com/once.png'));
  assert.deepEqual(shared.map(render => render.inputProps.platform), ['instagram', 'facebook', 'tiktok']);
  assert.equal(requests[0].inputProps.terrainMapUrl, undefined, 'saved requests are not mutated');

  const other = getCompositionForPost('section_guide', { ...data, routeCoordinates: [[-92, 38], [-91.9, 38.1]] as LngLat[] }, 'facebook');
  const mixed = await shareTerrainMap([requests[0], other], async () => 'https://example.com/route-a.png');
  assert.equal(mixed[0].inputProps.terrainMapUrl, 'https://example.com/route-a.png');
  assert.equal(mixed[1].inputProps.terrainMapUrl, undefined, 'a different route prepares its own map at dispatch');

  const single = await shareTerrainMap([requests[0]], async () => { assert.fail('one dispatch prepares inline'); });
  assert.equal(single[0].inputProps.terrainMapUrl, undefined);
  const digest = [getCompositionForPost('daily_digest', {}), getCompositionForPost('daily_digest', {})];
  assert.deepEqual(await shareTerrainMap(digest, async () => { assert.fail('non-geographic formats never fetch terrain'); }), digest);
  const failed = await shareTerrainMap(requests, async () => { throw new Error('provider down'); });
  assert.deepEqual(failed, requests, 'a failed shared preparation falls back to per-dispatch preparation');
});


test('Float Picks dispatch destination props and filenames; legacy retries adopt the target platform', async (t) => {
  const before = process.env.GH_ACTIONS_TOKEN;
  process.env.GH_ACTIONS_TOKEN = 'test-github-token';
  t.after(() => { if (before === undefined) delete process.env.GH_ACTIONS_TOKEN; else process.env.GH_ACTIONS_TOKEN = before; });
  const { destinationRenderRequest, getCompositionForPost, videoRenderGroup, triggerVideoRender } = await import('./video-renderer');
  const requests: Array<{ inputs: { post_ids: string; input_props: string; output_filename: string } }> = [];
  t.mock.method(globalThis, 'fetch', async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  });
  const legacy = getCompositionForPost('section_guide', { riverName: 'Current River', distanceMi: 7.6 });
  const filenames = new Set<string>();
  const groups = new Set<string>();
  for (const platform of ['instagram', 'facebook', 'tiktok'] as const) {
    const render = destinationRenderRequest(legacy, platform);
    assert.equal(render.inputProps.platform, platform);
    assert.equal(render.inputProps.placement, 'reel');
    assert.deepEqual(destinationRenderRequest(render, platform), render, 'retry suffix stays idempotent');
    assert.equal(legacy.inputProps.platform, undefined, 'saved/shared source is not mutated');
    filenames.add(render.outputFilename);
    groups.add(videoRenderGroup('section_guide', 'current', platform));
    await triggerVideoRender({ ...render, postIds: platform + '-id' });
  }
  assert.equal(filenames.size, 3);
  assert.equal(groups.size, 3);
  for (const request of requests) {
    const props = JSON.parse(request.inputs.input_props);
    assert.equal(request.inputs.post_ids, props.platform + '-id');
    assert.ok(request.inputs.output_filename.endsWith(`-${props.platform}-reel`));
  }
  const digest = getCompositionForPost('daily_digest', {});
  assert.deepEqual(destinationRenderRequest(digest, 'facebook'), digest);
  assert.equal(videoRenderGroup('daily_digest', null, 'facebook'), videoRenderGroup('daily_digest', null, 'instagram'));
});
