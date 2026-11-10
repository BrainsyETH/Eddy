// Local fixture pages, gated out of production and removed on exit.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const route = resolve('src/app/lakes-layout-check');
const out = process.env.LAKES_SMOKE_OUTPUT || '/tmp/eddy-lakes';
const origin = 'http://127.0.0.1:3141';
const now = Date.parse('2026-11-09T18:00:00Z');
const at = new Date(now - 3_600_000).toISOString();
const metric = (value, unit = 'ft') => ({ value, unit, at, staleness: 'fresh' });
const dam = {
  id: 'swl-table-rock-dam', name: 'Table Rock Dam', lakeName: 'Table Rock Lake', state: 'MO', lat: 36.6, lon: -93.3,
  hasTurbines: true, generating: true, generationFloorCfs: 100, releaseExcludesGeneration: true,
  generationReference: { units: 4, fullGenerationCfs: 14000, schedulingCapacityMw: 200, source: 'SWPA' },
  metrics: { generationFlow: metric(7000, 'cfs'), release: metric(7200, 'cfs'), poolElevation: metric(914.4), tailwaterElevation: { ...metric(704.12), trend: { hours: 3, delta: -0.4 } }, tailwaterTempF: metric(56, 'F') },
  schedule: [{ scheduleDate: '2026-11-09', retrievedAt: at, hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: i >= 12 && i < 20 ? 100 : 0, cfs: i >= 12 && i < 20 ? 7000 : 0, isRamp: false })), idle: [{ from: 1, to: 12 }, { from: 21, to: 24 }] }],
  pattern: [], sources: ['USACE CWMS', 'SWPA'],
};
const lake = {
  slug: 'table-rock', name: 'Table Rock Lake', states: ['MO', 'AR'], timeZone: 'America/Chicago', datum: 'NGVD29',
  pool: { valueFt: 914.4, at, staleness: 'fresh' }, change24hFt: -.08, change7dFt: -.4,
  operatingRange: { conservationFt: 915, floodFt: 931, source: 'Preview reference', asOf: '2026-11-09' }, poolPosition: 'below_conservation',
  history: Array.from({ length: 8 }, (_, i) => [new Date(now - (7 - i) * 86_400_000 - 3_600_000).toISOString(), 914.8 - i * .4 / 7]).slice(1),
  launches: [
    { id: 'one', slug: 'example-ramp', name: 'Example trailer ramp', lon: -93.3, lat: 36.6, thresholds: { bottomFt: 704, closureFt: 724, datum: 'NGVD29', source: 'Unreviewed fixture thresholds', sourceUpdatedAt: null }, launchMethods: ['trailer'], amenities: ['parking', 'restroom'], managingAgency: 'Example operator', feeRequired: null },
    { id: 'two', slug: 'example-hand-launch', name: 'Example hand launch', lon: -93.33, lat: 36.63, launchMethods: ['hand'], amenities: ['parking'], managingAgency: 'Example operator', feeRequired: false },
  ], cautionsVerified: false, sources: [],
};
let server, browser, log = '';
let cleanupPromise;
const cleanup = () => cleanupPromise ??= (async () => { await browser?.close(); server?.kill('SIGTERM'); await rm(route, { recursive: true, force: true });
  // The temporary route must not remain in Next's generated dev validator.
  await rm(resolve('.next/dev/types'), { recursive: true, force: true }); })();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void cleanup().finally(() => process.exit(1)));
