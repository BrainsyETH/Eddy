// Fixture-only browser check. The ignored route is gated to this dev process;
// normal exit and SIGINT/SIGTERM remove it (SIGKILL cannot run cleanup).
// Run: npm run test:dam-page (no production credentials or requests).
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = 3137;
const origin = `http://127.0.0.1:${port}`;
const route = resolve('src/app/dam-layout-check');
const out = process.env.DAM_SMOKE_OUTPUT || '/tmp/eddy-dam-page';
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
  noReference: { ...dam, generationReference: undefined },
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
const variants = ${JSON.stringify(variants)};
export default async function Page({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_DAM_SMOKE !== '1') notFound();
  const { variant = 'normal' } = await searchParams;
  const dam = variants[variant as keyof typeof variants] as import('@shared/dam-types').DamSnapshot;
  return <div className="min-h-screen bg-neutral-50"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><h1 className="mb-6 text-3xl font-bold">{dam.name}</h1><DamDetail dam={dam} renderedAt={${now}} availability={{ title: dam.hasTurbines ? 'Schedule currently unavailable' : 'Gate-operated releases', detail: 'Fixture availability explanation.' }} /></div><SiteFooter maxWidth="max-w-7xl" /></div>;
}
`);
  await mkdir(`${route}/list`, { recursive: true });
  await writeFile(`${route}/list/page.tsx`, `import { notFound } from 'next/navigation';
import Link from 'next/link';
import DamListCard from '@/components/dam/DamListCard';
const variants = ${JSON.stringify(variants)};
export default function Page() {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_DAM_SMOKE !== '1') notFound();
  return <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><h1>Lakes &amp; dams</h1><div className="grid gap-4 md:grid-cols-2">{Object.entries(variants).map(([key, dam]) => <Link key={key} data-variant={key} href="/dam-layout-check" className="group block min-w-0 rounded-2xl"><DamListCard dam={{ ...dam, tailwaterFishery: 'trout' } as import('@shared/dam-types').DamSnapshot} now={${now}} /></Link>)}</div></div>;
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
  for (const [name, width, height, wide] of [['desktop', 1440, 1000, true], ['portrait', 390, 844, false], ['landscape', 844, 390, true], ['small-landscape', 667, 375, true], ['small-portrait', 320, 720, false]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 900 });
    await page.clock.install({ time: now });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.goto(`${url}/list`, { waitUntil: 'networkidle' });
    const list = page.locator('a[data-variant]');
    assert.equal(await list.locator('button, a, input, select').count(), 0, 'whole-card links have no nested controls');
    assert(!(await list.allTextContents()).join(' ').includes('Fishery below dam'), 'fishery stays off list cards');
    const normal = page.locator('[data-variant="normal"]');
    assert((await normal.innerText()).includes('50%'), 'list shows measured generation scale');
    assert((await normal.innerText()).includes('56.0 °F'), 'list shows water temperature');
    assert((await normal.innerText()).includes('estimated from flow'), 'rack remains an estimate');
    assert(!(await page.locator('[data-variant="noTemp"]').innerText()).includes('°F'), 'missing temperature is not fabricated');
    assert(!(await page.locator('[data-variant="noReference"]').innerText()).includes('%'), 'no reference means no percentage');
    assert((await page.locator('[data-variant="stale"]').innerText()).includes('Generating at last reading'), 'old readings do not claim now');
    assert((await page.locator('[data-variant="stale"]').innerText()).includes('may have been revised'), 'old schedule retains its provenance');
    assert(!(await page.locator('[data-variant="scheduleOnly"]').innerText()).includes('No turbine generation observed'), 'missing readings are not idle');
    assert((await page.locator('[data-variant="gateDaily"]').innerText()).includes('daily avg'), 'daily release is labelled');
    assert(!(await page.locator('[data-variant="gate"]').innerText()).includes('generation'), 'gate-only dam has no generation visual');
    assert((await page.locator('[data-variant="idle"]').innerText()).includes('No turbine generation observed'), 'idle generation uses the published floor');
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
    const a = await page.locator('.dam-observed').boundingBox();
    const b = await page.getByRole('region', { name: 'Generation schedule', exact: true }).boundingBox();
    assert(wide ? b.x > a.x + a.width - 2 : b.y >= a.y + a.height, `${name}: responsive column placement`);
    const days = page.locator('details');
    assert.equal(await days.count(), 2);
    assert.equal(await days.nth(0).getAttribute('open'), '');
    assert.equal(await days.nth(1).getAttribute('open'), null);
    await days.nth(1).locator('summary').click();
    assert.equal(await days.nth(1).getAttribute('open'), '');
    await page.getByRole('button', { name: 'Include upcoming schedule' }).click();
    assert.equal(await page.getByRole('button', { name: 'Hide upcoming schedule' }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Hide upcoming schedule' }).click();
    assert(await page.getByRole('heading', { name: 'Generation history', exact: true }).isVisible());
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
      assert.match(await detail.getByRole('img', { name: /^Today:/ }).getAttribute('aria-label'), /of 11 hours/);
      // Move wall time across noon without firing interval callbacks. A return
      // to the tab must advance both charts immediately from the page clock.
      await page.clock.setFixedTime(new Date('2026-10-16T17:00:00Z'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await detail.getByRole('img', { name: /^Today:.*of 12 hours/ }).waitFor();
      const scheduleMarker = days.first().getByRole('img').locator('.pointer-events-none[style]');
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
      assert(await days.first().getByText(/2 PM–3 PM · 200 MW/).isVisible(), 'tap retains the hourly readout');
    }
    await days.nth(1).locator('summary').click();
    await page.getByRole('heading', { level: 1 }).click();
    await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    await page.close();
    console.log(`PASS ${name}: layout, disclosures, history, dialog, release provenance`);
  }
  for (const variant of ['stale', 'scheduleOnly', 'gate', 'gateDaily', 'missing', 'forecast']) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
    await page.clock.install({ time: now });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.goto(`${url}?variant=${variant}`, { waitUntil: 'networkidle' });
    const text = await page.locator('[data-dam-detail]').innerText();
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
  assert.deepEqual(errors, [], 'no browser runtime or hydration errors');
  console.log(`Screenshots: ${out}`);
} finally {
  await cleanup();
}
