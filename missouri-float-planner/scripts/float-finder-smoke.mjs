// Exercise the real finder with intercepted API responses, never production data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:3141';
const out = process.env.FINDER_SMOKE_OUTPUT || '/tmp/eddy-float-finder';
const rivers = [
  { id: 'r-current', slug: 'current', name: 'Current River', state: 'MO', description: 'Spring-fed water, gravel bars, and a day well spent in the Ozarks.', photoUrl: '/share/river-current-v2.jpg' },
  { id: 'r-buffalo', slug: 'buffalo', name: 'Buffalo River', state: 'AR', description: 'Explore the Buffalo River.', photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Misty_Bluff_along_the_Buffalo_River.jpg?width=1200' },
  { id: 'r-eleven', slug: 'eleven-point', name: 'Eleven Point River', state: 'MO', description: 'Explore the Eleven Point River.', photoUrl: '/images/river-guides/north-fork-white-card.webp' },
].map(r => ({ ...r, accessPointCount: 5, lengthMiles: 90, path: `/rivers/${r.state === 'MO' ? 'missouri' : 'arkansas'}/${r.slug}` }));
function responseFor(input, timestamp = new Date().toISOString()) {
  const river = rivers.find(r => r.slug === input.river) || rivers[0];
  const option = {
    id: 'route-a', riverId: river.id, riverSlug: river.slug, riverName: river.name,
    putIn: { id: 'akers', name: 'Akers Ferry', isPublic: true }, takeOut: { id: 'pulltite', name: 'Pulltite', isPublic: true },
    vesselTypeId: `${input.vesselType}-id`, minutes: input.targetHours * 60, timeRange: { min: (input.targetHours - 1) * 60, max: (input.targetHours + 1) * 60 },
    distanceMiles: 9.5, conditionCode: 'flowing', conditionLabel: 'Flowing', conditional: false, cautions: [], relation: 'match',
    estimateBasis: 'current_conditions', observedAt: timestamp, formattedTime: '', url: '', description: 'A spring-fed stretch with gravel bars along the way.',
    photo: { url: '/share/river-current-v2.jpg', caption: 'Current River — fixture image' },
  };
  return { matches: [option, { ...option, id: 'route-b', putIn: { ...option.putIn, name: 'Cedar Grove' }, takeOut: { ...option.takeOut, name: 'Akers Ferry' }, photo: null, conditionCode: 'low', conditionLabel: 'Low', conditional: true, cautions: ['Expect shallow stretches.'], estimateBasis: 'typical', observedAt: null }], alternatives: [], partial: false, failed: 0, evaluated: 2, estimatedAt: timestamp };
}
let server, browser, serverLog = '';
const errors = [];
try {
  await mkdir(out, { recursive: true });
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3141'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', FLOAT_SEARCH_ENABLED: 'true', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', d => { serverLog += d; process.stdout.write(d); });
  server.stderr.on('data', d => { serverLog += d; process.stderr.write(d); });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(serverLog.slice(-5000));
    try { if ((await fetch(`${origin}/find-float`, { signal: AbortSignal.timeout(5000) })).ok) { ready = true; break; } } catch {}
    await new Promise(done => setTimeout(done, 300));
  }
  assert(ready, serverLog.slice(-5000));
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  for (const width of [1440, 1024, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', geolocation: { latitude: 37.123456, longitude: -91.987654 }, permissions: ['geolocation'] });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const searches = [];
    let mode = 'normal', townFailure = false, riverFailure = false;
    let held, releaseHeld;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/rivers') return route.fulfill({ status: riverFailure ? 503 : 200, json: { rivers } });
      if (path === '/api/float-search/places') {
        const q = route.request().postDataJSON().query;
        return route.fulfill({ status: townFailure ? 503 : 200, json: { places: q.toLowerCase().includes('salem') ? [{ id: 'salem', name: 'Salem, Missouri', near: { lat: 37.65, lng: -91.54 } }] : [] } });
      }
      if (path === '/api/float-search') {
        const input = route.request().postDataJSON(); searches.push(input);
        const selectedMode = mode;
        if (selectedMode === 'held') { held?.(); await new Promise(resolve => { releaseHeld = resolve; }); }
        if (selectedMode === 'error') return route.fulfill({ status: 503, json: { error: 'The search could not finish. Please try again.' } });
        const data = responseFor(input, selectedMode === 'expires' ? new Date(Date.now() - 30 * 60_000 + 4000).toISOString() : undefined);
        if (selectedMode === 'empty') { data.matches = []; data.alternatives = []; }
        if (selectedMode === 'partial') { data.partial = true; data.failed = 1; data.alternatives = [{ ...data.matches.pop(), relation: 'longer' }]; }
        try { return await route.fulfill({ json: data }); } catch { /* Canceled by a newer selection. */ }
      }
      return route.fulfill({ json: {} });
    });
    // Avoid third-party image/network dependencies while preserving local photos.
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'commons.wikimedia.org') return route.fulfill({ contentType: 'image/webp', body: await readFile('public/images/river-guides/buffalo-card.webp') });
      if (!url.href.startsWith(origin)) return route.abort();
      if (url.pathname === '/_next/image') {
        const image = url.searchParams.get('url');
        if (image?.startsWith('/') && !image.includes('..')) return route.fulfill({ contentType: image.endsWith('.webp') ? 'image/webp' : 'image/jpeg', body: await readFile(`public${image}`) });
        return route.fulfill({ contentType: 'image/png', body: await readFile('public/icons/eddy-wave.png') });
      }
      return route.fallback();
    });
    await page.goto(`${origin}/find-float`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'A little river inspiration' }).waitFor();
    await page.getByRole('button', { name: 'Choose river : Current River' }).waitFor();
    const search = page.getByRole('button', { name: 'Find routes', exact: true });
    assert(await search.isDisabled());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: initial overflow`);
    assert(await page.locator('[role="group"] button').evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth)), `${width}: preference labels must not clip`);
    await page.addStyleTag({ content: 'nextjs-portal { display:none }' });
    await page.screenshot({ path: `${out}/initial-${width}.png`, fullPage: true });
    const destination = page.getByLabel('Town or river', { exact: true });
    await destination.fill('Current');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await destination.inputValue(), 'Current River');
    assert.equal(new URL(page.url()).searchParams.get('river'), 'current');
    await page.getByRole('button', { name: '4 hr', exact: true }).click();
    await search.click();
    await page.getByRole('heading', { name: '2 routes for your day' }).waitFor();
    assert.equal(searches.at(-1).targetHours, 4);
    assert.equal(searches.at(-1).publicOnly, true);
    assert.equal(await page.getByText('Expect shallow stretches.').count(), 1);
    assert.equal(await page.getByText('Typical conditions', { exact: true }).count(), 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: results overflow`);
    await page.screenshot({ path: `${out}/results-${width}.png`, fullPage: true });
    // Dirty results stay in place and retain the submitted values.
    await page.getByRole('button', { name: 'kayak', exact: true }).click();
    await page.getByText('Your choices changed. Update routes to see matching floats.').waitFor();
    assert.equal(await page.getByRole('heading', { name: /Akers Ferry.*Pulltite/ }).count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Build this route' }).count(), 0);
    mode = 'error';
    await page.getByRole('button', { name: 'Update routes', exact: true }).click();
    await page.locator('p[role="alert"]').waitFor();
    assert.equal(await page.getByRole('heading', { name: /Akers Ferry.*Pulltite/ }).count(), 1);
    mode = 'normal';
    await page.getByRole('button', { name: 'Update routes', exact: true }).click();
    const plannerLink = page.getByRole('link', { name: 'Build this route' }).first();
    await plannerLink.waitFor();
    assert.equal(await plannerLink.getAttribute('href'), '/plan?river=current&putIn=akers&takeOut=pulltite&vessel=kayak-id');
    // Entering an unselected place cannot accidentally search the old river.
    await destination.fill('Salem');
    assert(await page.getByRole('button', { name: 'Update routes', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Salem, Missouri', exact: true }).click();
    await page.getByLabel('Search radius').selectOption('50');
    await page.getByRole('button', { name: 'Update routes', exact: true }).click();
    await plannerLink.waitFor();
    assert.deepEqual(searches.at(-1).near, { lat: 37.65, lng: -91.54 });
    assert.equal(searches.at(-1).river, undefined);
    assert.equal(searches.at(-1).radiusMiles, 50);
    assert(!page.url().includes('37.65'));
    await page.getByRole('button', { name: 'Use my location', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh location', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Update routes', exact: true }).click();
    await plannerLink.waitFor();
    assert.deepEqual(searches.at(-1).near, { lat: 37.12, lng: -91.99 });
    // River selection must drop both the old location and its radius control.
    await destination.fill('Buffalo');
    await page.getByRole('button', { name: 'Buffalo River', exact: true }).click();
    assert.equal(await page.getByLabel('Search radius').count(), 0);
    mode = 'partial';
    await page.getByRole('button', { name: 'Update routes', exact: true }).click();
    await page.getByText(/This is a partial search/).waitFor();
    assert.equal(searches.at(-1).near, undefined);
    await page.getByRole('heading', { name: 'A little shorter or longer' }).waitFor();
    if (width === 1440) {
      // Older responses cannot overwrite more recent input/results.
      mode = 'held';
      const started = new Promise(resolve => { held = resolve; });
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await started;
      await page.getByRole('button', { name: '6 hr', exact: true }).click();
      mode = 'normal';
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await page.getByText('About 6 hours ·', { exact: false }).waitFor();
      releaseHeld();
      assert.equal(searches.at(-1).targetHours, 6);
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await page.screenshot({ path: `${out}/results-dark.png`, fullPage: true });
      await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
      mode = 'empty';
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await page.getByText(/No duration matches/).waitFor();
      mode = 'expires';
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await page.getByText(/These results have expired/).waitFor({ timeout: 10000 });
      assert.equal(await page.getByRole('link', { name: 'Build this route' }).count(), 0);
      townFailure = true;
      await destination.fill('Salem');
      await page.getByText('Town search is unavailable. Choose a river or use your location.').waitFor();
      await page.keyboard.press('Escape');
      // Force the permission-denied callback; Chromium may reuse a cached fix
      // after permissions are revoked inside a running automated context.
      await page.evaluate(() => {
        navigator.geolocation.getCurrentPosition = (_success, failure) => {
          failure?.({ code: 1, message: 'Permission denied' });
        };
      });
      await page.getByRole('button', { name: 'Use my location', exact: true }).click();
      await page.locator('p[role="alert"]').waitFor();
      riverFailure = true;
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'There’s a float for your kind of day.' }).waitFor();
    }
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => /float-search/.test(k))), ['eddy.float-search.boat.v1']);
    console.log(`PASS ${width}px: discovery, filters, stale results, errors, location, partial results, planner parameters`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'browser runtime errors');
  console.log(`PASS: screenshots saved in ${out}`);
} catch (error) {
  console.error(serverLog.slice(-5000));
  throw error;
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
