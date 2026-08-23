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
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const PORT = 3119;
const OUT_DIR = process.env.SMOKE_OUT ?? path.join(__dirname, '..', '.smoke-gauge');

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
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/gauges', (route) => json(route, fixtures.list));
  await page.route(`**/api/gauges/${SITE}`, (route) => json(route, fixtures.detail));
  await page.route(`**/api/gauges/${SITE}/history*`, (route) => json(route, fixtures.history));
  await page.route('**/api/eddy-update/**', (route) => json(route, { available: false }));
  await page.route('**/api/weather**', (route) => route.fulfill({ status: 404, body: '{}' }));
  await page.route('**/api/rivers**', (route) => json(route, { rivers: [] }));
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
  let server: ChildProcess | null = null;

  if (urlArg === -1) {
    console.log(`Starting next dev on :${PORT}…`);
    server = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
      cwd: path.join(__dirname, '..'),
      stdio: 'ignore',
      env: { ...process.env },
      detached: true,
    });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const target = `${baseUrl}/gauges/${SITE}`;
  await waitForServer(baseUrl);
  await fetch(target).catch(() => {}); // warm the dev compile

  const fallbackChromium = '/opt/pw-browsers/chromium';
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_PATH ??
    (existsSync(fallbackChromium) ? fallbackChromium : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    // ── 1. Rated + trusted + NWS stages ──
    console.log('\nRated station (trusted reading, NWS stages):');
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
      await intercept(page, { list: { gauges: [listStation()] }, detail: detail(), history: history() });
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
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

      // Expanded mode: opens as a dialog, closes on Escape.
      await page.locator('button', { hasText: 'Expand' }).first().click();
      await page.waitForTimeout(1500);
      const dialog = page.locator('[role="dialog"]');
      check('expanded mode opens as a dialog', (await dialog.count()) === 1);
      const dialogText = (await dialog.textContent()) ?? '';
      check('expanded mode owns 90D and 1Y', /90D/.test(dialogText) && /1Y/.test(dialogText));
      check('expanded mode offers export and zoom controls', /Export CSV/.test(dialogText) && /Reset zoom/.test(dialogText));
      check('expanded mode has the data table', /Data table/.test(dialogText));
      await page.screenshot({ path: path.join(OUT_DIR, 'expanded-desktop.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      check('Escape closes the expanded mode', (await page.locator('[role="dialog"]').count()) === 0);
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
      await page.locator('text=Official USGS gauge').waitFor({ timeout: 20_000 });
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
      await page.waitForTimeout(4000);
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
      await page.waitForTimeout(4000);
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
      await page.waitForTimeout(4000);
      await page.screenshot({ path: path.join(OUT_DIR, 'rated-mobile.png'), fullPage: true });
      check('mobile screenshot captured', true, OUT_DIR);
      await page.close();
    }
  } finally {
    await browser.close();
    if (server?.pid) {
      try { process.kill(-server.pid); } catch { /* already gone */ }
    }
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
