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
let server, browser, cleanupPromise;
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
import ReleaseTimingReport from '@/components/release-timing/ReleaseTimingReport';
import type { PublicResults } from '@/lib/arrival-trial/public-results';
const variants: Record<string, PublicResults | null> = ` + JSON.stringify(variants) + `;
export default async function Page({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_RELEASE_TIMING_SMOKE !== '1') notFound();
  const { variant = 'results' } = await searchParams;
  return <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8" data-timing-check><ReleaseTimingReport results={variants[variant] ?? null} /></main>;
}`);
  assert.equal(spawnSync('git', ['check-ignore', '--quiet', route + '/page.tsx']).status, 0, 'Fixture must stay out of Git');
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, EDDY_RELEASE_TIMING_SMOKE: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
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
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (request) => new URL(request.request().url()).origin === origin ? request.continue() : request.abort());
    await page.goto(url, { waitUntil: 'networkidle' });
    const map = page.getByRole('region', { name: 'Release travel time', exact: true });
    const location = map.getByLabel('Location', { exact: true });
    const slider = map.getByRole('slider');
    assert.match(await map.innerText(), /Historical model · Not live/);
    assert.equal(await location.inputValue(), '6', 'Cotter is selected initially');
    assert.doesNotMatch(await map.innerText(), /8 in 10|All risen|Assumed pace|Oct 24|of 93/);
    assert.equal(await map.locator('[data-timing-band]').count(), 1);
    await location.selectOption('8');
    assert.match(await map.getByRole('complementary').innerText(), /Rim Shoals/);
    await map.getByRole('button', { name: 'Show first rise', exact: true }).click();
    assert.match(await map.getByRole('status').innerText(), /Within the typical window/);
    await map.getByRole('group', { name: 'Compare release sizes, in generators', exact: true }).getByRole('button', { name: '1', exact: true }).click();
    assert.equal(await location.inputValue(), '8', 'Size comparison preserves the location');
    await map.getByRole('button', { name: 'Restart from the dam' }).click();
    assert.equal(await slider.inputValue(), '0');
    await map.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('#release-map input[type=range]').value) > 0);
    await map.getByRole('button', { name: 'Pause', exact: true }).click();
    await slider.focus();
    await slider.press('End');
    assert.match(await map.getByRole('status').innerText(), /Past the typical window/);
    await location.selectOption('18');
    assert.match(await map.getByRole('complementary').innerText(), /No timing below this gauge/);
    assert.equal(await map.getByRole('button', { name: 'Show first rise' }).count(), 0);
    await location.selectOption('6');
    await map.getByRole('button', { name: 'Show first rise' }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': no page overflow');
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    await map.screenshot({ path: out + '/map-' + width + '.png' });
    await page.locator('#how-close').screenshot({ path: out + '/results-' + width + '.png' });
    await page.getByRole('button', { name: 'Starting release', exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': baseline chart fits');
    await page.locator('#when-it-changes').screenshot({ path: out + '/baseline-' + width + '.png' });
    await page.getByRole('button', { name: 'Replay release', exact: true }).click();
    await map.getByRole('button', { name: 'Pause', exact: true }).click();
    assert.match(await map.innerText(), /Recorded release · Nov 12, 2026/);
    assert.equal(await map.locator('[data-timing-band]').count(), 0, 'An observed release never replays a cohort median');
    assert.match(await map.getByRole('complementary').innerText(), /Recorded first rise/);
    assert.equal(await map.getByRole('group', { name: /Compare release/ }).count(), 0);
    await map.getByRole('button', { name: 'Show first rise' }).click();
    assert.equal(Number(await slider.inputValue()), 159, 'Recorded 13.25-hour delay drives playback');
    assert.match(await map.innerText(), /3:45 AM/);
    assert.match(await map.getByRole('status').innerText(), /At the recorded rise/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': recorded replay fits');
    await map.screenshot({ path: out + '/replay-' + width + '.png' });
    await map.getByRole('button', { name: 'Back to timing' }).click();
    assert.match(await map.innerText(), /Historical model/);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (request) => new URL(request.request().url()).origin === origin ? request.continue() : request.abort());
  for (const [variant, text] of [['empty', 'No results yet'], ['waiting', 'Waiting for gauge readings'], ['unmatched', 'Couldn’t compare'], ['unavailable', 'Results can’t be loaded'], ['early', 'before the window'], ['late', 'after the window']]) {
    await page.goto(url + '?variant=' + variant, { waitUntil: 'networkidle' });
    assert((await page.locator('#how-close').innerText()).includes(text), variant);
    if (['waiting', 'unmatched', 'unavailable', 'empty'].includes(variant)) assert.equal(await page.getByRole('button', { name: 'Replay release' }).count(), 0);
    if (variant === 'late') {
      await page.getByRole('button', { name: 'Replay release' }).click();
      const map = page.locator('#release-map');
      await map.getByRole('button', { name: 'Pause', exact: true }).click();
      await map.getByRole('button', { name: 'Show first rise' }).click();
      assert.equal(Number(await map.getByRole('slider').inputValue()), 384);
      assert.equal(Number(await map.getByRole('slider').getAttribute('max')), 432);
    }
    await page.locator('#how-close').screenshot({ path: out + '/state-' + variant + '.png' });
  }
  assert.deepEqual(errors, []);
  console.log('PASS timing model, observed release, controls, viewport and publication-state checks');
} finally { await cleanup(); }
