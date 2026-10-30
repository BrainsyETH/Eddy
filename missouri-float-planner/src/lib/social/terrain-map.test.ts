import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTerrainMap } from './terrain-map';

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
