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
  { id: 'r-huzzah', slug: 'huzzah', name: 'Huzzah Creek', state: 'MO', description: 'Explore Huzzah Creek.', photoUrl: '/share/river-current-v2.jpg' },
].map(r => ({ ...r, floatAccessCoordinates: [{ lat: 37.7203, lng: -91.2048 }, { lat: 38.0292, lng: -91.213 }], accessPointCount: 5, lengthMiles: 90, path: `/rivers/${r.state === 'MO' ? 'missouri' : 'arkansas'}/${r.slug}` }));
const featuredFloats = rivers.map((river, index) => ({
  id: `${river.slug}:featured-start:featured-end`, riverSlug: river.slug, riverName: river.name,
  putInId: `featured-start-${index}`, putInName: `Upper ${river.name}`,
  takeOutId: `featured-end-${index}`, takeOutName: `Lower ${river.name}`,
  tagline: ['Springs and gravel bars', 'A day beneath the bluffs', 'Quiet water through the forest', 'An easy afternoon'][index],
  distanceMiles: 7.5 + index, difficulty: 'I',
  durationFormatted: index === 3 ? null : '3–5 hours', durationUnavailableReason: index === 3 ? 'regulated' : null,
  photoUrl: index === 0 ? '/missing-featured-photo.jpg' : river.photoUrl,
  photoFallbackUrls: index === 0 ? ['/share/river-current-v2.jpg'] : [],
}));
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
  server = spawn(process.execPath, ['scripts/conditions-smoke-server.mjs', '3141'], {
    env: { ...process.env, EDDY_CONDITIONS_SMOKE: '1', NEXT_TELEMETRY_DISABLED: '1', FLOAT_SEARCH_ENABLED: 'true', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' },
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
    let mode = 'normal', townFailure = false, riverFailure = false, featuredMode = 'normal';
    let held, releaseHeld;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/favorite-floats') {
        assert.equal(new URL(route.request().url()).searchParams.get('v'), '2');
        return route.fulfill({ status: featuredMode === 'error' ? 503 : 200, json: { floats: featuredMode === 'empty' ? [] : featuredFloats } });
      }
      if (path === '/api/rivers') return route.fulfill({ status: riverFailure ? 503 : 200, json: { rivers } });
      if (path === '/api/float-search/places') {
        const q = route.request().postDataJSON().query;
        const places = q.toLowerCase().includes('salem') ? [{ id: 'salem', name: 'Salem, Missouri', near: { lat: 37.65, lng: -91.54 } }]
          : q.toLowerCase().includes('current') ? [{ id: 'current-town', name: 'Current, Missouri', near: { lat: 37.65, lng: -91.54 } }] : [];
        return route.fulfill({ status: townFailure ? 503 : 200, json: { places } });
      }
      if (path === '/api/float-search') {
        const input = route.request().postDataJSON(); searches.push(input);
        const selectedMode = mode;
        if (selectedMode === 'held') { held?.(); await new Promise(resolve => { releaseHeld = resolve; }); }
        if (selectedMode === 'error') return route.fulfill({ status: 503, json: { error: 'The search could not finish. Please try again.' } });
        const data = responseFor(input, selectedMode === 'expires' ? new Date(Date.now() - 30 * 60_000 + 4000).toISOString() : undefined);
        if (['empty', 'too-low', 'private'].includes(selectedMode)) { data.matches = []; data.alternatives = []; }
        if (selectedMode === 'too-low') { data.emptyReason = 'too_low'; data.evaluated = 0; }
        if (selectedMode === 'private') { data.emptyReason = 'public_access'; data.evaluated = 0; }
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
        if (image === '/missing-featured-photo.jpg') return route.fulfill({ status: 404, body: '' });
        if (image?.startsWith('/') && !image.includes('..')) return route.fulfill({ contentType: image.endsWith('.webp') ? 'image/webp' : 'image/jpeg', body: await readFile(`public${image}`) });
        return route.fulfill({ contentType: 'image/png', body: await readFile('public/icons/eddy-wave.png') });
      }
      return route.fallback();
    });
    await page.goto(`${origin}/find-float`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Floats', level: 1, exact: true }).waitFor();
    const featured = page.getByRole('region', { name: 'Featured Floats', exact: true });
    await featured.getByRole('link').first().waitFor();
    assert.equal(await featured.getByRole('article').count(), 3);
    assert.equal(await page.getByRole('navigation', { name: 'Floats', exact: true }).count(), 0);
    if (width >= 1024) {
      assert.deepEqual(await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link').allTextContents(), ['Map', 'Conditions', 'Floats', 'Guides']);
    } else {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      assert.deepEqual(await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link').allTextContents(), ['Map', 'Conditions', 'Floats', 'Guides', 'Get the App']);
      await page.getByRole('button', { name: 'Close menu', exact: true }).click();
    }
    assert.equal(await page.getByRole('link', { name: 'Build a Route', exact: true }).getAttribute('href'), '/plan');
    await page.getByRole('button', { name: 'Show all floats', exact: true }).click();
    assert.equal(await featured.getByRole('article').count(), 4);
    await featured.getByText('Time varies with dam releases', { exact: false }).waitFor();
    const currentFeatured = featured.getByRole('link', { name: 'View route: Upper Current River to Lower Current River on Current River' });
    assert.equal(await currentFeatured.getAttribute('href'), '/plan?river=current&putIn=featured-start-0&takeOut=featured-end-0');
    await page.waitForFunction(() => { const image = document.querySelector('a[href="/plan?river=current&putIn=featured-start-0&takeOut=featured-end-0"] img'); return image?.complete && image.naturalWidth > 0 && !image.src.includes('missing-featured-photo'); });
    assert(!(await currentFeatured.locator('img').getAttribute('src')).includes('missing-featured-photo'), 'failed route photo uses its fallback');
    await page.getByRole('button', { name: 'Show fewer', exact: true }).click();
    assert.equal(await featured.getByRole('article').count(), 3);
    assert.equal(await page.getByText('Your next day outside', { exact: true }).count(), 0);
    const search = page.getByRole('button', { name: 'Find routes', exact: true });
    assert(await search.isDisabled());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: initial overflow`);
    assert(await page.locator('[role="group"] button').evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth)), `${width}: preference labels must not clip`);
    await page.addStyleTag({ content: 'nextjs-portal { display:none }' });
    await page.screenshot({ path: `${out}/initial-${width}.png`, fullPage: true });
    const destination = page.getByRole('combobox', { name: 'Where', exact: true });
    const suggestions = page.getByRole('listbox', { name: 'Destinations' });
    assert.equal(await destination.getAttribute('aria-autocomplete'), 'list');
    const assertActive = async name => {
      assert(await destination.evaluate(input => input === document.activeElement), 'arrow navigation keeps focus in the input');
      const selected = suggestions.getByRole('option', { selected: true });
      assert.equal(await selected.count(), 1);
      assert.equal((await selected.innerText()).trim(), name);
      assert.equal(await destination.getAttribute('aria-activedescendant'), await selected.getAttribute('id'));
      assert.equal(await destination.getAttribute('aria-controls'), await suggestions.getAttribute('id'));
    };
    await destination.click();
    assert.equal(await destination.getAttribute('aria-expanded'), 'true');
    const lastSuggestion = suggestions.getByRole('option').last();
    await lastSuggestion.scrollIntoViewIfNeeded();
    assert(await lastSuggestion.evaluate(option => {
      const box = option.getBoundingClientRect();
      return option.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }), 'the compact finder must not clip its destination menu');
    assert(await suggestions.getByRole('option').evaluateAll(options => options.every(option => option.tabIndex === -1)));
    await page.keyboard.press('ArrowDown');
    await assertActive('Current River');
    await page.keyboard.press('ArrowDown');
    await assertActive('Buffalo River');
    await page.keyboard.press('ArrowUp');
    await assertActive('Current River');
    await page.keyboard.press('ArrowUp');
    await assertActive('Huzzah Creek');
    await page.keyboard.press('Escape');
    assert.equal(await destination.getAttribute('aria-expanded'), 'false');
    assert.equal(await destination.getAttribute('aria-activedescendant'), null);
    assert.equal(await destination.inputValue(), '');
    await page.keyboard.press('ArrowUp');
    await assertActive('Huzzah Creek');
    await page.keyboard.press('Tab');
    assert.equal(await destination.getAttribute('aria-expanded'), 'false');
    assert(await page.getByRole('button', { name: 'Day trip', exact: true }).evaluate(button => button === document.activeElement), 'Tab skips suggestions without selecting');
    assert(await search.isDisabled());
    await destination.fill('No such destination');
    await page.getByText('No matches. Try adding a state.').waitFor();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await destination.getAttribute('aria-activedescendant'), null);
    assert.equal(searches.length, 0, 'Enter without an option cannot submit an unresolved destination');
    await destination.fill('Current');
    await page.keyboard.press('ArrowDown');
    await assertActive('Current River');
    // Async town suggestions cannot steal the active river; arrows cross groups.
    await page.getByRole('option', { name: 'Current, Missouri', exact: true }).waitFor();
    await assertActive('Current River');
    await page.keyboard.press('ArrowDown');
    await assertActive('Current, Missouri');
    await page.keyboard.press('ArrowUp');
    await assertActive('Current River');
    await page.screenshot({ path: `${out}/destination-${width}.png`, fullPage: true });
    await page.keyboard.press('Enter');
    assert.equal(await destination.inputValue(), 'Current River');
    assert.equal(await destination.getAttribute('aria-expanded'), 'false');
    assert.equal(await destination.getAttribute('aria-activedescendant'), null);
    assert.equal(new URL(page.url()).searchParams.get('river'), 'current');
    await page.getByLabel('Time on the river', { exact: true }).selectOption('4');
    mode = 'held';
    const initialStarted = new Promise(resolve => { held = resolve; });
    await search.click();
    await initialStarted;
    const loading = page.getByRole('status').filter({ hasText: 'Eddy’s reading the waters' });
    await loading.waitFor();
    await loading.locator('img').evaluate(image => image.decode());
    assert(await loading.locator('img').evaluate(image => image.naturalWidth > 0), 'branded loading art is locally available');
    assert(await loading.locator('.motion-safe\\:animate-pulse').evaluateAll(dots => dots.every(dot => getComputedStyle(dot).animationName === 'none')), 'Reduce Motion disables the progress animation');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: loading overflow`);
    await page.screenshot({ path: `${out}/loading-${width}.png`, fullPage: true });
    if (width === 1440) {
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await page.screenshot({ path: `${out}/loading-dark.png`, fullPage: true });
      await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    }
    releaseHeld();
    mode = 'normal';
    await page.getByRole('heading', { name: 'Matching Floats', exact: true }).waitFor();
    assert.equal(searches.at(-1).targetHours, 4);
    assert.equal(searches.at(-1).publicOnly, true);
    assert.equal(await page.getByText('Expect shallow stretches.').count(), 1);
    assert.equal(await page.getByText('Typical estimate', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/Times include ordinary stops|Your choices changed/).count(), 0, 'no inline explainer copy');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: results overflow`);
    await page.screenshot({ path: `${out}/results-${width}.png`, fullPage: true });
    assert.equal(await featured.getByRole('article').count(), 3, 'featured floats remain below matches');
    const matchesBox = await page.getByRole('region', { name: 'Matching Floats', exact: true }).boundingBox();
    const featuredBox = await featured.boundingBox();
    assert(matchesBox.y < featuredBox.y, 'matching floats precede editorial floats');
    // Changed choices dim the results in place; only the button says what to do.
    await page.getByRole('button', { name: 'Canoe', exact: true }).click();
    await page.getByRole('button', { name: 'Update routes', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: /Akers Ferry.*Pulltite/ }).count(), 1);
    assert.equal(await page.locator('[inert]').getByRole('link', { name: /^View float plan/ }).count(), 2, 'stale cards cannot open a plan');
    mode = 'error';
    await page.getByRole('button', { name: 'Update routes', exact: true }).click();
    await page.locator('p[role="alert"]').waitFor();
    assert.equal(await page.getByRole('heading', { name: /Akers Ferry.*Pulltite/ }).count(), 1);
    mode = 'normal';
    await page.getByRole('button', { name: 'Update routes', exact: true }).click();
    const plannerLink = page.locator('section[aria-label="Matching Floats"] > div:not([inert])').getByRole('link', { name: /^View float plan/ }).first();
    await plannerLink.waitFor();
    assert.equal(await page.locator('[inert]').count(), 0);
    assert.equal(await plannerLink.getAttribute('href'), '/plan?river=current&putIn=akers&takeOut=pulltite&vessel=canoe-id');
    // Entering an unselected place cannot accidentally search the old river.
    await destination.fill('Salem');
    assert.equal(await destination.getAttribute('aria-activedescendant'), null, 'typing resets the active option');
    await page.getByRole('option', { name: 'Salem, Missouri', exact: true }).waitFor();
    await page.keyboard.press('ArrowDown');
    await assertActive('Salem, Missouri');
    await page.keyboard.press('Enter');
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
    // A river keeps your own location for drive times but drops the radius.
    await destination.fill('Buffalo');
    await page.getByRole('option', { name: 'Buffalo River', exact: true }).click();
    assert.equal(await page.getByLabel('Search radius').count(), 0);
    assert.equal(await destination.inputValue(), 'Buffalo River · Near you');
    mode = 'partial';
    await page.getByRole('button', { name: 'Update routes', exact: true }).click();
    await page.getByText('Some rivers couldn’t be checked.').waitFor();
    assert.deepEqual(searches.at(-1).near, { lat: 37.12, lng: -91.99 });
    assert.equal(searches.at(-1).river, 'buffalo');
    await page.getByRole('heading', { name: 'Shorter or longer' }).waitFor();
    if (width === 1440) {
      // Older responses cannot overwrite more recent input/results.
      mode = 'held';
      const started = new Promise(resolve => { held = resolve; });
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await started;
      await page.getByLabel('Time on the river', { exact: true }).selectOption('6');
      mode = 'normal';
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await page.getByText('About 6 hours ·', { exact: false }).waitFor();
      releaseHeld();
      assert.equal(searches.at(-1).targetHours, 6);
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      const featuredMetric = featured.getByText(/^\d+(\.\d+)? miles/).first();
      await featuredMetric.scrollIntoViewIfNeeded();
      const metricColors = await featuredMetric.evaluate(metric => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-text-primary)';
        metric.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return { actual: getComputedStyle(metric).color, expected };
      });
      await page.screenshot({ path: `${out}/results-dark.png`, fullPage: true });
      assert.equal(metricColors.actual, metricColors.expected, 'featured distance and time use readable dark-theme text');
      await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
      mode = 'empty';
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await page.getByText(/No routes found with these choices/).waitFor();
      await destination.fill('Huzzah');
      await page.getByRole('option', { name: 'Huzzah Creek', exact: true }).click();
      assert.equal(await page.locator('[inert]').getByRole('button', { name: 'Search nearby rivers', exact: true }).count(), await page.getByRole('button', { name: 'Search nearby rivers', exact: true }).count(), 'dirty results cannot launch recovery for the previous river');
      mode = 'too-low';
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await page.getByText(/Water is currently too low/).waitFor();
      assert.equal(await page.getByRole('link', { name: /^View float plan/ }).count(), 0);
      await page.screenshot({ path: `${out}/huzzah-too-low.png`, fullPage: true });
      mode = 'normal';
      const priorInput = searches.at(-1);
      await page.getByRole('button', { name: 'Search nearby rivers', exact: true }).click();
      await plannerLink.waitFor();
      const nearbyInput = { ...priorInput, near: { lat: 37.87, lng: -91.21 } };
      delete nearbyInput.river;
      assert.deepEqual(searches.at(-1), nearbyInput);
      assert.equal(await destination.inputValue(), 'Near Huzzah Creek');
      assert.equal(new URL(page.url()).searchParams.get('river'), null);
      assert(!page.url().includes('37.87'));
      mode = 'empty';
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await page.getByRole('button', { name: 'Search within 100 miles', exact: true }).waitFor();
      mode = 'normal';
      await page.getByRole('button', { name: 'Search within 100 miles', exact: true }).click();
      await plannerLink.waitFor();
      assert.equal(searches.at(-1).radiusMiles, 100);
      assert.equal(searches.at(-1).vesselType, priorInput.vesselType);
      assert.equal(searches.at(-1).publicOnly, true);
      await destination.fill('Huzzah');
      await page.getByRole('option', { name: 'Huzzah Creek', exact: true }).click();
      mode = 'private';
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await page.getByRole('button', { name: 'Include other accesses', exact: true }).waitFor();
      mode = 'normal';
      await page.getByRole('button', { name: 'Include other accesses', exact: true }).click();
      await plannerLink.waitFor();
      assert.equal(searches.at(-1).publicOnly, false);
      assert.equal(searches.at(-1).river, 'huzzah');
      await page.getByRole('button', { name: /^Filters/ }).click();
      assert.equal(await page.getByRole('button', { name: 'Public access only', exact: true }).getAttribute('aria-pressed'), 'false');
      // Filters and trip length travel in the request body.
      await page.getByRole('button', { name: 'Camping', exact: true }).click();
      await page.getByRole('button', { name: '2 days', exact: true }).click();
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await plannerLink.waitFor();
      assert.deepEqual(searches.at(-1).filters, { camping: true });
      assert.equal(searches.at(-1).days, 2);
      await page.screenshot({ path: `${out}/filters-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      await page.getByRole('button', { name: 'Day trip', exact: true }).click();
      mode = 'expires';
      await page.getByRole('button', { name: 'Update routes', exact: true }).click();
      await page.getByText(/Results expired/).waitFor({ timeout: 10000 });
      assert.equal(await page.getByRole('link', { name: /^View float plan/ }).count(), 0);
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
      await featured.getByRole('link').first().waitFor();
      assert.equal(await featured.getByRole('article').count(), 3, 'curated floats are independent of the river catalogue');
      featuredMode = 'error';
      await page.reload({ waitUntil: 'networkidle' });
      await featured.getByText(/Featured floats couldn’t load/).waitFor();
      assert(await page.getByRole('link', { name: 'Build a Route', exact: true }).isVisible());
      featuredMode = 'normal';
      await featured.getByRole('button', { name: 'Try again', exact: true }).click();
      await featured.getByRole('link').first().waitFor();
      featuredMode = 'empty';
      await page.reload({ waitUntil: 'networkidle' });
      await featured.getByText(/More featured floats are on the way/).waitFor();
      assert.equal(await featured.getByRole('link').count(), 0);
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
