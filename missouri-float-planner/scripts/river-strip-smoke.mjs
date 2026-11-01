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
  conditional: index === 1 || index === 2,
  cautions: index === 1 ? ['Expect shallow stretches.'] : index === 3 ? ['Carry around the fallen tree.'] : [], relation: 'match',
  estimateBasis: index === 1 ? 'typical' : 'current_conditions', observedAt: index === 1 ? null : new Date().toISOString(),
  formattedTime: '', url: '', highlights: ['Restrooms', 'No fees'],
  photo: { url: river.photoUrl, caption: 'Fixture image' },
  // Two routes carry the icon-row facts; the rest stay on the older text highlights.
  // Two routes carry the newer structured facts; the rest stay on the older text highlights and caution strings.
  ...(index === 0 ? {
    endpointFacts: { putIn: { facilities: ['restrooms'], feeRequired: false }, takeOut: { facilities: ['camping', 'parking'], feeRequired: null } },
    outfitters: [
      { id: 'o-1', name: 'Fixture Canoe Rental', offers: ['shuttle', 'kayak'], website: null, phone: '417-555-0100', match: 'run' },
      { id: 'o-2', name: 'Second Outfitter', offers: ['kayak'], website: null, phone: null, match: 'river' },
    ],
    along: [{ kind: 'spring', name: 'Fixture Spring', mile: 54 }, { kind: 'portage', name: 'Fixture Dam', mile: 56 }, { kind: 'access', name: 'Private Bar', mile: 57, isPublic: false }],
    description: 'A fixture description of this float.',
  } : index === 3 ? {
    // A confirmed caution on the water outranks a park-wide notice on the one-line row.
    cautions: ['Carry around the fallen tree.', 'Fixture Road Closed: this regional or park notice has not been matched to the trip\'s exact stretch; verify its relevance.'],
    cautionItems: [
      { scope: 'area', summary: 'Fixture Road Closed', detail: 'Fixture Road Closed: this regional or park notice has not been matched to the trip\'s exact stretch; verify its relevance.' },
      { scope: 'route', summary: 'Fallen tree: portage required', detail: 'Carry around the fallen tree.' },
    ],
  } : index === 1 ? { endpointFacts: { putIn: { facilities: [], feeRequired: null }, takeOut: { facilities: [], feeRequired: null } } } : {}),
}));

