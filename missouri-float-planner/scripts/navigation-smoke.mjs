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
const homeOnly = process.env.NAV_SMOKE_HOME_ONLY === '1';
const timestamp = new Date(Date.now() - 15 * 60_000).toISOString();
const riverMeta = [
  { id: 'r-current', slug: 'current', name: 'Current River', state: 'MO', value: 530 },
  { id: 'r-meramec', slug: 'meramec', name: 'Meramec River', state: 'MO', value: 320 },
  { id: 'r-buffalo', slug: 'buffalo', name: 'Buffalo National River', state: 'AR', value: 140 },
];
const reports = riverMeta.map((r, i) => ({ ...r, path: `/rivers/${r.state === 'MO' ? 'missouri' : 'arkansas'}/${r.slug}`,
  lengthMiles: 50, description: null, difficultyRating: 'Class I', region: 'Ozarks', riverType: 'spring_fed_float', accessPointCount: 3,
  primaryGaugeSiteId: `0706700${i}`, currentCondition: { code: 'good', label: 'Good', thresholdUnit: 'cfs', gaugeHeightFt: 3, dischargeCfs: r.value, readingAgeHours: .25, trend: null },
}));
const scheduleDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const tomorrowDate = new Date(`${scheduleDate}T00:00:00Z`);
tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
const scheduleDates = [scheduleDate, tomorrowDate.toISOString().slice(0, 10)];
const dams = [['swl-table-rock-dam', 'Table Rock Dam', 'Table Rock Lake'], ['swl-bull-shoals-dam', 'Bull Shoals Dam', 'Bull Shoals Lake']].map(([id, name, lakeName]) => ({
  id, name, lakeName, state: 'MO', lat: 36.6, lon: -93.3, hasTurbines: true, generating: true,
  generationReference: { units: 8, fullGenerationCfs: 20000, schedulingCapacityMw: 400, source: 'SWPA' },
  metrics: { release: { value: 10500, unit: 'cfs', at: timestamp, staleness: 'fresh' }, tailwaterTempF: { value: 52, unit: 'F', at: timestamp, staleness: 'fresh' } },
  schedule: scheduleDates.map(scheduleDate => ({ scheduleDate, retrievedAt: timestamp, idle: [], hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: i < 12 ? 200 : 400, cfs: i < 12 ? 10000 : 20000, isRamp: i === 12 })) })), sources: ['USACE', 'SWPA'],
}));
const historyReadings = Array.from({ length: 57 }, (_, i) => ({ timestamp: new Date(Date.now() - (56 - i) * 6 * 3600000).toISOString(), dischargeCfs: 400 + Math.sin(i / 5) * 90, gaugeHeightFt: 3 + Math.sin(i / 5) * .3 }));
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
  '/api/dams': { dams },
  '/api/rivers': { rivers: riverMeta.map(r => ({ ...r, lengthMiles: 50, accessPointCount: 3, path: reports.find(p => p.slug === r.slug).path })) },
  '/api/usgs/mo-dataset': dataset,
  '/api/usgs/mo-statewide': statewide,
  '/api/usgs/mo-history-bundle': { generatedAt: timestamp, days: 30, entries: [] },
  '/api/usgs/mo-forecast': { generatedAt: timestamp, entries: [] },
  '/api/usgs/mo-sites': { generatedAt: timestamp, capped: false, sites: [] },
};
let server, browser, activePage;
let serverLog = '';
const browserErrors = [];
async function cleanup() {
  server?.kill('SIGKILL');
  await Promise.race([browser?.close().catch(() => {}), new Promise(done => setTimeout(done, 5000))]);
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
  export default async function Page({ searchParams }: { searchParams: Promise<{ disabled?: string }> }) {
    if (process.env.NODE_ENV !== 'development' || process.env.EDDY_NAV_SMOKE !== '1') notFound();
    const params = await searchParams;
    return <HomePage riverGuides={{}} featuredReports={${JSON.stringify(reports)}} featuredDams={${JSON.stringify(dams)}} renderedAt={Date.now()} floatSearchEnabled={params.disabled !== '1'} />;
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
  const serverArgs = homeOnly ? ['scripts/conditions-smoke-server.mjs', String(port)] : ['node_modules/next/dist/bin/next', ...modeArgs, '--hostname', '127.0.0.1', '--port', String(port)];
  server = spawn(process.execPath, serverArgs, {
    env: { ...process.env, EDDY_NAV_SMOKE: '1', EDDY_CONDITIONS_SMOKE: homeOnly ? '1' : '0', FLOAT_SEARCH_ENABLED: 'true', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' },
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
    activePage = page;
    page.setDefaultTimeout(60000);
    page.on('pageerror', error => browserErrors.push(error.message));
    let stressMap = false, mapRequests = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (/^\/api\/gauges\/[^/]+\/history$/.test(path)) return route.fulfill({ json: { siteId: path.split('/')[3], siteName: 'Fixture gauge', readings: historyReadings } });
      if (path.startsWith('/api/usgs/mo-')) mapRequests++;
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
      } else if (imageUrl.includes('/Eddy_Otter/')) {
        await route.fulfill({ contentType: 'image/png', body: await readFile('public/icons/eddy-wave.png') });
      } else await route.continue();
    });
    if (!productionMapOnly) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole('heading', { name: 'River and Dam Conditions' }).waitFor();
      const riverCarousel = page.getByRole('region', { name: 'River reports', exact: true });
      const damCarousel = page.getByRole('region', { name: 'Dam reports', exact: true });
      const activeRiver = riverCarousel.locator('[data-home-report]:not([inert])');
      const activeDam = damCarousel.locator('[data-home-report]:not([inert])');
      await activeRiver.getByRole('img', { name: /Flow.*trend chart/ }).waitFor();
      assert.equal(await activeRiver.getByText('Eddy says', { exact: true }).count(), 1);
      assert(await activeDam.getByText('10,500 cfs', { exact: true }).isVisible());
      assert(await activeDam.getByRole('heading', { name: 'Generation schedule' }).isVisible());
      for (const day of ['Today', 'Tomorrow']) assert(await activeDam.getByRole('region', { name: `${day}’s generation schedule`, exact: true }).getByRole('img').isVisible());
      assert.equal(await activeDam.getByRole('region', { name: 'Tomorrow’s generation schedule', exact: true }).locator('[data-schedule-now]').count(), 0);
      assert.equal(await page.getByRole('button', { name: /pause|resume rotation/i }).count(), 0);
      assert.equal(await riverCarousel.getByRole('link', { name: 'All Rivers' }).getAttribute('href'), '/rivers?kind=rivers');
      assert.equal(await damCarousel.getByRole('link', { name: 'All Dams' }).getAttribute('href'), '/dams');
      await riverCarousel.getByRole('button', { name: 'Next river report' }).click();
      await activeRiver.getByRole('heading', { name: 'Meramec River', exact: true }).waitFor();
      assert.equal(await activeDam.getAttribute('data-home-report'), 'dam:swl-table-rock-dam', 'manual river navigation is independent');
      await riverCarousel.getByRole('button', { name: 'Previous river report' }).click();
      await activeRiver.getByRole('heading', { name: 'Current River', exact: true }).waitFor();
      await damCarousel.getByRole('button', { name: 'Next dam report' }).click();
      await activeDam.getByRole('heading', { name: 'Bull Shoals Dam', exact: true }).waitFor();
      await damCarousel.getByRole('button', { name: 'Previous dam report' }).click();
      await activeDam.getByRole('heading', { name: 'Table Rock Dam', exact: true }).waitFor();
      const riverBox = await riverCarousel.boundingBox();
      const damBox = await damCarousel.boundingBox();
      assert(width >= 768 ? Math.abs(riverBox.y - damBox.y) < 2 : damBox.y >= riverBox.y + riverBox.height, `${name}: columns match the viewport`);
      if (width >= 768) {
        const riverCard = await activeRiver.locator(':scope > div').boundingBox();
        const damCard = await activeDam.locator('article').boundingBox();
        assert(Math.abs(riverCard.height - damCard.height) < 2, `${name}: river and dam cards have equal heights`);
        const riverControls = await riverCarousel.getByRole('link', { name: 'All Rivers' }).boundingBox();
        const damControls = await damCarousel.getByRole('link', { name: 'All Dams' }).boundingBox();
        assert(Math.abs(riverControls.y - damControls.y) < 2, `${name}: carousel controls align`);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal overflow`);
      const heroCta = page.locator('a[data-ga-label="hero"][data-ga-event="cta_plan_float"]');
      assert.equal(await heroCta.textContent(), 'Plan a float');
      assert.equal(await heroCta.getAttribute('href'), '/plan');
      assert.equal(await page.getByRole('region', { name: 'River alerts', exact: true }).count(), 0);
      const conditionMap = page.getByRole('link', { name: 'Open the Live River Map', exact: true });
      assert.equal(await conditionMap.getAttribute('href'), '/river-map');
      assert.equal(await conditionMap.locator('p').count(), 0);
      await page.evaluate(() => scrollTo(0, 0));
      await page.addStyleTag({ content: 'nextjs-portal { display:none }' });
      await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
      if (width < 900) {
        const toggle = page.getByRole('button', { name: 'Open menu' });
        await toggle.tap();
        const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
        assert.deepEqual(await mobile.getByRole('link').allTextContents(), ['Map', 'Conditions', 'Floats', 'Guides', 'Get the App']);
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert(await toggle.evaluate(el => el === document.activeElement));
      } else {
        const nav = page.getByRole('navigation', { name: 'Main navigation' });
        assert.deepEqual(await nav.getByRole('link').allTextContents(), ['Map', 'Conditions', 'Floats', 'Guides']);
        await nav.getByRole('link', { name: 'Map', exact: true }).focus();
        await page.keyboard.press('Tab');
        assert(await nav.getByRole('link', { name: 'Conditions', exact: true }).evaluate(el => el === document.activeElement));
      }
      console.log(`PASS ${name}: real homepage cards, section links, layout, and keyboard/touch menu`);
      if (width === 1440) {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await riverCarousel.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.waitForFunction(() => document.querySelector('[data-home-report="river:meramec"]')?.inert === false, null, { timeout: 20000 });
        assert.equal(await activeDam.getAttribute('data-home-report'), 'dam:swl-bull-shoals-dam', 'both reports advance automatically');
        await activeDam.getByRole('link').first().focus();
        await page.waitForTimeout(8500);
        assert.equal(await activeDam.getAttribute('data-home-report'), 'dam:swl-bull-shoals-dam', 'focus holds the report without a pause button');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await riverCarousel.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.waitForTimeout(8500);
        assert.equal(await activeRiver.getAttribute('data-home-report'), 'river:current', 'reduced motion disables automatic rotation');
        console.log('PASS automatic rotation, interaction hold, and reduced motion');
      }
      if (homeOnly) { await page.close(); continue; }
      if (width === 1440) {
        // Native-history transitions exercise the same Next hooks used by the map.
        await page.evaluate(() => history.replaceState(null, '', '/rivers/missouri/current'));
        const nav = page.getByRole('navigation', { name: 'Main navigation' });
        await page.waitForFunction(() => document.querySelector('nav[aria-label="Main navigation"] a[href="/plan?river=current"]'));
        assert.equal(await nav.getByRole('link', { name: 'Floats' }).getAttribute('href'), '/find-float?river=current');
        await nav.getByRole('link', { name: 'Map', exact: true }).click();
        await page.waitForURL('**/plan?river=current');
        await page.getByRole('navigation', { name: 'Floats', exact: true }).getByRole('link', { name: 'Plan a float' }).waitFor();
        assert.equal(await nav.getByRole('link', { name: 'Map', exact: true }).getAttribute('aria-current'), 'page');
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.getByRole('link', { name: 'Open the Live River Map', exact: true }).click();
        await page.waitForURL('**/river-map');
        await page.evaluate(() => history.replaceState(null, '', '/river-map?river=current'));
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
        await page.getByRole('heading', { name: 'Floats', exact: true, level: 1 }).waitFor();
        // The catalogue resolves the URL slug to its display name after hydration.
        await page.waitForFunction(() => document.querySelector('#float-destination')?.value === 'Meramec River');
        assert.equal(await page.getByLabel('Town or river', { exact: true }).inputValue(), 'Meramec River');
        await page.getByLabel('Town or river', { exact: true }).fill('Current');
        await page.getByRole('option', { name: 'Current River', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('nav[aria-label="Main navigation"] a[href="/plan?river=current"]'));
        assert.equal(await page.getByRole('link', { name: 'Plan a float', exact: true }).getAttribute('href'), '/plan?river=current');
        await page.goto(`${origin}/find-float?river=current&putIn=akers&takeOut=pulltite&vessel=kayak`, { waitUntil: 'networkidle' });
        await page.locator('summary').filter({ hasText: 'Filters' }).click();
        await page.getByRole('button', { name: 'kayak', exact: true }).click();
        await page.getByRole('button', { name: 'canoe', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: 'canoe', exact: true }).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.getByRole('link', { name: 'Plan a float', exact: true }).getAttribute('href'), '/plan?river=current&putIn=akers&takeOut=pulltite');
        await page.goto(`${origin}/plan/navigation-layout-check`, { waitUntil: 'networkidle' });
        await page.getByRole('heading', { name: 'Shared plan fixture' }).waitFor();
        assert.equal(await page.getByRole('navigation', { name: 'Floats', exact: true }).count(), 0, 'shared plans must not inherit the planner tabs');
        await page.goto(`${url}?disabled=1`, { waitUntil: 'networkidle' });
        assert.equal(await page.getByRole('link', { name: /^Find a float/ }).count(), 0);
        assert(await page.getByRole('link', { name: /^Plan a float/ }).count() > 0);
        console.log('PASS river → planner, homepage → condition map → finder, delayed map data, query changes, Back/Forward, refresh, exact plan links, and disabled finder');
      }
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
  console.error('Browser exceptions:', browserErrors);
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${out}/failure.html`, await activePage.content()).catch(() => {});
  }
  console.error(serverLog.slice(-7000));
  process.exitCode = 1;
} finally { await cleanup(); }
process.exit(process.exitCode ?? 0);
