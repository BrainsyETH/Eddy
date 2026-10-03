import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { resolveOutlookGauge } from './outlook-gauge';
import { createCampingRollover } from '../../../eddy-ios/src/lib/campingRollover';
import assert from 'node:assert/strict';
import test from 'node:test';
import { imageUrl } from '../../../eddy-ios/src/lib/imageUrl';
import { parseCampingSnapshot } from '../../../eddy-ios/src/lib/campingSnapshot';
import { withinBudget } from './within-budget';

test('native thumbnails request a supported pixel width while preserving encoded URLs', () => {
  const original = 'https://www.nps.gov/photo.jpg?x=1&y=2';
  const result = new URL(imageUrl(original, 132));
  assert.equal(result.searchParams.get('url'), original);
  assert.equal(result.searchParams.get('w'), '256');
  assert.equal(result.searchParams.get('q'), '75');
  assert.equal(new URL(imageUrl(original, 750)).searchParams.get('w'), '750');
});
test('image optimizer never becomes an unrestricted remote proxy', () => {
  for (const url of ['file:///tmp/photo.jpg', 'https://www.nps.gov.evil.test/photo.jpg',
    'http://www.nps.gov/photo.jpg', 'https://project.supabase.co/auth/v1/user',
    'https://unknown.example/photo.jpg']) assert.equal(imageUrl(url, 128), url);
  assert.match(imageUrl('https://project.supabase.co/storage/v1/object/public/photos/a.jpg', 128), /_next\/image/);
});
test('camping restart cache preserves timestamps and rejects expired/wrong-window data', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const data = { schemaVersion: 1, generatedAt: '2026-10-03T11:00:00Z',
    timeZone: 'America/Chicago', maxObservationAgeSeconds: 259200,
    horizon: { nights: Array(21).fill('2026-10-03') }, weekend: { nights: [] },
    tracked: [{ id: 'camp', nights: [{ checkedAt: '2026-10-02T11:00:00Z' }] }], untracked: [] };
  assert.deepEqual(parseCampingSnapshot(JSON.stringify(data), 21, now), data);
  assert.equal(parseCampingSnapshot(JSON.stringify(data), 90, now), null);
  assert.equal(parseCampingSnapshot(JSON.stringify(data), 21, now + 73 * 3600_000), null);
  assert.equal(parseCampingSnapshot('{broken', 21, now), null);
});
test('a hung optional provider returns a fallback, and late failures are consumed', async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<string>((_resolve, no) => { reject = no; });
  assert.equal(await withinBudget(pending, 5, 'unavailable'), 'unavailable');
  reject(new Error('late failure'));
  assert.equal(await withinBudget(Promise.resolve('ready'), 1000, 'fallback'), 'ready');
});

test('public catalog reads cache explicitly, RPC and admin reads stay fresh', async () => {
  const { createPublicCatalogClient } = await import('./supabase/public-read');
  const { createAdminClient } = await import('./supabase/admin');
  const originalFetch = globalThis.fetch;
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const requests: RequestInit[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
  globalThis.fetch = async (_input, init) => {
    requests.push(init ?? {});
    return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const publicClient = createPublicCatalogClient();
    await publicClient.from('rivers').select('id');
    await publicClient.rpc('get_river_condition', { p_river_id: 'river' });
    const controller = new AbortController();
    await createAdminClient(controller.signal).from('gauge_readings').select('reading_timestamp');
    assert.deepEqual(requests.map((request) => request.cache), ['force-cache', 'no-store', 'no-store']);
    assert.equal(new Headers(requests[0].headers).get('apikey'), 'test-anon');
    assert.equal(new Headers(requests[2].headers).get('apikey'), 'test-service');
    assert.equal(requests[2].signal, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: saved.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: saved.anon, SUPABASE_SERVICE_ROLE_KEY: saved.service })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});


test('invalid gauge IDs skip the UUID query and missing valid IDs use the primary', async () => {
  const validId = '12345678-1234-1234-1234-123456789abc';
  for (const id of [null, '', '07067000', 'old-gauge-id', validId]) {
    const requested: string[] = [];
    const result = await resolveOutlookGauge(id, async (value) => { requested.push(value); return null; }, async () => 'primary');
    assert.equal(result, 'primary');
    assert.deepEqual(requested, id === validId ? [validId] : []);
  }
  assert.equal(await resolveOutlookGauge(validId, async () => 'requested', async () => { throw new Error('Unnecessary primary query'); }), 'requested');
});
test('real lookup failures never masquerade as a missing gauge', async () => {
  const unavailable = new Error('Database unavailable');
  await assert.rejects(resolveOutlookGauge('12345678-1234-1234-1234-123456789abc', async () => { throw unavailable; }, async () => 'primary'), (error) => error === unavailable);
  await assert.rejects(resolveOutlookGauge('07067000', async () => null, async () => { throw unavailable; }), (error) => error === unavailable);
});
test('old camping data cannot trigger repeated offline timer refreshes', () => {
  // The observer starts with the screen's day, independent of the disk snapshot.
  const changed = createCampingRollover('2026-10-03');
  for (let minute = 0; minute < 120; minute++) assert.equal(changed('2026-10-03'), false);
  assert.equal(changed('2026-10-04'), true);
  // Failure leaves yesterday's snapshot intact but must not re-arm the timer.
  for (let minute = 0; minute < 120; minute++) assert.equal(changed('2026-10-04'), false);
  assert.equal(changed('2026-10-05'), true);
});
test('hazards failure and retry are rendered outside all collapsible content', () => {
  const source = ts.createSourceFile('river.tsx', readFileSync('../eddy-ios/app/(tabs)/(today,map,alerts,favorites,settings)/river/[slug].tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'UnavailableNote' && node.getText(source).includes('Hazards unavailable')) {
      found = true;
      assert.match(node.getText(source), /onRetry=\{retry\}/);
      let gatedOnFailure = false;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isJsxElement(parent)) assert.notEqual(parent.openingElement.tagName.getText(source), 'CollapsibleSection');
        if (ts.isConditionalExpression(parent) && parent.condition.getText(source) === "source.hazards === 'missing'") gatedOnFailure = true;
      }
      assert.equal(gatedOnFailure, true);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(found, true);
});
