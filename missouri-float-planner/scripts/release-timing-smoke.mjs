// Local fixture-only checks of the timing model, completed-release playback and
// publication states. --serve keeps the guarded fixture open for visual review.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = Number(process.env.RELEASE_TIMING_PORT || 3141);
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
  exact: { results: [{ ...compared, roseAt: compared.estimateAt }], tally: { ...emptyTally, compared: 1, insideWindow: 1 } },
  precision: { results: [{ ...compared, estimateAt: '2026-11-13T09:43:45Z', roseAt: '2026-11-13T09:30:00Z' }], tally: { ...emptyTally, compared: 1, insideWindow: 1 } },
  near: { results: [{ ...compared, roseAt: '2026-11-13T09:29:40Z' }], tally: { ...emptyTally, compared: 1, insideWindow: 1 } },
  overnight: { results: [{ ...compared, releasedAt: '2026-11-13T17:30:00Z', estimateAt: '2026-11-14T07:00:00Z', earlyAt: '2026-11-14T05:30:00Z', lateAt: '2026-11-14T08:30:00Z', roseAt: '2026-11-14T07:05:00Z' }], tally: { ...emptyTally, compared: 1, insideWindow: 1 } },
  history: { results: [compared, { ...compared, id: 'earlier', releasedAt: '2026-11-11T20:30:00Z', estimateAt: '2026-11-12T09:30:00Z', earlyAt: '2026-11-12T07:30:00Z', lateAt: '2026-11-12T11:30:00Z', roseAt: '2026-11-12T09:45:00Z' }], tally: { ...emptyTally, compared: 2, insideWindow: 2 } },
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
import DamInfoTip from '@/components/dam/DamInfoTip';
import type { PublicResults } from '@/lib/arrival-trial/public-results';
const variants: Record<string, PublicResults | null> = ` + JSON.stringify(variants) + `;
export default async function Page({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_RELEASE_TIMING_SMOKE !== '1') notFound();
  const { variant = 'results' } = await searchParams;
  const results = variants[variant] ?? null;
  return <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:px-8" data-timing-check><ReleaseTimingIntro /><ReleaseTimingReport results={results} /><ResearchLog results={results} /><div data-default-info><DamInfoTip title="Dam readings"><p>Readings supplied by the Corps.</p></DamInfoTip></div></main>;
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
    assert.match(await intro.innerText(), /Bull Shoals release timing[\s\S]*Based on 695 historical releases[\s\S]*Not a forecast/);
    const studyTrigger = intro.getByRole('button', { name: 'Based on 695 historical releases. About the timing study' });
    assert((await studyTrigger.boundingBox()).height >= 44);
    await studyTrigger.focus();
    await studyTrigger.press('Enter');
    const study = page.getByRole('dialog', { name: 'The timing study' });
    await study.waitFor({ state: 'visible' });
    assert.match(await study.innerText(), /2019–2026[\s\S]*41.5 river miles[\s\S]*15 minutes[\s\S]*975[\s\S]*separate check[\s\S]*60 comparisons/);
    assert(await study.getByRole('link', { name: 'Read the research reports' }).getAttribute('href'));
    const studyBounds = await study.boundingBox();
    assert(studyBounds.x >= 0 && studyBounds.x + studyBounds.width <= width, 'study panel stays in the viewport');
    assert(studyBounds.y >= 0 && studyBounds.y + studyBounds.height <= 1001, 'study panel fits vertically');
    if (width < 640) assert(Math.abs(studyBounds.y + studyBounds.height - 1000) < 2, 'phone study opens as a bottom sheet');
    await study.getByRole('link').focus();
    await page.keyboard.press('Tab');
    assert(await study.getByRole('button', { name: 'Close explanation' }).evaluate(el => el === document.activeElement), 'dialog contains keyboard focus');
    await capture(study, 'study-' + width);
    await page.keyboard.press('Escape');
    assert(await studyTrigger.evaluate(el => el === document.activeElement), 'Escape restores focus to the study label');
    await studyTrigger.click();
    await study.getByRole('button', { name: 'Close explanation' }).click();
    assert.equal(await study.isVisible(), false);
    await studyTrigger.click();
    await page.mouse.click(width - 4, 4);
    assert.equal(await study.isVisible(), false, 'outside click dismisses the explanation');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'closing releases background scroll');
    const defaultTip = page.locator('[data-default-info]');
    await defaultTip.getByRole('button', { name: 'About dam readings' }).click();
    const defaultDialog = page.getByRole('dialog', { name: 'Dam readings' });
    assert(await defaultDialog.isVisible(), 'existing icon-only dam explanations still open');
    await defaultDialog.getByRole('button', { name: 'Close explanation' }).click();
    await intro.scrollIntoViewIfNeeded();
    assert((await intro.boundingBox()).height < 350, width + ': the introduction stays compact');
    assert.match(await map.getByRole('heading', { level: 2 }).innerText(), /About 12¾ hours/);
    assert.match(await map.innerText(), /4 generators · normal river/);
    assert.match(await map.innerText(), /Historical timing · Not live/);
    assert.doesNotMatch(await map.innerText(), /8 in 10|All risen|Assumed pace|of 93|hr \d+ min–/);
    assert.equal(await map.locator('[data-timing-band]').count(), 1);
    assert.match(await map.getByRole('status').innerText(), /Before the typical window/);
    const mapGraphic = map.getByRole('group', { name: 'White River map, select a place for river miles' });
    assert((await mapGraphic.boundingBox()).y < 800, width + ': the map is reached without a long preamble');
    const clippedLabels = await mapGraphic.evaluate((svg) => {
      const bounds = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('[role=button] text')].filter((label) => {
        const rect = label.getBoundingClientRect();
        return rect.left < bounds.left || rect.right > bounds.right;
      }).map((label) => label.textContent);
    });
    assert.deepEqual(clippedLabels, [], width + ': place labels stay within the map');
    await page.screenshot({ path: out + '/page-' + width + '.png', fullPage: true, style: screenshotStyle });
    await capture(intro, 'intro-' + width);
    await capture(map, 'map-' + width);
    // Place selection supplies geography, never an unmeasured arrival window.
    const cotter = mapGraphic.getByRole('button', { name: 'Cotter, mile 16.9', exact: true });
    await cotter.click();
    assert.equal(await cotter.getAttribute('aria-pressed'), 'true');
    const selectedPlace = map.locator('[aria-live="polite"]').filter({ hasText: 'Timing not measured here' });
    assert.match(await selectedPlace.innerText(), /Cotter[\s\S]*Mile 16.9/);
    assert.doesNotMatch(await selectedPlace.innerText(), /hours|window/);
    assert.match(await map.getByRole('heading', { level: 2 }).innerText(), /About 12¾ hours/);
    const rim = mapGraphic.getByRole('button', { name: 'Rim Shoals, mile 21.3', exact: true });
    await rim.focus();
    await rim.press('Enter');
    assert.equal(await rim.getAttribute('aria-pressed'), 'true');
    await capture(map, 'place-' + width);
    for (const button of await mapGraphic.getByRole('button').all()) {
      const hit = await button.locator('circle').first().boundingBox();
      assert(hit.width >= 43.5 && hit.height >= 43.5, 'map touch targets remain 44px');
    }
    await mapGraphic.getByRole('button', { name: 'Gauge near Norfork, mile 41.5' }).click();
    // The rough guide is collapsed until requested, with rounded times only.
    const guide = map.locator('details').filter({ has: page.locator('summary', { hasText: 'Rough guide upstream' }) });
    assert.equal(await guide.getAttribute('open'), null);
    await guide.locator('summary').click();
    const rough = guide.getByRole('list');
    assert.match(await guide.innerText(), /Not measured/);
    assert.match(await rough.innerText(), /Cotter\s+about 5 hours/);
    assert.match(await rough.innerText(), /Buffalo City\s+about 9½ hours/);
    assert.doesNotMatch(await rough.innerText(), /Calico Rock|Gauge|min/);
    // One size control drives the answer, the rough guide and the chart together.
    await sizes.getByRole('button', { name: '1', exact: true }).click();
    assert.match(await map.getByRole('heading', { level: 2 }).innerText(), /About 15¾ hours/);
    assert.match(await rough.innerText(), /Cotter\s+about 6½ hours/);
    assert.equal(await page.locator('#by-size').getByRole('button', { name: 'About 1 generator', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.locator('#by-size').getByRole('button', { name: '5 or more generators', exact: true }).click();
    assert.match(await map.getByRole('heading', { level: 2 }).innerText(), /About 11¾ hours/);
    await sizes.getByRole('button', { name: '4', exact: true }).click();
    await guide.locator('summary').click();
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
    await capture(map, 'arrival-' + width);
    // The comparison reads at a glance; full readings and pending dates are disclosure-only.
    const close = page.locator('#how-close');
    assert.match(await close.innerText(), /Gauge near Norfork · Nov 13 · Central time/);
    assert.match(await close.innerText(), /Early results · 1 release checked · 1 pending/);
    assert.match(await close.getByRole('heading', { level: 3 }).innerText(), /About 15 min later than estimated/);
    assert.match(await close.innerText(), /Within the estimated window/);
    assert.doesNotMatch(await close.innerText(), /Released|Waiting for gauge readings|Dashed mark|Study in progress|Couldn’t compare/);
    assert((await close.boundingBox()).height < 450, width + ': the result card stays compact');
    assert.equal(await close.locator('details').count(), 1);
    const details = close.locator('details');
    assert.equal(await details.getAttribute('open'), null);
    const labels = close.locator('[data-reading-label]');
    assert.equal(await labels.count(), 2);
    const estimateLabel = await labels.nth(0).boundingBox();
    const riseLabel = await labels.nth(1).boundingBox();
    assert(estimateLabel.y + estimateLabel.height < riseLabel.y, 'nearby times have separate label rows');
    const graphicBounds = await close.getByRole('img').boundingBox();
    const clippedText = await close.getByRole('img').evaluate(svg => {
      const bounds = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('text')].filter(label => {
        const box = label.getBoundingClientRect();
        return box.left < bounds.left || box.right > bounds.right;
      }).map(label => label.textContent);
    });
    assert.deepEqual(clippedText, [], width + ': window edges and clock labels fit');
    for (const bounds of [estimateLabel, riseLabel]) {
      assert(bounds.x >= graphicBounds.x && bounds.x + bounds.width <= graphicBounds.x + graphicBounds.width, 'timeline labels fit');
    }
    assert((await close.getByRole('button', { name: 'Replay release', exact: true }).boundingBox()).height >= 44);
    await capture(close, 'results-' + width);
    await details.locator('summary').focus();
    await details.locator('summary').press('Enter');
    assert.match(await details.innerText(), /Readings · Central time[\s\S]*Nov 12, 2026, 2 PM hour/);
    assert.match(await details.innerText(), /Waiting for gauge readings[\s\S]*Released in the 2 PM hour/);
    assert.match(await details.innerText(), /The gauge record had a gap/);
    assert.doesNotMatch(await details.innerText(), /2:30 PM/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': expanded details fit');
    await capture(close, 'details-' + width);
    await details.locator('summary').press('Enter');
    await page.getByRole('button', { name: 'Starting release', exact: true }).click();
    assert.match(await page.locator('#when-it-changes').innerText(), /An existing release changes the timing[\s\S]*already releasing 3,000\+ cfs/);
    assert.doesNotMatch(await page.locator('#when-it-changes').innerText(), /Above 8.5 ft/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': baseline chart fits');
    await capture(page.locator('#when-it-changes'), 'baseline-' + width);
    const log = page.locator('#research-log');
    assert.match(await log.innerText(), /First result: the gauge rose inside the estimated window[\s\S]*Next[\s\S]*Test releases that start slowly/);
    assert.doesNotMatch(await log.innerText(), /Tested a formula/);
    await log.getByText('Earlier study updates', { exact: true }).click();
    assert.match(await log.innerText(), /Tested a formula/);
    await log.getByText('Earlier study updates', { exact: true }).click();
    await capture(log, 'log-' + width);
    await close.getByRole('button', { name: 'Replay release', exact: true }).click();
    await map.getByRole('button', { name: 'Pause', exact: true }).click();
    assert.match(await map.innerText(), /Recorded release · Nov 12, 2026/);
    assert.match(await map.getByRole('heading', { level: 2 }).innerText(), /About 13¼ hours/);
    assert.equal(await map.locator('[data-timing-band]').count(), 0, 'An observed release never replays a cohort median');
    assert.equal(await sizes.count(), 0);
    await slider.fill('159');
    assert.match(await map.getByRole('status').innerText(), /At the recorded rise · Fri, Nov 13, 3:45 AM CT/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': recorded replay fits');
    await capture(map, 'replay-' + width);
    if (width === 390) {
      await map.getByRole('button', { name: 'Restart from the dam' }).click();
      await map.getByRole('button', { name: 'Play', exact: true }).click();
      await page.waitForFunction(() => Number(document.querySelector('#release-map input[type=range]').value) > 75);
      await capture(map, 'motion-390');
      await page.waitForFunction(() => document.querySelector('#release-map [role=status]').textContent.startsWith('At the recorded rise'), undefined, { timeout: 30000 });
      assert.equal(await map.getByRole('button', { name: 'Pause', exact: true }).count(), 0, 'playback stops at the recorded arrival');
      assert.equal(await slider.inputValue(), '159');
      assert(await map.locator('[data-rise-marker]').isVisible(), 'the arrival marker remains at the gauge');
      await capture(map, 'motion-arrived-390');
    }
    await map.getByRole('button', { name: 'Back to timing' }).click();
    assert.match(await map.innerText(), /Not live/);
    assert.equal(await slider.inputValue(), '0', 'returning to historical timing resets the clock');
    assert(await map.getByRole('heading', { level: 2 }).evaluate((el) => el === document.activeElement), 'return focus stays in the map');
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  activePage = page;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (request) => new URL(request.request().url()).origin === origin ? request.continue() : request.abort());
  for (const [variant, text] of [['empty', 'No results yet'], ['waiting', 'Waiting for gauge readings'], ['unmatched', 'Couldn’t compare'], ['unavailable', 'Results can’t be loaded'], ['early', 'Before the estimated window'], ['late', 'After the estimated window'], ['exact', 'At the estimated time'], ['near', 'Less than 5 min earlier than estimated'], ['precision', 'About 15 min earlier than estimated'], ['overnight', 'About 5 min later than estimated']]) {
    await page.goto(url + '?variant=' + variant, { waitUntil: 'networkidle' });
    assert((await page.locator('#how-close').innerText()).includes(text), variant);
    if (variant === 'unavailable') {
      assert.equal(await page.locator('#how-close [data-slot]').count(), 0, 'no progress shown when results cannot be read');
      assert.equal(await page.getByText(/releases checked/).count(), 0);
    }
    if (variant === 'empty') assert.match(await page.locator('#how-close').innerText(), /Early results · 0 releases checked/);
    if (['waiting', 'unmatched', 'unavailable', 'empty'].includes(variant)) assert.equal(await page.getByRole('button', { name: 'Replay release' }).count(), 0);
    const close = page.locator('#how-close');
    if (['waiting', 'unmatched', 'unavailable', 'empty'].includes(variant)) assert.equal(await close.getByRole('img').count(), 0, 'no estimate is exposed without a comparison');
    if (variant === 'early') {
      assert.match(await close.innerText(), /Gauge near Norfork · Nov 12 · Central time/);
      assert.match(await close.locator('[data-reading-label=estimate]').textContent(), /Nov 13/);
    }
    if (variant === 'overnight') {
      assert.match(await close.locator('[data-window-edge]').nth(0).textContent(), /11:30 PM.*Nov 13/);
      assert.match(await close.locator('[data-window-edge]').nth(1).textContent(), /2:30 AM/);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), variant + ': no overflow');
    if (variant === 'late') {
      await page.getByRole('button', { name: 'Replay release' }).click();
      const map = page.locator('#release-map');
      await map.getByRole('button', { name: 'Pause', exact: true }).click();
      assert.match(await map.getByRole('heading', { level: 2 }).innerText(), /About 32 hours/);
      assert.equal(Number(await map.getByRole('slider').getAttribute('max')), 432, 'a late rise stays reachable');
    }
    await capture(page.locator('#how-close'), 'state-' + variant);
  }
  await page.goto(url + '?variant=history', { waitUntil: 'networkidle' });
  const history = page.locator('#how-close');
  assert.doesNotMatch(await history.innerText(), /Other releases/);
  await history.locator('summary').click();
  await capture(history, 'state-history');
  await history.getByRole('button', { name: 'Replay release from Nov 11, 2026', exact: true }).click();
  assert.match(await page.locator('#release-map').innerText(), /Recorded release · Nov 11, 2026/);
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
