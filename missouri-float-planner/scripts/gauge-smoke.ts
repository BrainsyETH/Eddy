// Playwright smoke for the redesigned gauge detail experience — run manually:
//
//   npx tsx scripts/gauge-smoke.ts [--url http://localhost:3000]
//
// Same pattern as mosw-smoke.ts: spawns `next dev` on a scratch port when no
// --url is given, intercepts the gauge API routes with SYNTHETIC fixtures so
// it runs without Supabase/USGS credentials, and asserts UI BEHAVIOR, not
// data. The scenarios are the spec's comprehension checklist:
//
//   1. RATED, trusted, with NWS stages (Van Buren-shaped): the three-question
//      summary leads, the condition chip lives in "Right now", the safety
//      sentence is the shared machine's, the chart carries labelled violet
//      stage lines, and the expanded mode opens/closes accessibly.
//   2. REFERENCE (unrated): flow-band vocabulary, "Eddy hasn't assigned a
//      recreation condition", provenance label — and NO verdict words.
//   3. STALE reading: value and age stay, interpretation goes.
//   4. FORECAST-ONLY (BDPM7-shaped): readings: [] renders a forecast chart,
//      not a crash and not "trend data unavailable".
//   5. Screenshots (desktop + mobile) for contrast/layout review.

import { chromium, type Page, type Route } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fixtureState, fixtureHistory, fixtureThresholds } from '../src/lib/gauges/__fixtures__/chart-share';
import { chartShareQuery, parseChartShare } from '../shared/chart-share';

const PORT = 3119;
const OUT_DIR = process.env.SMOKE_OUT ?? path.join(__dirname, '..', '.smoke-gauge');
let ownedFixture = false;
let server: ChildProcess | null = null;
function cleanup() {
  if (ownedFixture) { rmSync(fixtureRoute, { recursive: true, force: true }); ownedFixture = false; }
  if (server?.pid) { try { process.kill(-server.pid); } catch { /* already stopped */ } }
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { cleanup(); process.exit(1); });
const fixtureRoute = path.join(__dirname, '..', 'src/app/chart-layout-check');

// ── Fixtures ─────────────────────────────────────────────────────────────

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const HOUR = 3_600_000;

const SITE = '07067000';

const LADDER = {
  riverId: 'r-current',
  riverName: 'Current River',
  riverSlug: 'current',
  riverState: 'MO',
  isPrimary: true,
  distanceFromSectionMiles: 1.2,
  thresholdUnit: 'ft' as const,
  levelTooLow: 1.5,
  levelLow: 2,
  levelOptimalMin: 2.5,
  levelOptimalMax: 4,
  levelHigh: 5,
  levelDangerous: 7,
  floodStageFt: 10,
  altLevelTooLow: null,
  altLevelLow: null,
  altLevelOptimalMin: null,
  altLevelOptimalMax: null,
  altLevelHigh: null,
  altLevelDangerous: null,
};

function listStation(over: Record<string, unknown> = {}) {
  return {
    id: 'station-1',
    usgsSiteId: SITE,
    provider: 'usgs',
    name: 'Current River at Van Buren, MO',
    coordinates: { lng: -91.01, lat: 36.99 },
    active: true,
    gaugeHeightFt: 3.1,
    dischargeCfs: 940,
    readingTimestamp: iso(1 * HOUR),
    readingAgeHours: 1,
    readingSuspect: false,
    qualifierNote: null,
    thresholdDescriptions: null,
    thresholds: [LADDER],
    ...over,
  };
}

