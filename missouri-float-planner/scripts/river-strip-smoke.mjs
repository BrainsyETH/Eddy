// Real finder UI with fixture API responses; no database or production writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.RIVER_STRIP_SMOKE_ORIGIN || 'http://127.0.0.1:3142';
const out = process.env.RIVER_STRIP_SMOKE_OUTPUT || '/tmp/eddy-river-strip';
const river = { id: 'r-eleven', slug: 'eleven-point', name: 'Eleven Point River', state: 'MO', photoUrl: '/share/river-current-v2.jpg', accessPointCount: 8, lengthMiles: 78, floatAccessCoordinates: [], path: '/rivers/missouri/eleven-point' };
const points = ['Thomasville', 'Cane Bluff', 'McDowell Access', 'Greer Crossing', 'Turner Mill', 'Riverton', 'The Narrows (Highway 142)', 'Lower access'].map((name, index) => ({
  id: `access-${index}`, name, riverMile: index * 10, isFloatEndpoint: true,
}));
const routes = [[5, 6], [0, 1], [2, 4], [4, 7], [3, 5], [1, 2]].map(([start, end], index) => ({
  id: `route-${index + 1}`, riverId: river.id, riverSlug: river.slug, riverName: river.name,
  putIn: { id: points[start].id, name: points[start].name, isPublic: index !== 1 },
  takeOut: { id: points[end].id, name: points[end].name, isPublic: true },
  vesselTypeId: 'kayak-id', minutes: 240 + index * 15, timeRange: { min: 180 + index * 15, max: 300 + index * 15 },
  distanceMiles: (end - start) * 10, conditionCode: 'low', conditionLabel: 'Low',
  conditional: index === 1, cautions: index === 1 ? ['Expect shallow stretches.'] : [], relation: 'match',
  estimateBasis: index === 1 ? 'typical' : 'current_conditions', observedAt: index === 1 ? null : new Date().toISOString(),
  formattedTime: '', url: '', highlights: ['Restrooms', 'No fees'],
  photo: { url: river.photoUrl, caption: 'Fixture image' },
}));