assert(!existsSync(route), 'refusing to overwrite a pre-existing fixture route');
try {
  await mkdir(route, { recursive: true }); await mkdir(out, { recursive: true });
  await writeFile(`${route}/page.tsx`, `import { notFound } from 'next/navigation';
import DamDetail from '@/components/dam/DamDetail';
import LakeDetail from '@/components/lake/LakeDetail';
import PlaceHeader from '@/components/lake/PlaceHeader';
import { damLakeExperienceEnabled, lakePageHref } from '@/lib/lakes/public-pages';
const baseDam = ${JSON.stringify(dam)};
const baseLake = ${JSON.stringify(lake)};
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string; variant?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_LAKES_SMOKE !== '1') notFound();
  const { kind = 'dam', variant } = await searchParams;
  const dam = structuredClone(baseDam) as import('@shared/dam-types').DamSnapshot;
  const lake = structuredClone(baseLake) as unknown as import('@shared/lake-types').LakeSection;
  if (variant === 'truman') {
    dam.id = 'nwk-truman-dam'; dam.name = 'Harry S. Truman Dam'; lake.name = 'Truman Lake'; lake.slug = 'truman';
    dam.metrics = { poolElevation: { value: 705.4, unit: 'ft', at: '2026-11-08T22:00:00Z', staleness: 'stale' } };
    lake.pool = { valueFt: 705.4, at: '2026-11-08T22:00:00Z', staleness: 'stale', daily: true };
    lake.history = lake.history.map(([at, ft]) => [at, ft - 209]);
    lake.operatingRange = { conservationFt: 706, floodFt: 739.6, source: 'Preview reference', asOf: '2026-11-09' };
  }
  if (variant === 'caution') { lake.cautionsVerified = true; lake.pool!.at = new Date(${now} - 5.9 * 3600000).toISOString(); lake.launches[0].caution = 'low_water'; }
  if (variant === 'noSchedule') dam.schedule = [];
  if (variant === 'gate') { dam.id = 'mvs-wappapello-dam'; dam.hasTurbines = false; dam.schedule = []; dam.metrics = { release: { value: 0, unit: 'cfs', at: '2026-11-07T18:00:00Z', staleness: 'stale' } }; }
  if (variant === 'missing') { lake.pool = undefined; lake.history = []; lake.launches = []; dam.metrics = {}; }
  if (variant === 'stale') { lake.pool!.at = '2026-11-07T18:00:00Z'; for (const metric of Object.values(dam.metrics)) if (metric) metric.at = '2026-11-07T18:00:00Z'; }
  if (variant === 'mixed') { lake.pool!.at = '2026-11-08T18:00:00Z'; dam.metrics.poolElevation!.at = lake.pool!.at; }
  if (variant === 'baseline') dam.id = 'swl-bull-shoals-dam';
  const enabled = variant !== 'held' && damLakeExperienceEnabled(dam.id);
  return <div className="min-h-screen bg-neutral-50"><div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8"><p className="mb-3 text-xs text-accent-900">Layout preview · All readings and launches are fixtures</p><PlaceHeader lakeSlug={kind === 'lake' || enabled ? lake.slug : ''} title={kind === 'lake' ? lake.name : dam.name}><p>Missouri · {kind === 'lake' ? dam.name : lake.name}</p></PlaceHeader>{kind === 'lake' ? <LakeDetail lake={lake} damId={dam.id} damName={dam.name} renderedAt={${now}} /> : <DamDetail dam={dam} lakeExperienceEnabled={enabled} lake={variant === 'baseline' || variant === 'gate' ? undefined : lake} renderedAt={${now}} lakeHref={enabled ? lakePageHref(lake.slug) : undefined} availability={{ title: dam.hasTurbines ? 'Schedule currently unavailable' : 'Gate-operated releases', detail: 'Preview availability state.' }} />}</div></div>;
}
`);
  assert.equal(spawnSync('git', ['check-ignore', '--quiet', `${route}/page.tsx`]).status, 0);
  for (const [mode, flag] of [['production', '1'], ['development', '']]) {
    const r = spawnSync(process.execPath, ['--import', 'tsx', '-e', `const assert = require('node:assert/strict'); const Page = require(${JSON.stringify(`${route}/page.tsx`)}).default; assert.rejects(() => Page({ searchParams: Promise.resolve({}) }), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }).catch(e => { console.error(e); process.exitCode = 1; });`], { timeout: 30000, encoding: 'utf8', env: { ...process.env, NODE_ENV: mode, EDDY_LAKES_SMOKE: flag, TSX_TSCONFIG_PATH: resolve('tsconfig.json') } });
    assert.equal(r.status, 0, r.stderr);
  }
  console.log('PASS development-only route guards');
  server = spawn(process.execPath, ['scripts/conditions-smoke-server.mjs', '3141'], { env: { ...process.env, EDDY_CONDITIONS_SMOKE: '1', EDDY_LAKES_SMOKE: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', b => { log += b; process.stdout.write(b); }); server.stderr.on('data', b => { log += b; process.stderr.write(b); });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${origin}/lakes-layout-check`, { signal: AbortSignal.timeout(1500) })).ok) break; } catch {} if (server.exitCode !== null) throw new Error(log.slice(-4000)); await new Promise(r => setTimeout(r, 1000)); }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const errors = [];
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: width < 900 });
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(90000);
    await page.clock.install({ time: now });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async r => {
      const u = new URL(r.request().url());
      if (u.origin !== origin) return r.fulfill({ status: 204 });
      if (u.pathname.startsWith('/map-styles/')) return r.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f5f3eb' } }] } });
      if (u.pathname === '/_next/image') { const src = u.searchParams.get('url'); if (src && /^https?:/.test(src)) return r.fulfill({ contentType: 'image/png', body: await readFile('../eddy-ios/assets/otter/favicon.png') }); if (src?.startsWith('/') && existsSync(`public${src}`)) return r.fulfill({ contentType: src.endsWith('.jpg') ? 'image/jpeg' : 'image/png', body: await readFile(`public${src}`) }); }
      if (u.pathname.startsWith('/api/eddy/dams/')) return r.fulfill({ json: { read: null } });
      if (u.pathname.startsWith('/api/')) return r.fulfill({ json: {} });
      return r.continue();
    });
    for (const variant of ['', 'truman']) {
      for (const kind of ['dam', 'lake']) {
        await page.goto(`${origin}/lakes-layout-check?kind=${kind}&variant=${variant}`, { waitUntil: 'networkidle' });
        await page.clock.runFor(1000);
        await page.waitForFunction(() => [...document.querySelectorAll('figure > svg[tabindex]')].every(svg => Math.abs(Number(svg.getAttribute('width')) - svg.parentElement.getBoundingClientRect().width) < 2));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${kind} ${variant} overflow at ${width}`);
        assert.equal(await page.locator('[data-launch-id]').count(), kind === 'dam' ? 0 : 2, 'launch list belongs only on lake page');
        assert.equal(await page.getByRole('link', { name: /photo credit/i }).count(), 0, 'credits remain on the central credits page');
        if (kind === 'lake') {
          const launches = await page.locator('[aria-labelledby="lake-launches-heading"]').innerText();
          assert(!/Ramp bottom|Published closure threshold|Elevation cautions use/.test(launches), 'unverified thresholds and footer stay hidden even in an old payload');
          const directions = new URL(await page.getByRole('link', { name: 'Directions', exact: true }).first().getAttribute('href'));
          assert.equal(directions.pathname, '/maps/dir/');
          assert.equal(directions.searchParams.get('destination'), '36.6,-93.3');
        }
        if (kind === 'dam') {
          const lakeLink = page.locator(`[data-lake-section] a[href="/lakes/${variant === 'truman' ? 'truman' : 'table-rock'}"]`);
          assert.equal(await lakeLink.count(), 1, 'published dam links to its lake page');
          const generation = page.locator('[data-dam-detail] > section').first();
          assert((await generation.innerText()).includes('Nov 9'), 'generation is first');
          const scheduleBox = await page.getByRole('region', { name: 'Generation schedule', exact: true }).boundingBox();
          const observedBox = await page.locator('.dam-observed').boundingBox();
          assert(width < 900 ? observedBox.y < scheduleBox.y : observedBox.x < scheduleBox.x, 'current observation leads before the full schedule');
          assert(await page.locator('.dam-observed').evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('[aria-label="Generation schedule"]')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'DOM order matches the visual order');
          if (!variant) {
            const conditions = page.locator('[data-pilot-conditions]');
            assert.equal((await conditions.innerText()).match(/Observed/g)?.length, 1, 'shared timestamp appears once');
            const y = await conditions.locator('h3 + p').evaluateAll(nodes => nodes.map(n => Math.round(n.getBoundingClientRect().top)));
            assert.equal(new Set(y).size, 1, 'three measurement values share one row');
            assert(await conditions.locator('h3 + p').evaluateAll(nodes => nodes.every(n => n.scrollWidth <= n.clientWidth)), 'measurements do not overlap');
          } else assert(!(await page.locator('[data-pilot-conditions]').innerText()).includes('Outdated'), '20-hour daily report is not stale');
        }
        await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
        await page.screenshot({ path: `${out}/${variant || 'table-rock'}-${kind}-${width}.png`, fullPage: true });
      }
    }
    await page.getByRole('button', { name: 'Hand launch', exact: true }).click();
    assert.equal(await page.locator('[data-launch-id]').count(), 1);
    await page.getByRole('button', { name: 'All launches', exact: true }).click();
    await page.getByRole('button', { name: 'View map', exact: true }).click();
    await page.getByRole('button', { name: 'Show Example trailer ramp', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Show Example trailer ramp', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('button', { name: 'Show Example trailer ramp', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'Show Example trailer ramp', 'marker retains keyboard focus');
    await page.getByRole('button', { name: 'Hide map', exact: true }).click();
    const chart = page.locator('svg[tabindex="0"]').first();
    await chart.focus(); await page.keyboard.press('ArrowLeft');
    const reading = chart.locator('..').locator('[aria-live=polite]');
    const before = await reading.innerText();
    await page.keyboard.press('ArrowLeft');
    assert.notEqual(await reading.innerText(), before, 'keyboard chart reading changes');
    await page.clock.runFor(61000);
    const afterClock = await reading.innerText();
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await reading.innerText(), afterClock, 'chart keyboard works after clock update');
    await page.goto(`${origin}/lakes-layout-check?kind=lake&variant=missing`, { waitUntil: 'networkidle' });
    assert((await page.locator('[data-lake-detail]').innerText()).includes('Lake level is currently unavailable'));
    assert.equal(await page.locator('[data-launch-id]').count(), 0);
    await page.goto(`${origin}/lakes-layout-check?kind=dam&variant=mixed`, { waitUntil: 'networkidle' });
    assert((await page.locator('[data-pilot-conditions]').innerText()).includes('Below dam observed'), 'mixed observations are scoped');
    await page.goto(`${origin}/lakes-layout-check?kind=lake&variant=stale`, { waitUntil: 'networkidle' });
    assert((await page.locator('[aria-labelledby="lake-level-heading"]').innerText()).includes('Outdated'));
    assert(!(await page.locator('[aria-labelledby="lake-level-heading"]').innerText()).includes('in 24h'), 'stale level does not present current movement');
    await page.goto(`${origin}/lakes-layout-check?kind=lake&variant=caution`, { waitUntil: 'networkidle' });
    await page.clock.runFor(1000);
    assert.equal(await page.locator('[data-launch-id] [role=note]').count(), 1, 'verified fresh caution is visible');
    const verified = await page.locator('[aria-labelledby="lake-launches-heading"]').innerText();
    assert(verified.includes('Ramp bottom 704 ft') && verified.includes('Published closure threshold 724 ft') && verified.includes('Elevation cautions use'), 'verified thresholds and explanation are available');
    await page.clock.fastForward(10 * 60_000);
    await page.waitForFunction(() => document.querySelectorAll('[data-launch-id] [role=note]').length === 0);
    await page.goto(`${origin}/lakes-layout-check?kind=dam&variant=held`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-pilot-conditions]').count(), 0, 'registry lake with data does not enable redesigned conditions');
    assert.equal(await page.locator('[data-lake-section]').count(), 0, 'held dam does not expose history or reviewed-launch count');
    assert.equal(await page.locator('img').evaluateAll(nodes => nodes.filter(img => decodeURIComponent(img.src).includes('/lakes/')).length), 0, 'held dam does not expose photo header');
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    await page.screenshot({ path: `${out}/held-dam-${width}.png`, fullPage: true });
    await page.goto(`${origin}/lakes-layout-check?kind=dam&variant=baseline`, { waitUntil: 'networkidle' });
    await page.clock.runFor(1000);
    assert.equal(await page.locator('[data-pilot-conditions]').count(), 0, 'non-pilot keeps the established measurement card');
    const baselineSchedule = await page.getByRole('region', { name: 'Generation schedule', exact: true }).boundingBox();
    const baselineObserved = await page.locator('.dam-observed').boundingBox();
    assert(width < 900 ? baselineSchedule.y > baselineObserved.y : baselineSchedule.x > baselineObserved.x, 'non-pilot placement is unchanged');
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    await page.screenshot({ path: `${out}/baseline-dam-${width}.png`, fullPage: true });
    await page.goto(`${origin}/lakes-layout-check?kind=dam&variant=noSchedule`, { waitUntil: 'networkidle' });
    assert((await page.locator('[data-dam-detail]').innerText()).includes('Schedule currently unavailable'));
    await page.goto(`${origin}/lakes-layout-check?kind=dam&variant=gate`, { waitUntil: 'networkidle' });
    const gate = await page.locator('[data-dam-detail]').innerText();
    assert(gate.includes('Gate-operated releases') && gate.includes('Outdated reading'));
    assert(!gate.includes('Generating now'), 'stale zero release does not describe current operations');
    assert.equal(await page.getByRole('region', { name: 'Generation schedule', exact: true }).count(), 0, 'gate-operated dam has no empty generation chart');
    console.log(`PASS ${width}px: release gates, observation-first order, hidden unverified thresholds, metrics, filters, map keyboard, chart, missing/stale data and dam regressions`);
    await page.close();
  }
  assert.deepEqual(errors, [], 'no browser errors');
  const unpublished = await fetch(`${origin}/lakes/unreleased-lake`);
  const unpublishedHtml = await unpublished.text();
  // A streamed Next notFound can use HTTP 200; its noindex and absent page
  // content are the publication contract in either transport mode.
  assert([200, 404].includes(unpublished.status));
  assert.match(unpublishedHtml, /name="robots" content="[^"]*noindex/);
  assert(!unpublishedHtml.includes('data-lake-detail='), 'unapproved lake content is never rendered');
  for (const slug of ['table-rock', 'truman']) {
    const response = await fetch(`${origin}/lakes/${slug}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert(html.includes(`data-lake-detail="${slug}"`), 'published lake survives an optional data outage');
    assert(!/name="robots" content="[^"]*noindex/.test(html), 'published lake is indexable');
    assert(html.includes(`https://eddy.guide/lakes/${slug}`), 'published lake has its canonical URL');
  }
  console.log('PASS published lake routes, canonical URLs, outage states and unknown-route noindex');
  console.log(`PASS screenshots: ${out}`);
} catch (error) { console.error(log.slice(-5000)); throw error; }
finally { await cleanup(); }
