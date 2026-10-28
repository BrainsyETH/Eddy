// Fixture-only browser check. The ignored route is gated to this dev process;
// normal exit and SIGINT/SIGTERM remove it (SIGKILL cannot run cleanup).
// Run: npm run test:dam-page (no production credentials or requests).
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import WebSocket from 'next/dist/compiled/ws/index.js';

const port = 3137;
const origin = `http://127.0.0.1:${port}`;
const route = resolve('src/app/dam-layout-check');
const out = process.env.DAM_SMOKE_OUTPUT || '/tmp/eddy-dam-page';
const appOnly = process.env.DAM_SMOKE_APP_ONLY === '1';
const now = Date.parse('2026-10-16T16:30:00Z');
const at = new Date(now - 10 * 60_000).toISOString();
const metric = (value, unit = 'cfs') => ({ value, unit, at, staleness: 'fresh' });
const day = (scheduleDate) => ({ scheduleDate, retrievedAt: at,
  hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: i >= 12 && i < 20 ? 200 : 0, cfs: i >= 12 && i < 20 ? 13000 : 0, isRamp: false })),
  idle: [{ from: 1, to: 12 }, { from: 21, to: 24 }],
});
const dam = {
  id: 'swl-bull-shoals-dam', name: 'Bull Shoals Dam', lakeName: 'Bull Shoals Lake', state: 'AR', lat: 36.36, lon: -92.57,
  hasTurbines: true, generating: true, generationFloorCfs: 100, releaseExcludesGeneration: true,
  generationReference: { units: 8, fullGenerationCfs: 26400, schedulingCapacityMw: 391, source: 'SWPA' },
  nameplate: { units: 8, megawatts: 340 }, infoPhone: '870-431-5311',
  metrics: { generationFlow: metric(13200), release: metric(16200), tailwaterElevation: { ...metric(455.12, 'ft'), trend: { hours: 3, delta: 1.2 } }, poolElevation: metric(659.4, 'ft'), tailwaterTempF: metric(56, 'F'), inflow: metric(3000) },
  schedule: [day('2026-10-16'), day('2026-10-17')],
  pattern: ['2026-10-14', '2026-10-15', '2026-10-16'].map((scheduleDate, i) => ({ scheduleDate, startUtc: `${scheduleDate}T05:00:00Z`, turbineCfs: Array.from({ length: 24 }, (_, h) => h === 7 ? null : i === 2 && h > 10 ? null : h > 12 ? 13200 : 0), totalReleaseCfs: Array(24).fill(null) })),
  sources: ['USACE CWMS', 'SWPA'],
};
const variants = {
  normal: dam,
  tableRock: { ...dam, id: 'swl-table-rock-dam', name: 'Table Rock Dam' },
  beaver: { ...dam, id: 'swl-beaver-dam', name: 'Beaver Dam' },
  norfork: { ...dam, id: 'swl-norfork-dam', name: 'Norfork Dam' },
  noReference: { ...dam, generationReference: undefined },
  splitPeak: { ...dam, schedule: [{ ...day('2026-10-16'), idle: [], hours: day('2026-10-16').hours.map((hour, i) => ({ ...hour, megawatts: (i >= 6 && i < 8) || (i >= 16 && i < 19) ? 200 : 100 })) }] },
  allDayPeak: { ...dam, schedule: [{ ...day('2026-10-16'), idle: [], hours: day('2026-10-16').hours.map(hour => ({ ...hour, megawatts: 200 })) }] },
  noGeneration: { ...dam, schedule: [{ ...day('2026-10-16'), idle: [{ from: 1, to: 24 }], hours: day('2026-10-16').hours.map(hour => ({ ...hour, megawatts: 0, cfs: 0 })) }] },
  idle: { ...dam, generating: false, metrics: { ...dam.metrics, generationFlow: metric(20) } },
  noTemp: { ...dam, metrics: { ...dam.metrics, tailwaterTempF: undefined } },
  stale: { ...dam, metrics: { ...dam.metrics, generationFlow: { ...dam.metrics.generationFlow, at: '2026-10-15T10:00:00Z' } }, schedule: dam.schedule.map(d => ({ ...d, retrievedAt: '2026-10-14T10:00:00Z' })) },
  scheduleOnly: { ...dam, metrics: {}, generating: null, pattern: [] },
  gate: { ...dam, hasTurbines: false, generating: null, generationReference: undefined, nameplate: undefined, schedule: [], pattern: [], metrics: { release: metric(2200) } },
  gateDaily: { ...dam, hasTurbines: false, generating: null, generationReference: undefined, nameplate: undefined, schedule: [], pattern: [], metrics: { release: { ...metric(2200), dailyMean: true, at: '2026-10-15T16:30:00Z' } } },
  missing: { ...dam, schedule: [] },
  forecast: { ...dam, schedule: [], generationForecast: { timeZone: 'America/Chicago', retrievedAt: at, source: 'U.S. Army Corps of Engineers, Nashville District', windows: [
    { startUtc: '2026-10-16T16:00:00Z', endUtc: '2026-10-16T23:00:00Z', generating: true, peakCfs: 13200 },
    { startUtc: '2026-10-16T23:00:00Z', endUtc: '2026-10-17T12:00:00Z', generating: false, peakCfs: null },
    { startUtc: '2026-10-17T12:00:00Z', endUtc: '2026-10-18T12:00:00Z', generating: true, peakCfs: 13200 },
  ] } },
};
let server, browser, cleanupPromise;
assert(!existsSync(route), 'temporary QA route already exists; refusing to overwrite');
function cleanup() {
  return cleanupPromise ??= (async () => {
    try { await rm(route, { recursive: true, force: true }); }
    finally { server?.kill('SIGTERM'); await browser?.close(); }
  })();
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void cleanup().catch(console.error).finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  });
}
try {
  await mkdir(route, { recursive: true });
  await mkdir(out, { recursive: true });
  await writeFile(`${route}/page.tsx`, `import { notFound } from 'next/navigation';
import DamDetail from '@/components/dam/DamDetail';
import SiteFooter from '@/components/ui/SiteFooter';
import StationShareButton from '@/components/gauge/StationShareButton';
const variants = ${JSON.stringify(variants)};
export default async function Page({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_DAM_SMOKE !== '1') notFound();
  const { variant = 'normal' } = await searchParams;
  const dam = variants[variant as keyof typeof variants] as import('@shared/dam-types').DamSnapshot;
  return <div className="min-h-screen bg-neutral-50"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><header className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-semibold text-primary-800" style={{ fontFamily: 'var(--font-display)' }}>{dam.name}</h1><StationShareButton station={{ provider: 'usace', siteId: dam.id }} title={dam.name} label="Share" /></header><DamDetail dam={dam} renderedAt={${now}} availability={{ title: dam.hasTurbines ? 'Schedule currently unavailable' : 'Gate-operated releases', detail: 'Fixture availability explanation.' }} /></div><SiteFooter maxWidth="max-w-7xl" /></div>;
}
`);
  await mkdir(`${route}/list`, { recursive: true });
  await writeFile(`${route}/list/page.tsx`, `import { notFound } from 'next/navigation';
import DamListCard from '@/components/dam/DamListCard';
const variants = ${JSON.stringify(variants)};
export default function Page() {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_DAM_SMOKE !== '1') notFound();
  return <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><h1>Lakes &amp; dams</h1><div className="grid gap-4 md:grid-cols-2">{Object.entries(variants).map(([key, dam]) => <div key={key} data-variant={key}><DamListCard href="/dam-layout-check" dam={{ ...dam, tailwaterFishery: 'trout' } as import('@shared/dam-types').DamSnapshot} now={${now}} /></div>)}</div></div>;
}
`);
  const ignored = spawnSync('git', ['check-ignore', '--quiet', `${route}/page.tsx`]);
  assert.equal(ignored.status, 0, 'fixture page must be ignored by Git');
  // Exercise the generated route itself: neither an ordinary dev process nor
  // production (even with an accidentally copied flag) may render fixture data.
  for (const [mode, flag] of [['development', ''], ['production', '1']]) {
    const check = spawnSync(process.execPath, ['--import', 'tsx', '-e', `
      const assert = require('node:assert/strict');
      const Page = require(${JSON.stringify(`${route}/page.tsx`)}).default;
      assert.rejects(() => Page({ searchParams: Promise.resolve({}) }), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }).catch(error => { console.error(error); process.exitCode = 1; });
    `], { encoding: 'utf8', env: { ...process.env, NODE_ENV: mode, EDDY_DAM_SMOKE: flag, TSX_TSCONFIG_PATH: resolve('tsconfig.json') } });
    assert.equal(check.status, 0, `fixture route must be unavailable in ${mode}: ${check.stderr}`);
  }
  console.log('PASS fixture Git exclusion and dev/production guards');
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, EDDY_DAM_SMOKE: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', c => { log += c; }); server.stderr.on('data', c => { log += c; });
  const url = `${origin}/dam-layout-check`;
  let html = '';
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error(log.slice(-4000));
    try { const r = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (r.ok) { html = await r.text(); break; } } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  assert(html.includes('Generation schedule') && html.includes('13,200'), `readings and schedule must be server-rendered\n${log.slice(-4000)}`);
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true, args: ['--no-sandbox'] });
  const errors = [];
  for (const [name, width, height, wide] of (appOnly ? [] : [['desktop', 1440, 1000, true], ['portrait', 390, 844, false], ['landscape', 844, 390, true], ['small-landscape', 667, 375, true], ['small-portrait', 320, 720, false]])) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 900 });
    await page.clock.install({ time: now });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.goto(`${url}/list`, { waitUntil: 'networkidle' });
    const list = page.locator('[data-variant]');
    assert.equal(await list.locator('a a, a button, a [tabindex]').count(), 0, 'navigation links do not contain chart controls');
    assert(!(await list.allTextContents()).join(' ').includes('Fishery below dam'), 'fishery stays off list cards');
    const normal = page.locator('[data-variant="normal"]');
    assert((await normal.innerText()).includes('16,200 cfs'), 'list shows total release');
    assert((await normal.innerText()).includes('56.0 °F'), 'list shows water temperature');
    assert(!(await normal.innerText()).includes('estimated from flow'), 'rack stays on the full report');
    assert(!(await page.locator('[data-variant="noTemp"]').innerText()).includes('°F'), 'missing temperature is not fabricated');
    assert(!(await page.locator('[data-variant="noReference"]').innerText()).includes('%'), 'no reference means no percentage');
    assert(!(await page.locator('[data-variant="stale"]').innerText()).includes('Generating now'), 'list does not claim a current turbine state');
    assert((await page.locator('[data-variant="stale"]').innerText()).includes('may have been revised'), 'old schedule retains its provenance');
    assert(!(await page.locator('[data-variant="scheduleOnly"]').innerText()).includes('No turbine generation observed'), 'missing readings are not idle');
    assert((await page.locator('[data-variant="gateDaily"]').innerText()).includes('daily avg'), 'daily release is labelled');
    assert(!(await page.locator('[data-variant="gate"]').innerText()).includes('generation'), 'gate-only dam has no generation visual');
    assert((await page.locator('[data-variant="idle"]').innerText()).includes('16,200 cfs'), 'release stays independent of turbine state');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: list has no horizontal overflow`);
    const first = await list.nth(0).boundingBox();
    const second = await list.nth(1).boundingBox();
    assert(width >= 768 ? second.x > first.x : second.y >= first.y + first.height, `${name}: list uses available width`);
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    await page.screenshot({ path: `${out}/list-${name}.png`, fullPage: false });
    const lastCard = page.locator('a[href="/dam-layout-check"]').last();
    await lastCard.scrollIntoViewIfNeeded();
    const listScroll = await page.evaluate(() => scrollY);
    assert(listScroll > 200, `navigation starts down the list (${listScroll}px)`);
    if (width < 900) await lastCard.tap();
    else await lastCard.click();
    await page.waitForURL(url);
    await page.waitForLoadState('networkidle');
    assert(await page.evaluate(() => scrollY < 100), `${name}: opening a dam starts at the top`);
    await page.goBack({ waitUntil: 'networkidle' });
    await page.waitForFunction(expected => Math.abs(scrollY - expected) < 5, listScroll, { timeout: 5000 });
    console.log(`PASS ${name}: list cards, opening at top, Back restoration`);
    await page.goto(url, { waitUntil: 'networkidle' });
    assert(await page.evaluate(() => scrollY < 100), `${name}: direct load starts at the top`);
    const detail = page.locator('[data-dam-detail]');
    assert(await detail.isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal page overflow`);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    const a = await page.locator('.dam-observed').boundingBox();
    const b = await page.getByRole('region', { name: 'Generation schedule', exact: true }).boundingBox();
    assert(wide ? b.x > a.x + a.width - 2 : b.y >= a.y + a.height, `${name}: responsive column placement`);
    const cta = page.locator('[data-dam-app-cta]');
    assert.equal(await cta.locator('a').count(), 1, 'dam promotion has one action');
    assert(await cta.evaluate(el => Boolean(el.closest('section')?.querySelector('[aria-label="Generation schedule"]'))), 'app action belongs to the generation card footer');
    const ctaBox = await cta.boundingBox();
    const ctaLinkBox = await cta.getByRole('link', { name: 'Get Eddy for iPhone' }).boundingBox();
    const historyBox = await page.getByRole('heading', { name: 'Generation pattern', exact: true }).boundingBox();
    assert(ctaBox.y >= b.y + b.height && historyBox.y > ctaBox.y + ctaBox.height, `${name}: app action follows schedule and precedes history`);
    assert(ctaLinkBox.height >= 44 && ctaLinkBox.x >= 0 && ctaLinkBox.x + ctaLinkBox.width <= width, `${name}: app action fits and has a touch target`);
    const days = page.locator('details');
    assert.equal(await days.count(), 2);
    assert.equal(await days.nth(0).getAttribute('open'), '');
    assert.equal(await days.nth(1).getAttribute('open'), null);
    await days.nth(1).locator('summary').click();
    assert.equal(await days.nth(1).getAttribute('open'), '');
    assert.equal(await page.getByRole('button', { name: /upcoming schedule/i }).count(), 0, 'upcoming hours need no toggle');
    const pattern = page.getByRole('heading', { name: 'Generation pattern', exact: true }).locator('..').locator('..');
    assert(await pattern.getByText('Scheduled', { exact: true }).isVisible(), 'scheduled hours show by default');
    const axes = pattern.locator('[data-pattern-time-axis]');
    assert.equal(await axes.count(), 2, 'time rulers sit above and below the daily rows');
    for (const axis of await axes.all()) {
      const labels = axis.locator('div > span');
      assert.deepEqual(await labels.allTextContents(), ['12 AM', '6 AM', 'Noon', '6 PM', '12 AM']);
      const boxes = await labels.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
      assert(boxes.slice(1).every((box, i) => box.left >= boxes[i].right - 1), `${name}: time labels do not overlap`);
    }
    assert.equal(await pattern.getByRole('img').first().locator('[data-pattern-time-guide]').count(), 3, 'each day has six-hour guides');
    const peakBand = days.first().locator('[data-peak-window]');
    assert.equal(await peakBand.count(), 1);
    assert.equal(await peakBand.evaluate(el => el.style.left), '50%');
    assert(Math.abs(parseFloat(await peakBand.evaluate(el => el.style.width)) - 100 / 3) < 0.01, 'peak band spans exactly noon through 8 PM');
    assert.equal(await days.first().locator('[role="img"] .bg-accent-500').count(), 8, 'only the eight peak bars use orange');
    assert(await days.first().getByText('Peak window: 12–8 PM', { exact: true }).isVisible());
    const measurements = page.getByRole('heading', { name: 'Dam & lake', exact: true }).locator('..');
    const measurementsBox = await measurements.boundingBox();
    const patternBox = await pattern.boundingBox();
    assert(measurementsBox.y + measurementsBox.height <= patternBox.y, 'dam and lake readings are above the pattern');
    const scheduleText = await page.getByRole('region', { name: 'Generation schedule', exact: true }).innerText();
    assert(!/Peak scheduled release|\bMW\b|Select an hour|no break in the schedule/.test(scheduleText), 'schedule avoids stacked jargon and instructions');
    assert.equal(await detail.getByText('Next scheduled change', { exact: true }).count(), 1, 'next change is stated once');
    const share = page.getByRole('button', { name: 'Share Bull Shoals Dam', exact: true });
    assert.equal(await share.locator('svg').count(), 1, 'Share has an icon');
    assert((await share.boundingBox()).height >= 44, 'Share has a touch-sized target');
    await page.evaluate(() => {
      window.sharedDam = null;
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.sharedDam = data; } });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async url => { window.sharedDam = { url }; } } });
    });
    await share.click();
    const shared = await page.evaluate(() => window.sharedDam);
    assert.equal(shared.url, `${origin}/share/gauge/usace/${dam.id}`, 'share retains the existing dam deep-link contract');
    if (!await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) assert(await page.getByRole('status').getByText('Link copied.').isVisible());
    const trigger = page.getByRole('button', { name: 'About generation and schedule' });
    await trigger.click();
    assert(await page.getByRole('dialog').isVisible());
    assert(await page.getByRole('button', { name: 'Close explanation' }).evaluate(el => el === document.activeElement));
    const dialogBox = await page.getByRole('dialog').boundingBox();
    assert(dialogBox.x >= 0 && dialogBox.y >= 0 && dialogBox.x + dialogBox.width <= width && dialogBox.y + dialogBox.height <= height, `${name}: dialog fits viewport`);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert(await trigger.evaluate(el => el === document.activeElement));
    assert(await detail.getByText('Not through turbines', { exact: true }).isVisible());
    if (name === 'desktop') {
      const before = await detail.getByText(/Last reading/).first().textContent();
      await page.clock.fastForward(65_000);
      const after = await detail.getByText(/Last reading/).first().textContent();
      assert.notEqual(after, before, 'reading ages advance without navigation');
      assert.equal(await days.nth(1).getAttribute('open'), '', 'clock preserves open dates');
      let refreshes = 0;
      page.on('request', request => { if (request.headers().rsc === '1') refreshes++; });
      await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); });
      await page.waitForTimeout(1500);
      assert.equal(refreshes, 1, 'focus refreshes are coalesced');
      assert.equal(await days.nth(1).getAttribute('open'), '', 'refresh preserves open dates');
      assert.match(await detail.getByRole('img', { name: /^Today:/ }).getAttribute('aria-label'), /generation scheduled in 8 of 24 hours/);
      const patternMarker = detail.getByRole('img', { name: /^Today:/ }).locator('[data-pattern-now]');
      const markerBefore = await patternMarker.evaluate(el => el.style.left);
      // Move wall time across noon without firing interval callbacks. A return
      // to the tab must advance both charts immediately from the page clock.
      await page.clock.setFixedTime(new Date('2026-10-16T17:00:00Z'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(() => document.querySelector('[data-dam-detail] [aria-label^="Today:"] [data-pattern-now]')?.style.left === '50%');
      assert.notEqual(await patternMarker.evaluate(el => el.style.left), markerBefore, 'pattern advances across the hour');
      const scheduleMarker = days.first().getByRole('img').locator('[data-schedule-now]');
      assert.equal(await scheduleMarker.evaluate(el => el.style.left), '50%', 'schedule and history advance together on focus');
      console.log('PASS shared clock across an hour boundary');
    }
    const chart = days.first().getByRole('img');
    await chart.focus();
    await page.keyboard.press('ArrowRight');
    assert(await days.first().getByText('12 AM–1 AM · no generation scheduled', { exact: true }).isVisible(), 'keyboard chart exploration stays available');
    if (width < 900) {
      await chart.scrollIntoViewIfNeeded();
      const box = await chart.boundingBox();
      await page.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height / 2);
      assert(await days.first().getByText(/2 PM–3 PM · ~13,000 cfs scheduled/).isVisible(), 'tap retains the hourly readout');
    }
    await days.nth(1).locator('summary').click();
    await page.getByRole('heading', { level: 1 }).click();
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    await page.close();
    console.log(`PASS ${name}: layout, disclosures, history, dialog, release provenance`);
  }
  for (const variant of (appOnly ? [] : ['stale', 'scheduleOnly', 'gate', 'gateDaily', 'missing', 'forecast', 'splitPeak', 'allDayPeak', 'noGeneration'])) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
    await page.clock.install({ time: now });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.goto(`${url}?variant=${variant}`, { waitUntil: 'networkidle' });
    const text = await page.locator('[data-dam-detail]').innerText();
    if (variant === 'splitPeak') {
      assert.equal(await page.locator('[data-peak-window]').count(), 2, 'both disconnected peak windows are highlighted');
      assert(await page.getByText('Peak window: 6–8 AM and 4–7 PM', { exact: true }).isVisible());
    }
    if (variant === 'allDayPeak') assert(await page.getByText('Peak window: all day', { exact: true }).isVisible());
    if (variant === 'noGeneration') assert.equal(await page.locator('[data-peak-window]').count(), 0, 'an idle day has no peak window');
    if (variant === 'stale') assert(text.includes('may have been revised'), 'stale schedule provenance visible');
    if (variant === 'scheduleOnly') assert(text.includes('Generation schedule') && !text.includes('No turbine generation observed'), 'missing readings are not idle');
    if (variant === 'gate') assert(text.includes('2,200') && text.includes('Gate-operated releases'), 'gate-only dam retains its release');
    if (variant === 'gateDaily') assert(/daily average/i.test(text) && text.includes('yesterday'), `daily release remains labelled and dated: ${text}`);
    if (variant === 'missing') assert(text.includes('Schedule currently unavailable') && text.includes('13,200'), 'missing schedule retains observed readings');
    if (variant === 'forecast') {
      assert(text.includes('Generation forecast') && text.includes('Forecast checked'), 'operating forecast retains freshness');
      await page.getByRole('button', { name: 'About generation forecast' }).click();
      assert((await page.getByRole('dialog').innerText()).includes('Nashville District'), 'forecast source remains available');
    }
    await page.close();
    console.log(`PASS ${variant}`);
  }
  // Serve the local app through an intercepted production-shaped URL to exercise
  // the real delegated listener. Never contact Eddy, Google, or the App Store.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const events = [];
  await context.exposeBinding('recordAnalytics', (_source, ...args) => events.push(args));
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.__eddyAnalyticsId = 'G-FIXTURE123';
    window.damPromotionViews = 0;
    window.gtag = (...args) => {
      if (args[1] === 'app_promotion_view') window.damPromotionViews++;
      return window.recordAnalytics(...args);
    };
    window.damDocument = Math.random();
  });
  // Next's development React debug channel must connect before hydration can
  // finish. Bridge it locally too, using the WS client bundled with Next.
  await context.routeWebSocket('**/*', socket => {
    const target = new URL(socket.url());
    assert.equal(target.origin, 'wss://eddy.guide');
    assert.equal(target.pathname, '/_next/hmr');
    const upstream = new WebSocket(`ws://127.0.0.1:${port}${target.pathname}${target.search}`);
    const pending = [];
    socket.onMessage(message => upstream.readyState === WebSocket.OPEN ? upstream.send(message) : pending.push(message));
    upstream.on('open', () => pending.splice(0).forEach(message => upstream.send(message)));
    upstream.on('message', (message, binary) => socket.send(binary ? message : message.toString()));
    upstream.on('error', error => errors.push(error.message));
    socket.onClose(() => upstream.close());
    upstream.on('close', () => socket.close());
  });
  await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== 'https://eddy.guide') return route.abort();
    const response = await route.fetch({ url: `${origin}${requestUrl.pathname}${requestUrl.search}`, headers: { ...route.request().headers(), origin } });
    await route.fulfill({ response });
  });
  try {
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    for (const [variant, id, name, campaign] of [
      ['normal', dam.id, dam.name, 'dam_bull_shoals'],
      ['tableRock', variants.tableRock.id, variants.tableRock.name, 'dam_table_rock'],
      ['beaver', variants.beaver.id, variants.beaver.name, 'dam_beaver'],
      ['tableRock', variants.tableRock.id, variants.tableRock.name, 'partner_guide'],
    ]) {
      events.length = 0;
      await page.goto(`https://eddy.guide/dam-layout-check?variant=${variant}${campaign === 'partner_guide' ? '&ct=partner_guide' : ''}`, { waitUntil: 'networkidle' });
      const cta = page.locator('[data-dam-app-cta] a');
      const expectedUrl = `https://eddy.guide/app?ct=${campaign}&dam=${id}`;
      await page.waitForFunction(expected => document.querySelector('[data-dam-app-cta] a')?.href === expected, expectedUrl);
      await cta.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => window.damPromotionViews === 1);
      await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
      await cta.scrollIntoViewIfNeeded();
      const oldDocument = await page.evaluate(() => window.damDocument);
      await cta.click();
      await page.waitForURL(expectedUrl);
      await page.waitForLoadState('networkidle');
      assert.notEqual(await page.evaluate(() => window.damDocument), oldDocument, 'document navigation refreshes Safari banner');
      assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), `${name.replace(/ Dam$/, '')} on your Home Screen.`);
      assert.equal(await page.locator('[data-app-qr]').count(), 0, 'iPhone uses the download action without a QR prompt');
      assert(await page.getByRole('img', { name: /Eddy’s Bull Shoals Dam widget/ }).evaluate(el => el.complete && el.naturalWidth > 0), 'real widget screenshot loads');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: app page fits phone`);
      assert.match(await page.locator('head meta[name="apple-itunes-app"]').getAttribute('content'), new RegExp(`app-argument=eddy:///dam/${id}(?:,|$)`));
      const store = page.locator('[data-ga-event="app_store_click"]').first();
      assert.equal(new URL(await store.getAttribute('href')).hostname, 'apps.apple.com');
      await page.evaluate(() => document.addEventListener('click', event => {
        if (event.target.closest('[data-ga-event="app_store_click"]')) event.preventDefault();
      }));
      await store.click();
      // A round trip drains the exposed binding before checking its calls.
      await page.evaluate(() => window.recordAnalytics('flush'));
      assert.deepEqual(errors, [], 'contextual app flow has no browser errors');
      assert.deepEqual(events.filter(event => event[1] === 'app_promotion_view'), [
        ['event', 'app_promotion_view', { label: 'dam_schedule', dam_id: id, page_path: '/dam-layout-check' }],
      ], 'view is counted once after the CTA enters the viewport');
      assert.deepEqual(events.filter(event => ['app_landing_click', 'app_store_click'].includes(event[1])), [
        ['event', 'app_landing_click', { label: 'dam_schedule', dam_id: id }],
        ['event', 'app_store_click', { label: 'app_landing_hero', dam_id: id, page_path: '/app', app_campaign: campaign, transport_type: 'beacon' }],
      ]);
      await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
      await page.screenshot({ path: `${out}/app-${campaign}.png`, fullPage: false });
      await page.evaluate(() => sessionStorage.clear());
      console.log(`PASS ${name}: CTA → contextual app page → store event (${campaign})`);
    }
    await page.goto('https://eddy.guide/dam-layout-check?variant=norfork', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-dam-app-cta]').count(), 0, 'other dams keep their existing layout');
    await page.goto('https://eddy.guide/app?dam=unknown', { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'Find floatable water.');
    assert.match(await page.locator('head meta[name="apple-itunes-app"]').getAttribute('content'), /app-argument=eddy:\/\/\/reports(?:,|$)/);
  } finally {
    await context.close();
  }
  const desktop = await browser.newPage({ viewport: { width: 700, height: 900 } });
  desktop.on('pageerror', e => errors.push(e.message));
  await desktop.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  await desktop.goto(`${origin}/app?ct=partner_guide&dam=swl-table-rock-dam`, { waitUntil: 'networkidle' });
  const qr = desktop.locator('[data-app-qr]');
  assert(await qr.isVisible(), 'narrow desktop windows retain the QR');
  assert.equal(await qr.locator('a').getAttribute('href'), 'https://eddy.guide/app?ct=partner_guide&dam=swl-table-rock-dam');
  await writeFile(`${out}/dam-qr.svg`, decodeURIComponent((await qr.locator('img').getAttribute('src')).split(',').slice(1).join(',')));
  await desktop.addStyleTag({ content: 'nextjs-portal { display: none; }' });
  await desktop.screenshot({ path: `${out}/app-narrow-desktop.png`, fullPage: false });
  await desktop.close();
  const android = await browser.newPage({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' });
  android.on('pageerror', e => errors.push(e.message));
  await android.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  await android.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await android.locator('[data-dam-app-cta]').count(), 0, 'Android omits the iPhone promotion');
  assert(await android.getByRole('region', { name: 'Generation schedule', exact: true }).isVisible());
  await android.close();
  console.log('PASS Android keeps the schedule; desktop QR retains dam and campaign below 900px');
  assert.deepEqual(errors, [], 'no browser runtime or hydration errors');
  console.log(`Screenshots: ${out}`);
} finally {
  await cleanup();
}
