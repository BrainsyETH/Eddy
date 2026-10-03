import { loadCampingWindow } from '../../../eddy-ios/src/lib/loadCampingWindow';
import { compactAccessPoint } from './access-points/compact';
import type { CampingOverview } from '@eddy/types';
import type { AccessPoint } from '@/types/api';
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


test('camping publishes 21 nights before 90 and retains the partial result on failure', async () => {
  for (const failFull of [false, true]) {
    const events: string[] = [];
    const load = loadCampingWindow({ nights: 90, hasFullSnapshot: () => false,
      fetchWindow: async (nights) => {
        events.push(`fetch:${nights}`);
        if (nights === 90 && failFull) throw new Error('offline');
        return { horizon: { nights: Array(nights).fill('2026-10-03') } } as CampingOverview;
      },
      publish: (value) => events.push(`show:${value.horizon.nights.length}`),
    });
    if (failFull) await assert.rejects(load, /offline/); else await load;
    assert.deepEqual(events, ['fetch:21', 'show:21', 'fetch:90', ...(failFull ? [] : ['show:90'])]);
  }
});
test('camping preserves full disk snapshots and still tries 90 after an initial failure', async () => {
  for (const fullSnapshot of [false, true]) {
    const requests: number[] = [], shown: number[] = [];
    await loadCampingWindow({ nights: 90, hasFullSnapshot: () => fullSnapshot,
      fetchWindow: async (nights) => {
        requests.push(nights);
        if (nights === 21) throw new Error('short window failed');
        return { horizon: { nights: Array(nights).fill('2026-10-03') } } as CampingOverview;
      }, publish: (value) => shown.push(value.horizon.nights.length),
    });
    assert.deepEqual(requests, fullSnapshot ? [90] : [21, 90]);
    assert.deepEqual(shown, [90]);
  }
});
test('compact access lists preserve hero, camping classification and endpoint eligibility', () => {
  const full = { id: 'pin', type: 'boat_ramp', types: ['boat_ramp'], isFloatEndpoint: false,
    imageUrls: [], npsCampground: { images: [{ url: 'https://www.nps.gov/photo.jpg' }], fees: [{ cost: '20' }] },
  } as unknown as AccessPoint;
  const result = compactAccessPoint(full);
  assert.equal('npsCampground' in result, false);
  assert.deepEqual(result.imageUrls, ['https://www.nps.gov/photo.jpg']);
  assert.deepEqual(result.types, ['boat_ramp', 'campground']);
  assert.equal(result.isFloatEndpoint, false);
  assert.ok(full.npsCampground);
  assert.deepEqual(compactAccessPoint({ ...full, imageUrls: ['own.jpg'] }).imageUrls, ['own.jpg']);
});
test('campsite image resizing is restricted to verified public provider paths', () => {
  for (const uri of ['https://cdn.recreation.gov/public/site.jpg', 'https://icampmo.usedirect.com/MSPWeb/images/Missouri/site.jpg']) {
    assert.match(imageUrl(uri, 256), /_next\/image/);
    assert.match(imageUrl(uri, 1920), /w=1920/);
  }
  for (const uri of ['https://cdn.recreation.gov/private/site.jpg', 'https://icampmo.usedirect.com/other/site.jpg']) assert.equal(imageUrl(uri, 256), uri);
});

test('optional page alerts distinguish failure from a successful empty response and recover', async () => {
  const { loadPageAlerts } = await import('./data/page-alerts');
  assert.deepEqual(await loadPageAlerts(async () => { throw new Error('database blip'); }), { alerts: [], unavailable: true });
  assert.deepEqual(await loadPageAlerts(async () => []), { alerts: [], unavailable: false });
});

test('campground enrichment failure does not reject either access-list representation', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const { loadCampgroundEnrichment } = await import('./access-points/campground-enrichment');
  for (const compact of [false, true]) {
    let failed = true;
    const client = createClient<import('@/types/database').Database>('https://fixture.supabase.co', 'fixture-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => failed
        ? Response.json({ message: 'temporarily unavailable' }, { status: 503 })
        : Response.json([{ id: 'camp', images: [] }]) },
    });
    assert.equal((await loadCampgroundEnrichment(client, ['camp'], compact)).size, 0);
    failed = false;
    assert.equal((await loadCampgroundEnrichment(client, ['camp'], compact)).has('camp'), true);
  }
});

test('late saved camping dates extend a fresh short result and survive full-load failures and retry', async () => {
  const { mergeCampingSnapshots } = await import('../../../eddy-ios/src/lib/mergeCampingSnapshots');
  const day = (i: number) => new Date(Date.UTC(2026, 9, 3 + i)).toISOString().slice(0, 10);
  const snapshot = (count: number, generatedAt: string, checkedAt: string, sitesOpen: number) => ({
    schemaVersion: 1, timeZone: 'America/Chicago', generatedAt, maxObservationAgeSeconds: 3600,
    horizon: { startDate: day(0), endDateExclusive: day(count), nights: Array.from({ length: count }, (_, i) => day(i)) },
    tracked: [{ id: 'camp', facilityId: 'camp', source: 'recreation_gov',
      nights: Array.from({ length: count }, (_, i) => ({ date: day(i), checkedAt, sitesOpen, sitesReservable: 10, status: 'open' })) }],
    untracked: [],
  } as unknown as CampingOverview);
  const short = snapshot(21, '2026-10-03T12:00:00Z', '2026-10-03T11:59:00Z', 2);
  const saved = snapshot(90, '2026-10-02T12:00:00Z', '2026-10-02T11:00:00Z', 8);
  saved.tracked.unshift({ ...saved.tracked[0], id: 'removed', facilityId: 'removed' });
  let shown: CampingOverview | null = null;
  let disk: CampingOverview | null = null;
  const publish = (next: CampingOverview) => { shown = mergeCampingSnapshots(shown, next); };
  const load = () => loadCampingWindow({ nights: 90, hasFullSnapshot: () => disk !== null,
    fetchWindow: async (nights) => {
      if (nights === 21) return short;
      disk = saved;
      publish(saved); // Slow disk read arrives after the fresh short window.
      throw new Error('offline');
    }, publish,
  });
  await assert.rejects(load(), /offline/);
  await assert.rejects(load(), /offline/);
  const result = shown as unknown as CampingOverview;
  assert.equal(result.horizon.nights.length, 90);
  assert.deepEqual(result.tracked.map((row) => row.facilityId), ['camp']);
  assert.equal(result.generatedAt, short.generatedAt);
  assert.equal(result.tracked[0].nights[0].sitesOpen, 2);
  assert.equal(result.tracked[0].nights[0].checkedAt, short.tracked[0].nights[0].checkedAt);
  assert.equal(result.tracked[0].nights[40].checkedAt, saved.tracked[0].nights[40].checkedAt);
  const { currentNight } = await import('../../../eddy-ios/src/lib/campingHeatmap');
  assert.equal(currentNight(result.tracked[0], day(40), 3600, Date.parse(short.generatedAt)), undefined);
  assert.deepEqual(mergeCampingSnapshots(saved, short), result);
  const full = snapshot(90, '2026-10-03T12:01:00Z', '2026-10-03T12:00:00Z', 1);
  assert.equal(mergeCampingSnapshots(result, full), full);
});