let server, browser, currentPage;
let serverLog = '';
const errors = [];
try {
  await mkdir(out, { recursive: true });
  if (!process.env.RIVER_STRIP_SMOKE_ORIGIN) {
    server = spawn(process.execPath, ['scripts/conditions-smoke-server.mjs', '3142'], {
      env: { ...process.env, EDDY_CONDITIONS_SMOKE: '1', NEXT_TELEMETRY_DISABLED: '1', FLOAT_SEARCH_ENABLED: 'true', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', chunk => { serverLog += chunk; });
    server.stderr.on('data', chunk => { serverLog += chunk; });
  }
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server && server.exitCode !== null) throw new Error(serverLog.slice(-5000));
    try {
      if ((await fetch(`${origin}/find-float`, { signal: AbortSignal.timeout(5000) })).ok) { ready = true; break; }
    } catch { /* Next may still be compiling. */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert(ready, serverLog.slice(-5000));
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  for (const width of [1280, 700, 390, 320]) {
    console.log(`Checking ${width}px`);
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    currentPage = page;
    page.on('pageerror', error => errors.push(error.message));
    let releasePoints;
    const pointsReady = new Promise(resolve => { releasePoints = resolve; });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/rivers') return route.fulfill({ json: { rivers: [river] } });
      if (path === '/api/favorite-floats') return route.fulfill({ json: { floats: [] } });
      if (path === '/api/float-search') return route.fulfill({ json: { matches: routes.slice(0, 5), alternatives: [{ ...routes[5], relation: 'longer' }], partial: false, failed: 0, evaluated: routes.length, estimatedAt: new Date().toISOString() } });
      if (path === '/api/rivers/eleven-point/access-points') {
        await pointsReady;
        return route.fulfill({ json: { accessPoints: points } });
      }
      return route.fulfill({ json: {} });
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!url.href.startsWith(origin)) return route.abort();
      if (url.pathname === '/_next/image') return route.fulfill({ contentType: 'image/jpeg', body: await readFile(`public${river.photoUrl}`) });
      return route.fallback();
    });
    await page.goto(`${origin}/find-float?river=eleven-point`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Find floats', exact: true }).click();
    const cards = page.locator('article[id^="float-result-"]');
    await cards.first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const loading = page.getByRole('region', { name: 'Eleven Point River: loading the river' });
    await loading.waitFor();
    await page.waitForFunction(() => document.querySelector('section[aria-busy="true"]')?.getBoundingClientRect().height > 200);
    const loadingHeight = (await loading.boundingBox()).height;
    releasePoints();
    const strip = page.locator('#river-strip');
    await strip.locator('[data-route-id="route-6"]').waitFor();
    const loadedHeight = (await strip.boundingBox()).height;
    assert(Math.abs(loadingHeight - loadedHeight) <= 1, `${width}: placeholder ${loadingHeight} vs strip ${loadedHeight}`);
    assert.equal(await cards.count(), 6);
    const order = await cards.evaluateAll(nodes => nodes.map(node => node.id));
    assert.equal(await strip.locator('[data-river-overview]').count(), 0);
    assert.equal(await strip.getByRole('button', { name: 'Selected float', exact: true }).getAttribute('aria-disabled'), 'true');
    await strip.locator('[data-route-id="route-2"]').click();
    assert.equal(await strip.locator('[data-route-id="route-2"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await cards.evaluateAll(nodes => nodes.map(node => node.id)), order, 'selection preserves card order');
    assert.equal(await strip.getByRole('link', { name: /Plan this float/ }).count(), 0);
    assert.equal(await strip.locator('[data-route-state="other"]').first().getAttribute('stroke-opacity'), '0.18');
    const selectedCard = page.locator('#float-result-route-2');
    await strip.getByRole('button', { name: 'View float from Thomasville to Cane Bluff' }).click();
    assert(await selectedCard.evaluate(node => node === document.activeElement), 'View float focuses the corresponding card');
    assert(Math.abs((await selectedCard.boundingBox()).y - 96) <= 1, 'reduced-motion jump lands immediately below the sticky header');
    assert.match(await selectedCard.innerText(), /Typical estimate/);
    assert.match(await selectedCard.innerText(), /Expect shallow stretches/);
    assert.match(await selectedCard.innerText(), /Includes private access/);
    assert.equal(await selectedCard.getByRole('link', { name: /Plan this float/ }).count(), 1);
    await selectedCard.getByRole('button', { name: 'Float 2 On the river', exact: true }).click();
    assert(await strip.locator('[data-route-id="route-2"]').evaluate(node => node === document.activeElement), 'card action focuses the route callout');
    await strip.getByRole('button', { name: 'Selected float', exact: true }).click();
    await strip.locator('[data-river-overview]').waitFor();
    await strip.getByRole('button', { name: 'All floats', exact: true }).click();
    assert.equal(await strip.locator('[data-river-overview]').count(), 0);
    await page.getByLabel('Sort').selectOption('longest');
    const selectedNumber = await strip.locator('[data-route-id="route-2"]').innerText();
    assert.notEqual(selectedNumber.trim(), '2', 'sort actually renumbers the selected route');
    assert.notDeepEqual(await cards.evaluateAll(nodes => nodes.map(node => node.id)), order, 'sort changes card order');
    assert.equal(await strip.locator('[data-route-id="route-2"]').getAttribute('aria-pressed'), 'true');
    assert.match(await selectedCard.getByRole('heading').innerText(), new RegExp(`Float ${selectedNumber.trim()}:`));
    await strip.getByRole('button', { name: 'View float from Thomasville to Cane Bluff' }).click();
    assert(await selectedCard.evaluate(node => node === document.activeElement), 'sort retains logical selection and card target');
    assert(Math.abs((await selectedCard.boundingBox()).y - 96) <= 1, 'renumbered card jump is immediate with reduced motion');
    const info = selectedCard.getByRole('button', { name: 'About float times', exact: true });
    const target = await info.boundingBox();
    assert(target.width >= 44 && target.height >= 44, 'quiet info glyph retains touch target');
    assert.equal(await info.locator('svg').getAttribute('width'), '16');
    await info.click();
    await page.getByRole('dialog', { name: 'About float times' }).waitFor();
    await page.keyboard.press('Escape');
    assert(await info.evaluate(node => node === document.activeElement));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no horizontal overflow`);
    await strip.getByRole('heading').click();
    await page.addStyleTag({ content: 'nextjs-portal { display:none }' });
    await strip.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/results-${width}.png`, fullPage: true });
    await strip.screenshot({ path: `${out}/strip-${width}.png` });
    await selectedCard.screenshot({ path: `${out}/selected-card-${width}.png` });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const contrast = await strip.getByRole('button', { name: 'View float from Thomasville to Cane Bluff' }).evaluate(button => {
      const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const ink = luminance(getComputedStyle(button).color);
      const background = luminance(getComputedStyle(button.parentElement).backgroundColor);
      return (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05);
    });
    assert(contrast >= 4.5, `${width}: dark-mode text action contrast ${contrast}`);
    await page.screenshot({ path: `${out}/results-${width}-dark.png`, fullPage: true });
    await strip.screenshot({ path: `${out}/strip-${width}-dark.png` });
    console.log(`PASS ${width}px: loading height, selection, card focus, sort, zoom, facts, info target, overflow`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'no browser exceptions');
} catch (error) {
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