function detail(over: Record<string, unknown> = {}) {
  return {
    gauge: {
      id: 'station-1',
      siteId: SITE,
      name: 'Current River at Van Buren, MO',
      provider: 'usgs',
      curated: true,
      coordinates: { lng: -91.01, lat: 36.99 },
      gaugeHeightFt: 3.1,
      dischargeCfs: 940,
      readingTimestamp: iso(1 * HOUR),
      readingAgeHours: 1,
      readingSuspect: false,
      qualifierNote: null,
      flowPercentile: 46,
      seasonalContext: null,
      historyCapabilities: { maxInstantDays: 90, supportsDaily: true, supportsCustomRange: true },
      thresholds: [
        {
          riverId: LADDER.riverId,
          riverName: LADDER.riverName,
          riverSlug: LADDER.riverSlug,
          isPrimary: true,
          thresholdUnit: 'ft',
          levelTooLow: LADDER.levelTooLow,
          levelLow: LADDER.levelLow,
          levelOptimalMin: LADDER.levelOptimalMin,
          levelOptimalMax: LADDER.levelOptimalMax,
          levelHigh: LADDER.levelHigh,
          levelDangerous: LADDER.levelDangerous,
          floodStageFt: 10,
          distanceFromSectionMiles: 1.2,
        },
      ],
      floodStages: { actionFt: 6, floodFt: 10, moderateFt: 18, majorFt: 25, lid: 'VNBM7', source: 'nwps' },
      waterTemperature: { valueF: 68.4, observedAt: iso(3 * HOUR), source: 'usgs' },
      publicUrl: `https://waterdata.usgs.gov/monitoring-location/${SITE}/`,
      stationNote: null,
      ...over,
    },
  };
}

function history(over: Record<string, unknown> = {}) {
  const readings = Array.from({ length: 7 * 24 }, (_, index) => ({
    timestamp: iso((7 * 24 - index) * HOUR),
    gaugeHeightFt: 3.0 + 0.4 * Math.sin(index / 10),
    dischargeCfs: 900 + 80 * Math.sin(index / 10),
    qualifiers: ['P'],
  }));
  return {
    siteId: SITE,
    siteName: 'Current River at Van Buren, MO',
    readings,
    observedThrough: readings[readings.length - 1]?.timestamp ?? null,
    sampled: false,
    resolution: 'instant',
    statistic: 'instantaneous',
    requestedWindow: { from: iso(7 * 24 * HOUR), to: iso(0) },
    coverageWindow:
      readings.length > 0
        ? { from: readings[0].timestamp, to: readings[readings.length - 1].timestamp }
        : null,
    coverageComplete: true,
    truncationReason: null,
    typical: [],
    seasonalRange: [],
    forecast: [],
    forecastIssuedAt: null,
    sourceUrl: `https://waterdata.usgs.gov/monitoring-location/${SITE}/`,
    stats: { minDischarge: 820, maxDischarge: 980, minHeight: 2.6, maxHeight: 3.4 },
    ...over,
  };
}

// ── Route interception ───────────────────────────────────────────────────

async function intercept(
  page: Page,
  fixtures: { list: unknown; detail: unknown; history: unknown },
) {
  page.setDefaultTimeout(60_000);
  page.on('console', message => { if (message.type() === 'error') console.error('Browser console:', message.text()); });
  if (process.env.CHART_SMOKE_DEBUG) {
    page.on('request', request => console.log('Request:', request.resourceType(), new URL(request.url()).pathname));
    page.on('response', response => { if (response.request().resourceType() === 'script') console.log('Script:', response.status(), new URL(response.url()).pathname); });
  }
  page.on('pageerror', error => console.error('Browser error:', error.message));
  page.on('requestfailed', request => console.error('Failed request:', new URL(request.url()).pathname, request.failure()?.errorText));
  await page.route('**/_next/image**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>' }));
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/gauges', (route) => json(route, fixtures.list));
  await page.route(`**/api/gauges/${SITE}`, (route) => json(route, fixtures.detail));
  await page.route(`**/api/gauges/${SITE}/history*`, (route) => json(route, fixtures.history));
  await page.route('**/api/eddy-update/**', (route) => json(route, { available: false }));
  await page.route('**/api/weather**', (route) => route.fulfill({ status: 404, body: '{}' }));
  await page.route('**/api/rivers**', (route) => json(route, { rivers: [] }));
  await page.route('**/api/rivers/*/visuals*', (route) => json(route, { byLevel: [], currentCondition: 'unknown' }));
  await page.route('**/api/usgs/mo-forecast*', (route) => json(route, { entries: [] }));
}

