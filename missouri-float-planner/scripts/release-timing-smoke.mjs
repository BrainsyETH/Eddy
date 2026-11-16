// Local fixture-only checks of the timing model, completed-release playback and
// publication states. --serve keeps the guarded fixture open for visual review.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = 3141;
const origin = 'http://127.0.0.1:' + port;
const route = resolve('src/app/dam-layout-check');
const out = process.env.RELEASE_TIMING_OUTPUT || '/tmp/eddy-release-timing';
const serveOnly = process.argv.includes('--serve');
// A tall element screenshot can pull the site's sticky header into the middle
// of the image. Hide it only for the capture, not for interaction checks.
const screenshotStyle = 'header.sticky, nextjs-portal { visibility: hidden !important; }';
const capture = (element, name) => element.screenshot({ path: out + '/' + name + '.png', style: screenshotStyle });
const compared = {
  id: 'compared', kind: 'compared', peakCfs: 13200,
  releasedAt: '2026-11-12T20:30:00Z', estimateAt: '2026-11-13T09:30:00Z',
  earlyAt: '2026-11-13T07:30:00Z', lateAt: '2026-11-13T11:30:00Z', roseAt: '2026-11-13T09:45:00Z',
};
const waiting = { id: 'waiting', kind: 'waiting', releasedAt: '2026-11-13T20:30:00Z' };
const notCompared = { id: 'unmatched', kind: 'not-compared', releasedAt: '2026-11-11T20:30:00Z', why: 'The gauge record had a gap' };
const emptyTally = { compared: 0, insideWindow: 0, within2Hours: 0, notCompared: 0, waiting: 0, noEstimate: [] };
const variants = {
  results: { results: [waiting, compared, notCompared], tally: { ...emptyTally, compared: 1, insideWindow: 1, within2Hours: 1, waiting: 1, notCompared: 1 } },
  empty: { results: [], tally: emptyTally },
  waiting: { results: [waiting], tally: { ...emptyTally, waiting: 1 } },
  unmatched: { results: [notCompared], tally: { ...emptyTally, notCompared: 1 } },
  early: { results: [{ ...compared, roseAt: '2026-11-13T05:30:00Z' }], tally: { ...emptyTally, compared: 1 } },
  late: { results: [{ ...compared, roseAt: '2026-11-14T04:30:00Z', peakCfs: null }], tally: { ...emptyTally, compared: 1 } },
  unavailable: null,
};
let server, browser, activePage, cleanupPromise;
let log = '';
assert(!existsSync(route), 'Refusing to overwrite an existing fixture route');
function cleanup() {
  return cleanupPromise ??= (async () => {
    try { await rm(route, { recursive: true, force: true }); }
    finally { server?.kill('SIGTERM'); await browser?.close(); }
  })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
});
try {
  await mkdir(route, { recursive: true });
  await mkdir(out, { recursive: true });
  await writeFile(route + '/page.tsx', `import { notFound } from 'next/navigation';
import ReleaseTimingIntro from '@/components/release-timing/ReleaseTimingIntro';
import ReleaseTimingReport from '@/components/release-timing/ReleaseTimingReport';
import ResearchLog from '@/components/release-timing/ResearchLog';
import type { PublicResults } from '@/lib/arrival-trial/public-results';
const variants: Record<string, PublicResults | null> = ` + JSON.stringify(variants) + `;
export default async function Page({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_RELEASE_TIMING_SMOKE !== '1') notFound();
  const { variant = 'results' } = await searchParams;
  const results = variants[variant] ?? null;
  return <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:px-8" data-timing-check><ReleaseTimingIntro results={results} /><ReleaseTimingReport results={results} /><ResearchLog results={results} /></main>;
}`);
  assert.equal(spawnSync('git', ['check-ignore', '--quiet', route + '/page.tsx']).status, 0, 'Fixture must stay out of Git');
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, EDDY_RELEASE_TIMING_SMOKE: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { log += chunk; if (serveOnly) process.stdout.write(chunk); });
  server.stderr.on('data', (chunk) => { log += chunk; if (serveOnly) process.stderr.write(chunk); });
  const url = origin + '/dam-layout-check';
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error(log.slice(-4000));
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (response.ok) { ready = true; break; } } catch {}
    await new Promise((done) => setTimeout(done, 1000));
  }
  assert(ready, 'Fixture did not start: ' + log.slice(-4000));
  if (serveOnly) {
    console.log('Ready for visual review: ' + url);
    await new Promise(() => {});
  }
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const errors = [];
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: width < 900 });
    activePage = page;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (request) => new URL(request.request().url()).origin === origin ? request.continue() : request.abort());
    await page.goto(url, { waitUntil: 'networkidle' });
    const intro = page.locator('[data-timing-check] > header');
    const map = page.locator('#release-map');
    const slider = map.getByRole('slider');
    const sizes = map.getByRole('group', { name: 'Release size, in generators', exact: true });
    // The opening says what the page is before anything interactive.
    assert.match(await intro.innerText(), /What we measured[\s\S]*695 releases[\s\S]*What we found[\s\S]*13¼ hours[\s\S]*What we’re testing now[\s\S]*1 of 60[\s\S]*What this isn’t[\s\S]*forecast/);
    // The map's heading is the answer, and it is the gauge's: the one measured place.
    assert.match(await map.getByRole('heading', { level: 2 }).innerText(), /A 4-generator release takes about 12¾ hours to reach the gauge near Norfork/);
    assert.match(await map.innerText(), /Not live/);
    assert.equal(await map.getByLabel('Location').count(), 0, 'no access-point picker');
    assert.doesNotMatch(await map.innerText(), /8 in 10|All risen|Assumed pace|Oct 24|of 93|hr \d+ min–/);
    assert.equal(await map.locator('[data-timing-band]').count(), 1);
    assert.match(await map.getByRole('status').innerText(), /Before the typical window/);
    // Upstream access points get one rounded time each, labelled unmeasured, and no window.
    const guide = map.getByRole('complementary', { name: 'Rough guide upstream', exact: true });
    const rough = guide.getByRole('list');
    assert.match(await guide.innerText(), /Rough guide upstream\s+Not measured/);
    assert.equal(await guide.getByRole('button').count(), 0, 'the rough guide is a list, not a control');
    assert.match(await rough.innerText(), /Cotter\s+about 5 hours/);
    assert.match(await rough.innerText(), /Buffalo City\s+about 9½ hours/);
    assert.doesNotMatch(await rough.innerText(), /Calico Rock|Gauge|min/);
    // One size control drives the answer, the rough guide and the chart together.
    await sizes.getByRole('button', { name: '1', exact: true }).click();
    assert.match(await map.getByRole('heading', { level: 2 }).innerText(), /A 1-generator release takes about 15¾ hours/);
    assert.match(await rough.innerText(), /Cotter\s+about 6½ hours/);
    assert.equal(await page.locator('#by-size').getByRole('button', { name: 'About 1 generator', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.locator('#by-size').getByRole('button', { name: '5 or more generators', exact: true }).click();
    assert.match(await map.getByRole('heading', { level: 2 }).innerText(), /A release of 5 or more generators takes about 11¾ hours/);
    await sizes.getByRole('button', { name: '4', exact: true }).click();
    await map.getByRole('button', { name: 'Restart from the dam' }).click();
    assert.equal(await slider.inputValue(), '0');
    await map.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('#release-map input[type=range]').value) > 0);
    await map.getByRole('button', { name: 'Pause', exact: true }).click();
    await slider.focus();
    await slider.press('End');
    assert.match(await map.getByRole('status').innerText(), /Past the typical window/);
    await slider.fill(String(Math.round(12.75 * 12)));
    assert.match(await map.getByRole('status').innerText(), /Within the typical window/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': no page overflow');
    await capture(intro, 'intro-' + width);
    await capture(map, 'map-' + width);
    // The live test shows its progress toward the 60 results the study needs.
    const close = page.locator('#how-close');
    assert.match(await close.innerText(), /1 of 60 results in before we call it\. Also 1 waiting, 1 couldn’t be compared\./);
    assert.equal(await close.locator('[data-slot="inside"]').count(), 2, 'one filled slot and its key');
    assert.equal(await close.locator('[role="img"] [data-slot]').count(), 60);
    assert.match(await close.innerText(), /Released in the 2 PM hour/);
    assert.doesNotMatch(await close.innerText(), /2:30 PM/);
    await capture(close, 'results-' + width);
    await page.getByRole('button', { name: 'Starting release', exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': baseline chart fits');
    await capture(page.locator('#when-it-changes'), 'baseline-' + width);
    const log = page.locator('#research-log');
    assert.match(await log.innerText(), /Nov 13, 2026\s+Started the live test[\s\S]*First result: the gauge rose inside the estimated window[\s\S]*Next\s+Releases that start slowly/);
    await capture(log, 'log-' + width);
    await close.getByRole('button', { name: 'Replay release', exact: true }).click();
    await map.getByRole('button', { name: 'Pause', exact: true }).click();
    assert.match(await map.innerText(), /Recorded release · Nov 12, 2026/);
    assert.match(await map.getByRole('heading', { level: 2 }).innerText(), /This release took about 13¼ hours to reach the gauge near Norfork/);
    assert.equal(await map.locator('[data-timing-band]').count(), 0, 'An observed release never replays a cohort median');
    assert.equal(await sizes.count(), 0);
    await slider.fill('159');
    assert.match(await map.getByRole('status').innerText(), /At the recorded rise · Fri, Nov 13, 3:45 AM CT/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': recorded replay fits');
    await capture(map, 'replay-' + width);
    await map.getByRole('button', { name: 'Back to timing' }).click();
    assert.match(await map.innerText(), /Not live/);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  activePage = page;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (request) => new URL(request.request().url()).origin === origin ? request.continue() : request.abort());
  for (const [variant, text] of [['empty', 'No results yet'], ['waiting', 'Waiting for gauge readings'], ['unmatched', 'Couldn’t compare'], ['unavailable', 'Results can’t be loaded'], ['early', 'before the window'], ['late', 'after the window']]) {
    await page.goto(url + '?variant=' + variant, { waitUntil: 'networkidle' });
    assert((await page.locator('#how-close').innerText()).includes(text), variant);
    if (variant === 'unavailable') {
      assert.equal(await page.locator('#how-close [data-slot]').count(), 0, 'no progress shown when results cannot be read');
      assert.match(await page.locator('[data-timing-check] > header').innerText(), /We judge it after 60 results/);
    }
    if (variant === 'empty') assert.match(await page.locator('#how-close').innerText(), /0 of 60 results in/);
    if (['waiting', 'unmatched', 'unavailable', 'empty'].includes(variant)) assert.equal(await page.getByRole('button', { name: 'Replay release' }).count(), 0);
    if (variant === 'late') {
      await page.getByRole('button', { name: 'Replay release' }).click();
      const map = page.locator('#release-map');
      await map.getByRole('button', { name: 'Pause', exact: true }).click();
      assert.match(await map.getByRole('heading', { level: 2 }).innerText(), /This release took about 32 hours/);
      assert.equal(Number(await map.getByRole('slider').getAttribute('max')), 432, 'a late rise stays reachable');
    }
    await capture(page.locator('#how-close'), 'state-' + variant);
  }
  assert.deepEqual(errors, []);
  console.log('PASS timing model, observed release, controls, viewport and publication-state checks');
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
    await writeFile(out + '/failure.txt', await activePage.locator('body').innerText().catch(() => '')).catch(() => {});
  }
  await writeFile(out + '/server.log', log).catch(() => {});
  throw error;
} finally { await cleanup(); }