async function assertCardLanding(card) {
  const position = await card.evaluate(node => {
    const root = document.documentElement;
    const top = node.getBoundingClientRect().top;
    const documentTop = top + window.scrollY;
    const offset = (parseFloat(getComputedStyle(node).scrollMarginTop) || 0)
      + (parseFloat(getComputedStyle(root).scrollPaddingTop) || 0);
    const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
    const expectedScroll = Math.min(maxScroll, Math.max(0, documentTop - offset));
    return {
      focused: node === document.activeElement,
      top, expectedTop: documentTop - expectedScroll,
      headerBottom: document.querySelector('header')?.getBoundingClientRect().bottom ?? 0,
    };
  });
  assert(position.focused, 'card action transfers keyboard focus');
  assert(Math.abs(position.top - position.expectedTop) <= 1, 'reduced-motion jump lands immediately at the computed scroll margin');
  assert(position.top >= position.headerBottom, 'focused card clears the sticky header');
}

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
    // The client-loaded river name proves hydration has attached the form handlers.
    // Clicking the server-rendered form sooner can trigger a native GET submission.
    await page.waitForFunction(name => document.querySelector('input[role="combobox"]')?.value === name, river.name);
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
    // A low condition alone is not a caution. Either route text or a conditional flag is.
    for (const [id, action] of [['route-1', 'View float'], ['route-3', 'View cautions'], ['route-4', 'View cautions']]) {
      await strip.locator(`[data-route-id="${id}"]`).click();
      const routeAction = strip.getByRole('button', { name: new RegExp(`^${action} (for|from)`) });
      assert.equal((await routeAction.innerText()).trim(), action);
      await routeAction.click();
      await assertCardLanding(page.locator(`#float-result-${id}`));
    }
    assert.equal(await page.locator('#float-result-route-3').getByText('Check route cautions before going.', { exact: true }).count(), 1);
    assert.equal(await strip.getByText('Carry around the fallen tree.', { exact: true }).count(), 0, 'full caution text stays on the card');
    await strip.locator('[data-route-id="route-2"]').click();
    assert.equal(await strip.locator('[data-route-id="route-2"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await cards.evaluateAll(nodes => nodes.map(node => node.id)), order, 'selection preserves card order');
    assert.equal(await strip.getByRole('link', { name: /Plan this float/ }).count(), 0);
    assert.equal(await strip.locator('[data-route-state="other"]').first().getAttribute('stroke-opacity'), '0.18');
    const selectedCard = page.locator('#float-result-route-2');
    await strip.getByRole('button', { name: 'View cautions for Thomasville to Cane Bluff' }).click();
    await assertCardLanding(selectedCard);
    assert.match(await selectedCard.innerText(), /Typical estimate/);
    assert.match(await selectedCard.innerText(), /Expect shallow stretches/);
    assert.match(await selectedCard.innerText(), /Private put-in/);
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
    // Use a different valid margin to prove this check follows the layout, not 96px.
    await selectedCard.evaluate(node => { node.style.scrollMarginTop = `${(parseFloat(getComputedStyle(node).scrollMarginTop) || 0) + 24}px`; });
    await strip.getByRole('button', { name: 'View cautions for Thomasville to Cane Bluff' }).click();
    await assertCardLanding(selectedCard);
    const info = selectedCard.getByRole('button', { name: 'About float times', exact: true });
    const target = await info.boundingBox();
    assert(target.width >= 44 && target.height >= 44, 'quiet info glyph retains touch target');
    assert.equal(await info.locator('svg').getAttribute('width'), '16');
    const caption = await selectedCard.getByText('Typical estimate', { exact: true }).boundingBox();
    const metrics = await info.locator('..').boundingBox();
    const metricCopy = await info.locator('..').locator(':scope > div').boundingBox();
    assert(caption.height < target.height, 'caption keeps its own line height');
    assert(target.x >= metricCopy.x + metricCopy.width - 1, 'info target does not overlap metric text');
    assert(Math.abs(target.y + target.height / 2 - metrics.y - metrics.height / 2) <= 1, 'info target is centered beside the combined metrics');
    assert(metrics.height <= Math.max(metricCopy.height, target.height) + 1, 'info target adds no extra caption row height');
    await info.click();
    await page.getByRole('dialog', { name: 'About float times' }).waitFor();
    await page.keyboard.press('Escape');
    assert(await info.evaluate(node => node === document.activeElement));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no horizontal overflow`);

    // Card facts: labeled highlights that say which end, a scoped one-line caution, the inventory in grouped details.
    const first = page.locator('#float-result-route-1');
    assert.equal(await first.getByText('Fixture Canoe Rental: lists this float', { exact: true }).count(), 1);
    assert.equal(await first.getByText('Camping at take-out', { exact: true }).count(), 1);
    const fourth = page.locator('#float-result-route-4');
    assert.equal(await fourth.getByText('On this float:', { exact: true }).count(), 1, 'the confirmed caution leads');
    assert.equal(await fourth.getByText('Fallen tree: portage required', { exact: true }).count(), 1);
    assert.equal(await fourth.getByText('Area notice:', { exact: true }).count(), 0, 'the park notice waits behind +1');
    assert.equal(await page.locator('#float-result-route-2').getByText('Private put-in: permission required', { exact: true }).count(), 1);
    assert.equal(await first.getByText('417-555-0100').count(), 0, 'phone numbers wait for route details');
    const neighbour = page.locator('#float-result-route-2');
    const before = (await neighbour.boundingBox()).height;
    await fourth.getByRole('button', { name: /On this float/ }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Cautions', 'the caution row opens details at the cautions');
    assert.match(await fourth.innerText(), /Area notice: Fixture Road Closed: this regional or park notice has not been matched/);
    await fourth.getByRole('button', { name: 'Route details', exact: true }).click();
    await first.getByRole('button', { name: 'Route details', exact: true }).click();
    for (const heading of ['Access', 'Along the way', 'Outfitters', 'About this float']) {
      assert.equal(await first.getByRole('heading', { name: heading, exact: true }).count(), 1, `details group: ${heading}`);
    }
    assert.match(await first.innerText(), /Private Bar · Access \(private: permission required\)/);
    assert.match(await first.innerText(), /417-555-0100/);
    assert.equal((await neighbour.boundingBox()).height, before, `${width}: opening one card leaves its neighbour's height alone`);
    await first.getByRole('button', { name: 'Route details', exact: true }).click();

    // In-between accesses: 44px targets; Enter opens, Tab continues inside the card, Escape inside it closes and returns focus.
    const dot = strip.locator('[data-strip-point]').first();
    if (width === 1280) assert(await dot.count(), 'the strip draws in-between accesses');
    if (await dot.count()) {
      const box = await dot.boundingBox();
      assert(box.width >= 44 && box.height >= 44, `${width}: access target is at least 44px`);
      await dot.focus();
      assert.equal(await dot.getAttribute('aria-expanded'), 'false', 'focus alone does not open it');
      await dot.press('Enter');
      const pointCard = page.locator(`[id^="river-strip-point-"]`);
      await pointCard.waitFor();
      assert.match(await pointCard.innerText(), /mi \d/);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: point card stays on screen`);
      await page.keyboard.press('Tab');
      assert(await pointCard.evaluate(node => node.contains(document.activeElement)), `${width}: Tab moves into the open card`);
      await page.keyboard.press('Escape');
      assert.equal(await pointCard.count(), 0);
      await page.waitForFunction(() => document.activeElement?.hasAttribute('data-strip-point'));
    }
    await strip.getByRole('heading').click();
    await page.addStyleTag({ content: 'nextjs-portal { display:none }' });
    await strip.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/results-${width}.png`, fullPage: true });
    await strip.screenshot({ path: `${out}/strip-${width}.png` });
    await selectedCard.screenshot({ path: `${out}/selected-card-${width}.png` });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const contrast = await strip.getByRole('button', { name: 'View cautions for Thomasville to Cane Bluff' }).evaluate(button => {
      const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const ink = luminance(getComputedStyle(button).color);
      const background = luminance(getComputedStyle(button.parentElement).backgroundColor);
      return (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05);
    });
    assert(contrast >= 4.5, `${width}: dark-mode text action contrast ${contrast}`);
    await page.screenshot({ path: `${out}/results-${width}-dark.png`, fullPage: true });
    await strip.screenshot({ path: `${out}/strip-${width}-dark.png` });
    console.log(`PASS ${width}px: loading height, selection, card focus, sort, zoom, facts, point card, info target, overflow`);
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