// ── Harness ──────────────────────────────────────────────────────────────

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function waitForServer(url: string, timeoutMs = 120_000) {
  const t0 = Date.now();
  for (;;) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch { /* not up yet */ }
    if (Date.now() - t0 > timeoutMs) throw new Error(`dev server not ready after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function main() {
  const urlArg = process.argv.indexOf('--url');
  const baseUrl = urlArg > -1 ? process.argv[urlArg + 1] : `http://localhost:${PORT}`;

  if (urlArg === -1) {
    assert(!existsSync(fixtureRoute), 'refusing to overwrite a fixture route');
    mkdirSync(fixtureRoute, { recursive: true });
    ownedFixture = true;
    writeFileSync(path.join(fixtureRoute, 'HydrationFixture.tsx'), `'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GaugeHistoryChart from '@/components/gauge/GaugeHistoryChart';
import { normalizeGaugeHistory } from '@shared/history-normalize';
export default function HydrationFixture() {
  const [client] = useState(() => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['gaugeHistory', '${SITE}', 7, null, null, 'auto', null], normalizeGaugeHistory(${JSON.stringify(history())}));
    return queryClient;
  });
  return <QueryClientProvider client={client}><GaugeHistoryChart
    siteId="${SITE}" siteName="Chart hydration fixture" displayUnit="ft"
    onUnitChange={() => {}} canToggleUnit showTypical={false}
    capabilities={{ maxInstantDays: 90, supportsDaily: true, supportsCustomRange: true }}
    lastYearOn={false} onLastYearChange={() => {}} onRangeChange={() => {}} onExpand={() => {}}
  /></QueryClientProvider>;
}`);
    writeFileSync(path.join(fixtureRoute, 'page.tsx'), `import { notFound } from 'next/navigation';
import RiverGaugeDetail from '@/components/gauge/RiverGaugeDetail';
import GaugeDetailView from '@/components/gauge/GaugeDetailView';
import HydrationFixture from './HydrationFixture';
import { parseChartShare } from '@shared/chart-share';
export default async function Page({ searchParams }: { searchParams: Promise<{ river?: string; chart?: string; share?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_CHART_SMOKE !== '1') notFound();
  const { river, chart, share } = await searchParams;
  if (share) return <GaugeDetailView siteId="${SITE}" initialShareState={parseChartShare('usgs', '${SITE}', new URLSearchParams(share)) ?? undefined} />;
  if (chart) return <main className="mx-auto max-w-5xl px-4 py-8"><HydrationFixture /></main>;
  return river ? <main className="mx-auto max-w-5xl px-4 py-8"><RiverGaugeDetail riverSlug="current" /></main> : <GaugeDetailView siteId="07067000" />;
}`);
    console.log(`Starting next dev on :${PORT}…`);
    server = spawn('npx', ['next', 'dev', '--webpack', '--hostname', '127.0.0.1', '-p', String(PORT)], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env, EDDY_CHART_SMOKE: '1' },
      detached: true,
    });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const target = urlArg === -1 ? `${baseUrl}/chart-layout-check` : `${baseUrl}/gauges/${SITE}`;
  await waitForServer(target);

  const fallbackChromium = '/opt/pw-browsers/chromium';
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_PATH ??
    (existsSync(fallbackChromium) ? fallbackChromium : undefined);
  const browser = await chromium.launch({ executablePath, args: ['--disable-dev-shm-usage'] });
  try {
    if (urlArg === -1) {
      console.log('\nDesktop hydration layout:');
      const hydratedPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await intercept(hydratedPage, { list: { gauges: [listStation()] }, detail: detail(), history: history() });
      // Permit Next's inline streaming scripts, but hold the client bundles so
      // the first measurement uses the hook's null server snapshot.
      let releaseScripts!: () => void;
      const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
      await hydratedPage.route(/\/_next\/static\/.*\.js(?:\?|$)/, async route => { await scriptsReady; await route.continue(); });
      let initialHeight: number | undefined;
      try {
        await hydratedPage.goto(`${baseUrl}/chart-layout-check?chart=1`, { waitUntil: 'commit' });
        await hydratedPage.getByRole('slider').waitFor();
        initialHeight = (await hydratedPage.getByRole('slider').boundingBox())?.height;
        check('desktop reserves a 384px plot before hydration', initialHeight === 384);
        check('desktop hides Expand before hydration', !await hydratedPage.getByRole('button', { name: 'Expand', exact: true }).isVisible());
      } finally {
        releaseScripts();
      }
      await hydratedPage.getByRole('button', { name: '1Y', exact: true }).waitFor();
      const hydratedPlot = await hydratedPage.getByRole('slider').boundingBox();
      check('desktop plot height stays fixed through hydration', initialHeight === hydratedPlot?.height);
      await hydratedPage.close();
    }
    if (urlArg === -1) {
      console.log('\nShared chart restoration:');
      const state = { ...fixtureState, layers: [] as typeof fixtureState.layers, riverSlug: 'fixture' };
      for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        await intercept(page, {
          list: { gauges: [listStation()] },
          detail: detail({ thresholds: [{ ...fixtureThresholds, riverId: '22222222-2222-2222-2222-222222222222' }], timeZone: 'America/Los_Angeles' }),
          history: fixtureHistory,
        });
        const historyRequests: string[] = [];
        page.on('request', request => { if (request.url().includes('/history?')) historyRequests.push(request.url()); });
        await page.addInitScript("Object.defineProperty(navigator, 'share', { value: async function (data) { window.sharedUrl = data.url; } });");
        await page.goto(`${baseUrl}/chart-layout-check?share=${encodeURIComponent(chartShareQuery(state))}`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Share chart link', exact: true }).waitFor();
        check(`${width}px restores the original calendar despite catalog changes`, historyRequests.some(url => new URL(url).searchParams.get('tz') === state.timeZone));
        check(`${width}px uses the responsive chart presentation`, width < 1024 ? await page.getByRole('dialog').isVisible() : await page.getByRole('dialog').count() === 0);
        check(`${width}px restores scale`, await page.getByLabel('Value scale').inputValue() === 'visible');
        await page.getByRole('button', { name: 'Share chart link', exact: true }).click();
        const sharedUrl = await page.evaluate(() => (window as unknown as { sharedUrl: string }).sharedUrl);
        const restored = parseChartShare('usgs', SITE, new URL(sharedUrl).searchParams)!;
        check(`${width}px re-sharing preserves dates, zoom and scale`, JSON.stringify(restored.loaded) === JSON.stringify(state.loaded) && JSON.stringify(restored.visible) === JSON.stringify(state.visible) && restored.scale === state.scale);
        check(`${width}px re-sharing uses the resolved identity and keeps the slug`, restored.riverId === '22222222-2222-2222-2222-222222222222' && restored.riverSlug === 'fixture');
        let releaseImage!: () => void;
        const imageReady = new Promise<void>(resolve => { releaseImage = resolve; });
        await page.route('**/api/share/chart/**/image?*', async route => {
          await imageReady;
          await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ code: 'shared_view_unavailable' }) });
        });
        await page.getByRole('button', { name: 'Preview share image', exact: true }).click();
        await page.getByRole('button', { name: 'Preparing image…', exact: true }).waitFor();
        check(`${width}px link sharing remains available during rendering`, await page.getByRole('button', { name: 'Share chart link', exact: true }).isEnabled());
        releaseImage();
        await page.getByRole('status').filter({ hasText: 'This saved view is no longer available' }).waitFor();
        check(`${width}px unavailable image has a useful recovery message`, true);
        await page.screenshot({ path: path.join(OUT_DIR, `shared-${width}.png`), fullPage: true });
        await page.setViewportSize({ width: width < 1024 ? 1440 : 390, height: 1000 });
        if (width >= 1024) await page.getByRole('button', { name: 'Expand', exact: true }).click();
        check(`${width}px resize keeps scale`, await page.getByLabel('Value scale').inputValue() === 'visible');
        await page.getByRole('button', { name: 'Show latest', exact: true }).click();
        await page.getByText('Last 7 days', { exact: true }).waitFor();
        check(`${width}px Show latest clears shared dates`, await page.getByText(/Shared view ·/).count() === 0);
        await page.close();
      }
    }
    // ── 1. Rated + trusted + NWS stages ──
    console.log('\nRated station (trusted reading, NWS stages):');
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
      await intercept(page, { list: { gauges: [listStation()] }, detail: detail(), history: history() });
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await page.getByRole('slider').first().waitFor({ timeout: 30_000 });
      const body = (await page.textContent('body')) ?? '';

      check('three-question summary present', /Right now/.test(body) && /Safety/.test(body) && /Forecast/.test(body));
      check('reading with unit and age in "Right now"', /3\.10 ft/.test(body));
      check('safety speaks the shared machine', /Below NWS action stage\./.test(body));
      check('no forecast → says no forecast published', /No official river forecast published\./.test(body));
      check('condition chip present (no separate "Eddy-rated" badge)', !/Eddy-rated/i.test(body));
      check('NWS stage line labelled on the chart', /NWS action stage/.test(body));
      check('water temperature with measurement age', /Water Temp/i.test(body) && /68\.4°F/.test(body) && /measured/i.test(body));
      check('presets are 24H/7D/30D (14 is gone)', /24H/.test(body) && !/14D/.test(body));

      await page.screenshot({ path: path.join(OUT_DIR, 'rated-desktop.png'), fullPage: true });

      check('desktop exposes long ranges without Expand', await page.getByRole('button', { name: '90D', exact: true }).isVisible() && await page.getByRole('button', { name: 'Expand', exact: true }).count() === 0);
      const historyRequests: string[] = [];
      page.on('request', request => { if (request.url().includes('/history?')) historyRequests.push(request.url()); });
      await page.getByRole('button', { name: '1Y', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('button[aria-pressed="true"]') !== null);
      await page.getByText('Last year', { exact: true }).waitFor();
      check('one-year selection requests one-year history', historyRequests.some(url => new URL(url).searchParams.get('days') === '365'));
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      check('zoom exposes reset inline', await page.getByRole('button', { name: 'Reset zoom', exact: true }).isVisible());
      await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
      await page.getByRole('button', { name: 'Custom', exact: true }).click();
      await page.getByLabel('From date', { exact: true }).fill('2026-09-10');
      await page.getByLabel('To date', { exact: true }).fill('2026-09-01');
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      check('invalid dates get a visible correction', await page.getByRole('alert').filter({ hasText: 'on or after' }).isVisible());
      await page.getByLabel('To date', { exact: true }).fill('2026-09-30');
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await page.getByText('2026-09-10 to 2026-09-30', { exact: true }).waitFor();
      check('custom selection requests explicit dates', historyRequests.some(url => new URL(url).searchParams.has('from') && new URL(url).searchParams.has('to')));
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
      const download = await downloaded;
      await download.saveAs(path.join(OUT_DIR, 'history.csv'));
      check('export keeps its statistic in the filename', download.suggestedFilename().includes('instantaneous'));
      await page.locator('summary').filter({ hasText: 'Data table' }).click();
      check('data table is available inline', await page.getByRole('table').isVisible());
      await page.locator('summary').filter({ hasText: 'Data table' }).click();
      await page.getByRole('button', { name: '30D', exact: true }).click();
      await page.getByRole('button', { name: 'cfs', exact: true }).click();
      await page.getByRole('button', { name: 'Compare', exact: true }).waitFor();
      await page.screenshot({ path: path.join(OUT_DIR, 'history-desktop.png'), fullPage: true });

      // Responsive state and mobile dialog preserve the chosen question.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Expand', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      check('mobile Expand preserves 30D and cfs', await dialog.getByRole('button', { name: '30D', exact: true }).getAttribute('aria-pressed') === 'true' && await dialog.getByRole('button', { name: 'cfs', exact: true }).getAttribute('aria-pressed') === 'true');
      await dialog.getByRole('button', { name: '90D', exact: true }).click();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Expand', exact: true }).waitFor();
      check('Escape restores focus to Expand', await page.getByRole('button', { name: 'Expand', exact: true }).evaluate(element => element === document.activeElement));
      check('mobile close preserves long-range selection', await page.getByText('Last 90 days', { exact: true }).isVisible());
      check('compact 90D selection stays highlighted', await page.getByRole('group', { name: 'History range' }).getByRole('button', { name: '90D', exact: true }).getAttribute('aria-pressed') === 'true');

      await page.setViewportSize({ width: 820, height: 1180 });
      await page.getByRole('button', { name: 'Expand', exact: true }).click();
      await dialog.waitFor();
      await dialog.getByRole('button', { name: '1Y', exact: true }).click();
      await page.setViewportSize({ width: 1180, height: 820 });
      await dialog.waitFor({ state: 'detached' });
      await page.setViewportSize({ width: 820, height: 1180 });
      await page.getByRole('button', { name: 'Expand', exact: true }).waitFor();
      check('portrait return leaves the dialog closed', await dialog.count() === 0);
      check('compact 1Y selection stays highlighted after rotation', await page.getByRole('group', { name: 'History range' }).getByRole('button', { name: '1Y', exact: true }).getAttribute('aria-pressed') === 'true');
      await page.getByRole('button', { name: 'Expand', exact: true }).focus();
      await page.keyboard.press('Tab');
      check('portrait return releases the focus trap', await page.getByRole('group', { name: 'History range' }).getByRole('button', { name: '24H', exact: true }).evaluate(element => element === document.activeElement));

      await page.getByRole('button', { name: 'Expand', exact: true }).click();
      await dialog.getByRole('button', { name: 'Custom', exact: true }).click();
      await dialog.getByLabel('From date', { exact: true }).fill('2026-09-10');
      await dialog.getByLabel('To date', { exact: true }).fill('2026-09-30');
      await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
      await page.keyboard.press('Escape');
      const compactCustom = page.getByRole('group', { name: 'History range' }).getByRole('button', { name: 'Custom', exact: true });
      check('compact Custom selection stays highlighted', await compactCustom.getAttribute('aria-pressed') === 'true');
      await compactCustom.click();
      check('compact Custom opens the selected date editor', await dialog.getByLabel('From date', { exact: true }).inputValue() === '2026-09-10' && await dialog.getByLabel('To date', { exact: true }).inputValue() === '2026-09-30');
      await dialog.getByRole('button', { name: '90D', exact: true }).click();
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1024, height: 900 });
      await page.getByRole('button', { name: '90D', exact: true }).waitFor();
      check('desktop resize preserves selection', await page.getByRole('button', { name: '90D', exact: true }).getAttribute('aria-pressed') === 'true');
      check('1024px report fits the viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.close();
    }

    if (urlArg === -1) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      await intercept(page, { list: { gauges: [listStation()] }, detail: detail(), history: history() });
      await page.goto(`${baseUrl}/chart-layout-check?river=1`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: '1Y', exact: true }).waitFor();
      check('river Live Report exposes the same desktop controls', await page.getByRole('button', { name: 'Export CSV', exact: true }).isVisible());
      await page.screenshot({ path: path.join(OUT_DIR, 'river-desktop.png'), fullPage: true });
      await page.close();
    }

    // ── 2. Reference (unrated) station ──
    console.log('\nReference station (unrated — comparison, never a verdict):');
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      await intercept(page, {
        list: { gauges: [listStation({ thresholds: null })] },
        detail: detail({
          curated: false,
          thresholds: null,
          floodStages: null,
          waterTemperature: null,
          flowPercentile: 18,
          seasonalContext: {
            unit: 'cfs',
            parameterCode: '00060',
            percentile: 18,
            band: 'lower',
            yearsOfRecord: 44,
            asOf: iso(0),
          },
        }),
        history: history(),
      });
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      // Wait for the detail fetch to resolve the tier — the chip and caption
      // paint together, and a fixed sleep raced the second compile.
      await page.locator('text=Official USGS gauge').waitFor();
      await page.waitForTimeout(500);
      const body = (await page.textContent('body')) ?? '';

      check('provenance label present', /Official USGS gauge/.test(body));
      check('declines the recreation verdict in words', /hasn.t assigned a recreation condition/i.test(body));
      // A locator, not a body regex: textContent concatenates adjacent nodes
      // ("Holding steadyLowerOfficial…"), so \b never fires around the chip.
      check(
        'flow-band chip speaks comparison ("Lower")',
        (await page.getByText('Lower', { exact: true }).count()) > 0,
      );
      check('no official stages → says exactly that', /No official flood stages published\./.test(body));
      check(
        'summary carries no verdict vocabulary for the band',
        !/Too Low/.test(body) && !/Floatable/i.test(body),
      );
      await page.screenshot({ path: path.join(OUT_DIR, 'reference-desktop.png'), fullPage: true });
      await page.close();
    }

    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await intercept(page, { list: { gauges: [listStation()] }, detail: detail({ provider: 'nws', historyCapabilities: { maxInstantDays: 30, supportsDaily: false, supportsCustomRange: false } }), history: history() });
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: '1Y', exact: true }).waitFor();
      check('limited source disables 1Y with explanation', await page.getByRole('button', { name: '1Y', exact: true }).getAttribute('aria-disabled') === 'true' && (await page.getByRole('button', { name: '1Y', exact: true }).getAttribute('title'))?.includes('30 days') === true);
      check('limited source disables custom dates', await page.getByRole('button', { name: 'Custom', exact: true }).getAttribute('aria-disabled') === 'true');
      await page.close();
    }

    // ── 3. Stale reading ──
    console.log('\nStale reading (value and age stay; interpretation goes):');
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      await intercept(page, {
        list: { gauges: [listStation({ readingAgeHours: 14, readingTimestamp: iso(14 * HOUR) })] },
        detail: detail({ readingAgeHours: 14, readingTimestamp: iso(14 * HOUR) }),
        history: history(),
      });
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await page.getByText(/has not reported recently/i).first().waitFor();
      const body = (await page.textContent('body')) ?? '';

      check('the number itself stays', /3\.10 ft/.test(body));
      check('staleness is stated', /has not reported recently/i.test(body));
      check('untrusted current → comparison unavailable', /current comparison unavailable/i.test(body));
      await page.close();
    }

    // ── 4. Forecast-only station ──
    console.log('\nForecast-only station (readings: [] is a chart, not a crash):');
    {
      const forecast = Array.from({ length: 12 }, (_, index) => ({
        timestamp: iso(-((index + 1) * 6) * HOUR),
        gaugeHeightFt: 8 + index * 0.5,
        dischargeCfs: null,
      }));
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      await intercept(page, {
        list: { gauges: [listStation({ gaugeHeightFt: null, dischargeCfs: null, readingAgeHours: null, readingTimestamp: null })] },
        detail: detail({ gaugeHeightFt: null, dischargeCfs: null, readingAgeHours: null, readingTimestamp: null }),
        history: history({
          readings: [],
          observedThrough: null,
          coverageWindow: null,
          coverageComplete: false,
          forecast,
          forecastIssuedAt: iso(2 * HOUR),
        }),
      });
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await page.getByText(/NWS forecast/).first().waitFor();
      const body = (await page.textContent('body')) ?? '';

      check('page renders (no crash) with an empty observed series', body.length > 200);
      check('forecast is attributed', /NWS forecast/.test(body));
      check(
        'chart draws the forecast rather than declaring data unavailable',
        !/trend data unavailable/i.test(body),
      );
      await page.screenshot({ path: path.join(OUT_DIR, 'forecast-only-desktop.png'), fullPage: true });
      await page.close();
    }

    // ── 5. Mobile screenshot for layout review ──
    console.log('\nMobile layout:');
    {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      await intercept(page, { list: { gauges: [listStation()] }, detail: detail(), history: history() });
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await page.getByRole('slider').waitFor();
      await page.screenshot({ path: path.join(OUT_DIR, 'rated-mobile.png'), fullPage: true });
      check('mobile screenshot captured', true, OUT_DIR);
      await page.close();
    }
  } finally {
    await browser.close();
    cleanup();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  cleanup();
  console.error(e);
  process.exit(1);
});
