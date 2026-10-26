// Fixture-backed checks for the actual header, homepage, finder, and map.
// No production credentials or water-provider requests. The temporary route is
// development-only, ignored by Git, and removed when the process exits.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = 3139;
const origin = `http://127.0.0.1:${port}`;
const fixtureDir = resolve('src/app/navigation-layout-check');
const sharedFixtureDir = resolve('src/app/plan/navigation-layout-check');
const out = process.env.NAV_SMOKE_OUTPUT || '/tmp/eddy-navigation';
const productionMapOnly = process.env.NAV_SMOKE_PRODUCTION_MAP === '1';
const timestamp = new Date(Date.now() - 15 * 60_000).toISOString();
const riverMeta = [
  { id: 'r-current', slug: 'current', name: 'Current River', state: 'MO', value: 530 },
  { id: 'r-meramec', slug: 'meramec', name: 'Meramec River', state: 'MO', value: 320 },
  { id: 'r-buffalo', slug: 'buffalo', name: 'Buffalo River', state: 'AR', value: 140 },
];
const reports = riverMeta.map(r => ({ slug: r.slug, name: r.name, path: `/rivers/${r.state === 'MO' ? 'missouri' : 'arkansas'}/${r.slug}`, photoUrl: null }));
const gauges = riverMeta.map((r, i) => ({
  id: `g-${i}`, usgsSiteId: `0706700${i}`, name: `${r.name} gauge`, active: true,
  coordinates: { lng: -91.5 + i * .15, lat: 37.2 + i * .1 },
  gaugeHeightFt: 3, dischargeCfs: r.value, readingTimestamp: timestamp, readingAgeHours: .25, readingSuspect: false, qualifierNote: null,
  thresholds: [{ riverId: r.id, riverName: r.name, riverSlug: r.slug, isPrimary: true, thresholdUnit: 'cfs', levelTooLow: 50, levelLow: 100, levelOptimalMin: 200, levelOptimalMax: 800, levelHigh: 1000, levelDangerous: 2000 }],
}));
const dataset = { generated_at: timestamp, campgrounds: [], rivers: riverMeta.map((r, i) => ({
  id: r.id, slug: r.slug, name: r.name, region: 'Ozarks', length_miles: 50, access_points: [], pois: [],
  geometry: { type: 'LineString', coordinates: [[-91.7 + i*.15,37.1+i*.1],[-91.5+i*.15,37.2+i*.1],[-91.3+i*.15,37.3+i*.1]] },
  gauges: [{ site_id: gauges[i].usgsSiteId, name: gauges[i].name, lon: gauges[i].coordinates.lng, lat: gauges[i].coordinates.lat, lon_raw: gauges[i].coordinates.lng, lat_raw: gauges[i].coordinates.lat, snap_distance_m: 0, is_primary: true, threshold_unit: 'cfs', level_too_low: 50, level_low: 100, level_optimal_min: 200, level_optimal_max: 800, level_high: 1000, level_dangerous: 2000, flood_stage_ft: null, action_stage_ft: null }],
})) };
const statewide = { generatedAt: timestamp, cadenceSeconds: 900, gauges: riverMeta.map((r, i) => ({
  site_no: gauges[i].usgsSiteId, nws_lid: null, river_id: r.id, river_slug: r.slug, river_name: r.name, is_primary: true,
  dischargeCfs: r.value, gaugeHeightFt: 3, readingTimestamp: timestamp, percentile: null, stats: null, flood_stage_ft: null, action_stage_ft: null,
})) };
// Exercise a populated drawer and real river geometry, not just the three
// homepage rows. Readings stay synthetic and confined to this browser fixture.
const basemap = JSON.parse(await readFile('src/data/mo-rivers-basemap.json', 'utf8'));
const stressRivers = basemap.rivers.features.filter(f => f.geometry.type === 'LineString').slice(0, 60).map((f, i) => ({
  ...dataset.rivers[i % 3], id: `stress-${i}`, slug: `stress-${i}`, name: f.properties.name,
  geometry: f.geometry, gauges: [{ ...dataset.rivers[i % 3].gauges[0], site_id: String(80000000 + i) }],
}));
const stressDataset = { ...dataset, rivers: stressRivers };
const stressStatewide = { ...statewide, gauges: stressRivers.map((r, i) => ({
  ...statewide.gauges[i % 3], site_no: r.gauges[0].site_id, river_id: r.id, river_slug: r.slug, river_name: r.name,
})) };
const api = {
  '/api/gauges': { gauges },
  '/api/eddy-updates': { updates: {} },
  '/api/rivers': { rivers: riverMeta.map(r => ({ ...r, lengthMiles: 50, accessPointCount: 3, path: reports.find(p => p.slug === r.slug).path })) },
  '/api/usgs/mo-dataset': dataset,
  '/api/usgs/mo-statewide': statewide,
  '/api/usgs/mo-history-bundle': { generatedAt: timestamp, days: 30, entries: [] },
  '/api/usgs/mo-forecast': { generatedAt: timestamp, entries: [] },
  '/api/usgs/mo-sites': { generatedAt: timestamp, capped: false, sites: [] },
};
let server, browser;
let serverLog = '';
const browserErrors = [];
async function cleanup() {
  server?.kill('SIGKILL');
  await Promise.race([browser?.close(), new Promise(done => setTimeout(done, 5000))]);
  await rm(fixtureDir, { recursive: true, force: true });
  await rm(sharedFixtureDir, { recursive: true, force: true });
  // Next's generated dev types can still import the removed fixture. They are
  // regenerated on the next dev run; remove only outputs referring to this route.
  await rm(resolve('.next/dev/types/app/navigation-layout-check'), { recursive: true, force: true });
  await rm(resolve('.next/dev/types/app/plan/navigation-layout-check'), { recursive: true, force: true });
  const validator = resolve('.next/dev/types/validator.ts');
  if (existsSync(validator) && (await readFile(validator, 'utf8')).includes('/navigation-layout-check/')) {
    await rm(validator);
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });
assert(!existsSync(fixtureDir), 'Refusing to overwrite an existing fixture route');
assert(!existsSync(sharedFixtureDir), 'Refusing to overwrite an existing shared-plan fixture route');
try {
  if (!productionMapOnly) {
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(`${fixtureDir}/page.tsx`, `import { notFound } from 'next/navigation';
  import HomePage from '@/components/home/HomePage';
  import SectionNavigation from '@/components/layout/SectionNavigation';
  import { conditionNavigation } from '@/lib/navigation/site-navigation';
  export default async function Page({ searchParams }: { searchParams: Promise<{ disabled?: string; conditions?: string }> }) {
    if (process.env.NODE_ENV !== 'development' || process.env.EDDY_NAV_SMOKE !== '1') notFound();
    const params = await searchParams;
    return <>{params.conditions && <SectionNavigation label="Conditions" links={conditionNavigation('rivers')} />}<HomePage riverGuides={{}} featuredReports={${JSON.stringify(reports)}} floatSearchEnabled={params.disabled !== '1'} /></>;
  }
  `);
    await mkdir(sharedFixtureDir, { recursive: true });
    await writeFile(`${sharedFixtureDir}/page.tsx`, `import { notFound } from 'next/navigation';
  export default function Page() {
    if (process.env.NODE_ENV !== 'development' || process.env.EDDY_NAV_SMOKE !== '1') notFound();
    return <h1>Shared plan fixture</h1>;
  }
  `);
  }
  await mkdir(out, { recursive: true });
  const modeArgs = productionMapOnly ? ['start'] : ['dev', '--webpack'];
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...modeArgs, '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, EDDY_NAV_SMOKE: '1', FLOAT_SEARCH_ENABLED: 'true', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', data => { serverLog += data; });
  server.stderr.on('data', data => { serverLog += data; });
  console.log('Starting navigation smoke server');
  const url = `${origin}/${productionMapOnly ? 'river-map' : 'navigation-layout-check'}`;
  let ready = false;
  const startupDeadline = Date.now() + 240_000;
  while (Date.now() < startupDeadline) {
    if (server.exitCode !== null) throw new Error(serverLog.slice(-5000));
    try { if ((await fetch(url, { signal: AbortSignal.timeout(30000) })).ok) { ready = true; break; } } catch {}
    await new Promise(done => setTimeout(done, 500));
  }
  assert(ready, serverLog.slice(-5000));
  console.log('Navigation smoke server ready');
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  console.log('Browser ready');
  const viewports = productionMapOnly ? [['mobile', 390, 844]] : [['desktop', 1440, 1000], ['mobile', 390, 844], ['small', 320, 720]];
  for (const [name, width, height] of viewports) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 900, reducedMotion: 'reduce' });
    page.on('pageerror', error => browserErrors.push(error.message));
    let gaugeMode = 'normal', gaugeGate, releaseGauges;
    let stressMap = false, mapRequests = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/api/usgs/mo-')) mapRequests++;
      if (path === '/api/gauges' && gaugeGate) {
        await gaugeGate;
        const responseGauges = gaugeMode === 'empty' ? [] : gaugeMode === 'high' ? gauges.map(g => ({ ...g, dischargeCfs: 1500 })) : gauges;
        await route.fulfill({ status: gaugeMode === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ gauges: responseGauges }) });
        return;
      }
      if (path === '/api/usgs/mo-dataset') await new Promise(done => setTimeout(done, 300));
      const response = stressMap && path === '/api/usgs/mo-dataset' ? stressDataset : stressMap && path === '/api/usgs/mo-statewide' ? stressStatewide : api[path] ?? {};
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
    });
    // Optional local copies of the same brand assets make screenshots independent
    // of CDN reachability; without them Next's normal image loading is used.
    if (process.env.NAV_SMOKE_CANOE) await page.route('**/_next/image?**', async route => {
      const imageUrl = new URL(route.request().url()).searchParams.get('url') || '';
      if (imageUrl.includes('cool%20canoe') || imageUrl.includes('cool canoe')) {
        await route.fulfill({ contentType: 'image/png', body: await readFile(process.env.NAV_SMOKE_CANOE) });
      } else if (imageUrl.includes('Eddy_favicon') && process.env.NAV_SMOKE_FAVICON) {
        await route.fulfill({ contentType: 'image/png', body: await readFile(process.env.NAV_SMOKE_FAVICON) });
      } else await route.continue();
    });
    if (!productionMapOnly) {
      await page.goto(`${url}?conditions=1`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Daily River Report' }).waitFor();
      await page.getByText('530 cfs', { exact: true }).first().waitFor();
      assert(await page.getByRole('navigation', { name: 'Conditions', exact: true }).getByRole('link', { name: 'Lakes & Dams' }).getAttribute('href') === '/dams');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal overflow`);
      assert.equal(await page.getByText('Your next stretch', { exact: true }).count(), 0);
      await page.addStyleTag({ content: 'nextjs-portal { display:none }' });
      await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
      if (width < 900) {
        const toggle = page.getByRole('button', { name: 'Open menu' });
        await toggle.tap();
        const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
        assert.deepEqual(await mobile.getByRole('link').allTextContents(), ['Conditions', 'Map', 'Floats', 'Guides', 'Get the App']);
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert(await toggle.evaluate(el => el === document.activeElement));
      } else {
        const nav = page.getByRole('navigation', { name: 'Main navigation' });
        assert.deepEqual(await nav.getByRole('link').allTextContents(), ['Conditions', 'Map', 'Floats', 'Guides']);
        await nav.getByRole('link', { name: 'Conditions' }).focus();
        await page.keyboard.press('Tab');
        assert(await nav.getByRole('link', { name: 'Map', exact: true }).evaluate(el => el === document.activeElement));
      }
      console.log(`PASS ${name}: real homepage cards, section links, layout, and keyboard/touch menu`);
      if (width === 1440) {
        // Native-history transitions exercise the same Next hooks used by the map.
        await page.evaluate(() => history.replaceState(null, '', '/rivers/missouri/current'));
        const nav = page.getByRole('navigation', { name: 'Main navigation' });
        await page.waitForFunction(() => document.querySelector('nav[aria-label="Main navigation"] a[href="/river-map?river=current"]'));
        assert.equal(await nav.getByRole('link', { name: 'Floats' }).getAttribute('href'), '/find-float?river=current');
        await nav.getByRole('link', { name: 'Map', exact: true }).click();
        await page.waitForURL('**/river-map?river=current');
        await page.getByRole('dialog', { name: 'Current River', exact: true }).waitFor({ timeout: 45000 });
        assert.equal(new URL(page.url()).searchParams.get('river'), 'current');
        await page.evaluate(() => history.pushState(null, '', '/river-map?river=meramec'));
        await page.getByRole('dialog', { name: 'Meramec River', exact: true }).waitFor();
        await page.goBack();
        await page.getByRole('dialog', { name: 'Current River', exact: true }).waitFor();
        await page.goForward();
        await page.getByRole('dialog', { name: 'Meramec River', exact: true }).waitFor();
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('dialog', { name: 'Meramec River', exact: true }).waitFor();
        await nav.getByRole('link', { name: 'Floats' }).click();
        await page.waitForURL('**/find-float?river=meramec');
        await page.getByRole('heading', { name: 'Find a Route', exact: true }).waitFor();
        assert.equal(await page.getByLabel('River (optional)').inputValue(), 'meramec');
        await page.getByLabel('River (optional)').selectOption('current');
        await page.waitForFunction(() => document.querySelector('nav[aria-label="Main navigation"] a[href="/river-map?river=current"]'));
        assert.equal(await page.getByRole('navigation', { name: 'Floats', exact: true }).getByRole('link', { name: 'Build a Route' }).getAttribute('href'), '/plan?river=current');
        await page.goto(`${origin}/find-float?river=current&putIn=akers&takeOut=pulltite&vessel=kayak`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'kayak', exact: true }).click();
        await page.getByRole('button', { name: 'canoe', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: 'canoe', exact: true }).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.getByRole('navigation', { name: 'Floats', exact: true }).getByRole('link', { name: 'Build a Route' }).getAttribute('href'), '/plan?river=current&putIn=akers&takeOut=pulltite');
        await page.goto(`${origin}/plan/navigation-layout-check`, { waitUntil: 'networkidle' });
        await page.getByRole('heading', { name: 'Shared plan fixture' }).waitFor();
        assert.equal(await page.getByRole('navigation', { name: 'Floats', exact: true }).count(), 0, 'shared plans must not inherit the planner tabs');
        await page.goto(`${url}?disabled=1`, { waitUntil: 'networkidle' });
        assert.equal(await page.getByRole('link', { name: /^Find a Route/ }).count(), 0);
        assert(await page.getByRole('link', { name: /^Build a Route/ }).count() > 0);
        console.log('PASS river → map → finder, delayed map data, query changes, Back/Forward, refresh, exact plan links, and disabled finder');
      }
      // Hold the readings until the loading layout has been measured. Compare
      // positions within Daily River Report so the separate hero cannot mask a jump.
      for (const mode of ['high', 'normal', 'empty', 'error']) {
        gaugeMode = mode;
        gaugeGate = new Promise(done => { releaseGauges = done; });
        await page.goto(`${url}?alerts=${mode}`, { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ content: 'nextjs-portal { display:none }' });
        const alert = page.getByRole('region', { name: 'River alerts', exact: true });
        await page.waitForFunction(() => document.querySelector('[aria-label="River alerts"]')?.getAttribute('aria-busy') === 'true');
        await page.evaluate(() => document.fonts.ready);
        const measure = () => alert.evaluate(el => ({ height: el.getBoundingClientRect().height, nextTop: el.nextElementSibling.getBoundingClientRect().top - el.parentElement.getBoundingClientRect().top }));
        const before = await measure();
        releaseGauges();
        await page.waitForFunction(() => document.querySelector('[aria-label="River alerts"]')?.getAttribute('aria-busy') === 'false');
        assert.deepEqual(await measure(), before, `${name}/${mode}: alert must not move the report cards`);
        assert(await alert.evaluate(el => [...el.querySelectorAll('a, p')].every(child => child.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom)), `${name}/${mode}: text fits`);
        if (mode === 'high') {
          await alert.getByRole('heading', { name: 'High-water alerts' }).waitFor();
          await alert.screenshot({ path: `${out}/${name}-high-water.png` });
        }
      }
      gaugeGate = undefined;
      console.log(`PASS ${name}: alert loading, high-water, clear, empty, and failed states keep identical layout`);
    }
    if (width === 390) {
      stressMap = true;
      await page.goto(`${origin}/river-map`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: '60/60 rivers floatable', exact: true }).click();
      const tile = page.locator('button[title^="Show only Flowing"], button[title^="Clear Flowing"]');
      await tile.waitFor();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      await tile.evaluate(button => {
        window.__filterTimings = [];
        button.addEventListener('click', () => {
          const start = performance.now(), previous = button.getAttribute('aria-pressed');
          const observer = new MutationObserver(() => {
            if (button.getAttribute('aria-pressed') === previous) return;
            observer.disconnect();
            requestAnimationFrame(() => requestAnimationFrame(() => window.__filterTimings.push(performance.now() - start)));
          });
          observer.observe(button, { attributes: true, attributeFilter: ['aria-pressed'] });
        }, { capture: true });
      });
      const requestsBefore = mapRequests;
      for (let i = 0; i < 8; i++) {
        await tile.click();
        await page.waitForFunction(count => window.__filterTimings.length === count, i + 1);
        assert.equal(new URL(page.url()).searchParams.get('conditions'), i % 2 === 0 ? 'flowing' : null);
      }
      const timings = await page.evaluate(() => window.__filterTimings);
      assert.equal(mapRequests, requestsBefore, 'filter toggles must not fetch map data again');
      // Dev React/Next instrumentation is deliberately measured but cannot be
      // used as a release performance budget. Enforce the budget on next start.
      if (productionMapOnly) assert(Math.max(...timings) < 250, `6× CPU throttled production filter paint: ${timings}`);
      console.log(`PASS ${productionMapOnly ? 'production' : 'development'} 390px map with ${stressRivers.length} rivers at 6× CPU slowdown; click-to-painted-state ms: ${timings.map(n => Math.round(n)).join(', ')}`);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await cdp.detach();
    }
    await page.close();
  }
  assert.deepEqual(browserErrors, [], 'no browser exceptions');
  console.log(productionMapOnly ? 'PASS production map filter performance' : `PASS screenshots: ${out}`);
} catch (error) {
  console.error(error);
  console.error(serverLog.slice(-7000));
  process.exitCode = 1;
} finally { await cleanup(); }
process.exit(process.exitCode ?? 0);
