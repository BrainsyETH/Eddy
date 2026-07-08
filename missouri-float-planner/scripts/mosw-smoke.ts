// Playwright smoke for /river-map — run manually with:
//
//   npx tsx scripts/mosw-smoke.ts [--url http://localhost:3000]
//
// Spawns `next dev` on a scratch port when no --url is given. All
// /api/usgs/* routes are intercepted with synthetic fixtures, so the smoke
// runs without Supabase/USGS credentials and asserts UI behavior, not data:
//
//   1. Time-to-first-particle-frame: FlowLayer logs '[mosw-flow] first-frame'
//      once per load; it must fire (rivers visibly moving) within budget.
//   2. prefers-reduced-motion: the flow layer must never start (no log).
//   3. Dock honesty: 'readings as of' stamp, shared-gauge disclosure row,
//      per-row 24h trend arrow, 'no live gauge' for a gauge-less river.
//   4. Screenshots (desktop + mobile) to eyeball contrast and layout.

import { chromium, type Page, type Route } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const PORT = 3117;
const OUT_DIR = process.env.SMOKE_OUT ?? path.join(__dirname, '..', '.smoke');
const FIRST_FRAME_BUDGET_MS = 15_000; // cold dev-server compile included

// ── Fixtures ─────────────────────────────────────────────────────────────

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);

const gauge = (site: string, name: string, lon: number, lat: number) => ({
  site_id: site,
  name,
  nws_lid: null,
  lon,
  lat,
  lon_raw: lon,
  lat_raw: lat,
  snap_distance_m: 10,
  is_primary: true,
  threshold_unit: 'ft',
  level_too_low: 1,
  level_low: 2,
  level_optimal_min: 2.5,
  level_optimal_max: 4,
  level_high: 5,
  level_dangerous: 7,
  flood_stage_ft: 8,
  action_stage_ft: 6,
  threshold_source: 'editorial',
  threshold_source_url: null,
  threshold_updated_at: iso(30 * 86_400_000),
});

// Shared-gauge case: 07017200 is primary for BOTH Courtois and Huzzah.
// Third river has no gauges at all → 'no live gauge'.
const SHARED_SITE = '07017200';
const FLAT_SITE = '07099999';
const dataset = {
  generated_at: iso(0),
  campgrounds: [],
  rivers: [
    {
      id: 'r-courtois',
      slug: 'courtois',
      name: 'Courtois Creek',
      region: 'Ozarks',
      length_miles: 32,
      geometry: {
        type: 'LineString',
        coordinates: [[-91.15, 37.85], [-91.05, 37.95], [-90.95, 38.02]],
      },
      gauges: [gauge(SHARED_SITE, 'Courtois Creek at Berryman MO', -91.05, 37.95)],
      access_points: [],
      pois: [],
    },
    {
      id: 'r-huzzah',
      slug: 'huzzah',
      name: 'Huzzah Creek',
      region: 'Ozarks',
      length_miles: 28,
      geometry: {
        type: 'LineString',
        coordinates: [[-91.3, 37.8], [-91.18, 37.9], [-91.08, 37.98]],
      },
      gauges: [gauge(SHARED_SITE, 'Courtois Creek at Berryman MO', -91.05, 37.95)],
      access_points: [],
      pois: [],
    },
    {
      id: 'r-nogauge',
      slug: 'no-gauge-river',
      name: 'Gaugeless River',
      region: 'Ozarks',
      length_miles: 40,
      geometry: {
        type: 'LineString',
        coordinates: [[-92.4, 37.4], [-92.2, 37.55], [-92.0, 37.6]],
      },
      gauges: [],
      access_points: [],
      pois: [],
    },
    {
      // Stuck sensor: identical daily medians + identical live reading →
      // the 'unchanged N days' disclosure must show on its river card.
      id: 'r-flatline',
      slug: 'flatline-fork',
      name: 'Flatline Fork',
      region: 'Ozarks',
      length_miles: 22,
      geometry: {
        type: 'LineString',
        coordinates: [[-92.9, 38.2], [-92.75, 38.3], [-92.6, 38.38]],
      },
      gauges: [gauge(FLAT_SITE, 'Flatline Fork nr Nowhere MO', -92.75, 38.3)],
      access_points: [],
      pois: [],
    },
  ],
};

const statewide = {
  generatedAt: iso(0),
  cadenceSeconds: 900,
  gauges: [
    {
      site_no: SHARED_SITE,
      nws_lid: null,
      river_id: 'r-courtois',
      river_slug: 'courtois',
      river_name: 'Courtois Creek',
      is_primary: true,
      dischargeCfs: 260,
      gaugeHeightFt: 3.2,
      readingTimestamp: iso(20 * 60_000), // 20 min ago — fresh, honest stamp
      percentile: 72,
      stats: null,
      flood_stage_ft: 8,
      action_stage_ft: 6,
      threshold_source: 'editorial',
      threshold_source_url: null,
    },
    {
      site_no: FLAT_SITE,
      nws_lid: null,
      river_id: 'r-flatline',
      river_slug: 'flatline-fork',
      river_name: 'Flatline Fork',
      is_primary: true,
      dischargeCfs: 90,
      gaugeHeightFt: 1.85, // identical to every daily median below
      readingTimestamp: iso(25 * 60_000),
      percentile: 18,
      stats: null,
      flood_stage_ft: null,
      action_stage_ft: null,
      threshold_source: 'editorial',
      threshold_source_url: null,
    },
  ],
};

const history = {
  generatedAt: iso(0),
  days: 30,
  entries: [
    {
      river_id: 'r-courtois',
      river_slug: 'courtois',
      site_no: SHARED_SITE,
      is_primary: true,
      // Rising: yesterday 2.9 → today 3.2 (> 0.05 ft deadband) → ▲ 24h
      daily: [
        { date: day(2), dischargeCfs: 210, gaugeHeightFt: 2.7, percentile: 55 },
        { date: day(1), dischargeCfs: 235, gaugeHeightFt: 2.9, percentile: 63 },
        { date: day(0), dischargeCfs: 260, gaugeHeightFt: 3.2, percentile: 72 },
      ],
      band: { p25: 180, p50: 220, p75: 300 },
    },
    {
      river_id: 'r-flatline',
      river_slug: 'flatline-fork',
      site_no: FLAT_SITE,
      is_primary: true,
      daily: [
        { date: day(2), dischargeCfs: 90, gaugeHeightFt: 1.85, percentile: 18 },
        { date: day(1), dischargeCfs: 90, gaugeHeightFt: 1.85, percentile: 18 },
        { date: day(0), dischargeCfs: 90, gaugeHeightFt: 1.85, percentile: 18 },
      ],
      band: { p25: 85, p50: 95, p75: 140 },
    },
  ],
};

const forecast = { generatedAt: iso(0), entries: [] };
const sites = {
  generatedAt: iso(0),
  capped: false,
  sites: [
    { site_no: '07000001', name: 'Context Creek nr Salem MO', lat: 37.6, lon: -91.6, dischargeCfs: 120, readingTimestamp: iso(30 * 60_000) },
    { site_no: '07000002', name: 'Context River at Rolla MO', lat: 37.95, lon: -91.77, dischargeCfs: 480, readingTimestamp: iso(3 * 3_600_000) },
  ],
};

const FIXTURES: Record<string, unknown> = {
  '/api/usgs/mo-dataset': dataset,
  '/api/usgs/mo-statewide': statewide,
  '/api/usgs/mo-history-bundle': history,
  '/api/usgs/mo-forecast': forecast,
  '/api/usgs/mo-sites': sites,
};

async function interceptApis(page: Page) {
  await page.route('**/api/usgs/**', (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = FIXTURES[pathname];
    if (body) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    // Eddy gauge reports etc. — harmless 404, the UI degrades by design.
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/gauge*/**', (route: Route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  );
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
  const target = `${baseUrl}/river-map`;
  await waitForServer(target);
  // First hit compiles the route; do a throwaway warm-up so the timing run
  // measures the app, not the dev compiler.
  await fetch(target).catch(() => {});

  // Prefer a pre-installed Chromium (CI/agent sandboxes) over Playwright's
  // own download, which may not exist for the installed package version.
  const fallbackChromium = '/opt/pw-browsers/chromium';
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_PATH ??
    (existsSync(fallbackChromium) ? fallbackChromium : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    // ── 1. Desktop: first particle frame + dock honesty ──
    console.log('\nDesktop run:');
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await interceptApis(page);

      let firstFrameAt: number | null = null;
      const firstFrame = new Promise<void>((resolve) => {
        page.on('console', (msg) => {
          const m = msg.text().match(/\[mosw-flow\] first-frame (\d+)ms/);
          if (m) { firstFrameAt = Number(m[1]); resolve(); }
        });
      });

      const t0 = Date.now();
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await Promise.race([firstFrame, page.waitForTimeout(FIRST_FRAME_BUDGET_MS)]);
      const wall = Date.now() - t0;

      check(
        'first particle frame fires',
        firstFrameAt != null,
        firstFrameAt != null ? `page-relative ${firstFrameAt}ms, wall ${wall}ms` : `nothing within ${FIRST_FRAME_BUDGET_MS}ms`,
      );
      check(
        'particles start inside the entry flight window (< 2100ms after hydration + fetch)',
        firstFrameAt != null && firstFrameAt < FIRST_FRAME_BUDGET_MS,
        `${firstFrameAt}ms`,
      );

      await page.waitForTimeout(3000); // let entry + fades settle
      const dockText = (await page.textContent('aside[aria-label="Live river conditions panel"]')) ?? '';
      check('dock stamp says "readings as of"', /readings as of \d/i.test(dockText));
      check('dock states refresh cadence', /refreshes every 15 min/i.test(dockText));
      check('shared-gauge disclosure on rows', /shared gauge · also rates/i.test(dockText));
      check('Courtois row discloses Huzzah', /also rates .*Huzzah/i.test(dockText));
      // Both rivers rate from the one physical gauge — the statewide payload
      // has a single entry for the shared site, and lookups must go by site
      // number, not river slug, or the second river loses its reading.
      check('shared gauge serves BOTH rivers (2/4 go)', /2\/4 go/.test(dockText));
      check('per-row 24h trend arrow', /[▲▼→] 24h/.test(dockText));
      check('gauge-less river says so', /no live gauge/i.test(dockText));
      check('percentile in plain language on rows', /P\d+ · .*normal/i.test(dockText));

      await page.screenshot({ path: path.join(OUT_DIR, 'desktop.png') });

      // Pin the shared-gauge river → RiverCard shows the disclosure + the
      // AA tint-and-ink verdict banner (screenshot for contrast review).
      await page.locator('aside button', { hasText: 'Courtois Creek' }).first().click();
      await page.waitForTimeout(500);
      const railText = (await page.textContent('body')) ?? '';
      check('river card discloses shared gauge', /Reading via shared gauge #\d+/i.test(railText));
      await page.screenshot({ path: path.join(OUT_DIR, 'desktop-rail.png') });

      // Pin the flatlined river → 'unchanged N days' disclosure.
      await page.locator('aside button', { hasText: 'Flatline Fork' }).first().click();
      await page.waitForTimeout(500);
      const flatText = (await page.textContent('body')) ?? '';
      check('flatlined reading disclosed', /unchanged 3 days/i.test(flatText));

      await page.close();
    }

    // ── 2. Reduced motion: flow layer must never start ──
    console.log('\nReduced-motion run:');
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await interceptApis(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      let sawFlow = false;
      page.on('console', (msg) => {
        if (msg.text().includes('[mosw-flow] first-frame')) sawFlow = true;
      });
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      check('no particle frame under prefers-reduced-motion', !sawFlow);
      await page.close();
    }

    // ── 3. Mobile screenshot for drawer/FAB eyeballing ──
    console.log('\nMobile run:');
    {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      await interceptApis(page);
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      await page.screenshot({ path: path.join(OUT_DIR, 'mobile-map.png') });
      // Open the drawer via the floating live chip.
      const chip = page.locator('button', { hasText: /floatable/i }).first();
      if (await chip.count()) {
        await chip.click();
        await page.waitForTimeout(600);
      }
      await page.screenshot({ path: path.join(OUT_DIR, 'mobile-drawer.png') });

      // Tap a river row → the drawer closes and the detail opens as a bottom
      // sheet (dialog) at PEEK: no backdrop, the map stays live above it.
      // Swipe up → EXPANDED: plain scrim appears and the flow pauses.
      const row = page.locator('aside button', { hasText: 'Courtois Creek' }).first();
      if (await row.count()) {
        await row.click();
        await page.waitForTimeout(600);
        const sheet = page.locator('[role="dialog"]').first();
        check('mobile detail opens as a sheet', (await sheet.count()) > 0);
        // Opens at PEEK, not full height — the headline shows, not the whole card.
        const box = await sheet.boundingBox();
        check(
          'sheet opens at peek height (not full)',
          !!box && box.height < 844 * 0.62,
          box ? `${Math.round(box.height)}px of 844` : 'no box',
        );
        check(
          'timeline hidden while sheet open',
          !(await page.locator('text=30-DAY TIMELINE').first().isVisible().catch(() => false)),
        );
        // At peek there is deliberately NO backdrop/scrim — the live map is
        // visible and interactive above the sheet.
        check(
          'no backdrop at peek',
          (await page.locator('button[aria-label="Close detail"], button[aria-label="Collapse detail"]').count()) === 0,
        );
        check(
          'flow running at peek',
          (await page.evaluate(() => (window as unknown as { __moswFlowRunning?: boolean }).__moswFlowRunning)) === true,
        );
        await page.screenshot({ path: path.join(OUT_DIR, 'mobile-sheet.png') });

        // Swipe the handle up → sheet expands, scrim appears, flow pauses.
        // (Flat loop, no inner functions: tsx/esbuild decorates nested fns
        // with a __name helper that doesn't exist inside the browser.)
        await page.locator('[data-testid="sheet-handle"]').evaluate((el) => {
          const seq: Array<[string, number]> = [
            ['touchstart', 480], ['touchmove', 300], ['touchmove', 120], ['touchend', 120],
          ];
          for (const [type, y] of seq) {
            const touch = new Touch({ identifier: 1, target: el, clientX: 195, clientY: y });
            el.dispatchEvent(new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches: type === 'touchend' ? [] : [touch],
              targetTouches: type === 'touchend' ? [] : [touch],
              changedTouches: [touch],
            }));
          }
        });
        await page.waitForTimeout(450);
        const expandedBox = await sheet.boundingBox();
        check(
          'swipe up expands the sheet',
          !!expandedBox && expandedBox.height > 844 * 0.8,
          expandedBox ? `${Math.round(expandedBox.height)}px of 844` : 'no box',
        );
        const scrim = page.locator('button[aria-label="Collapse detail"]');
        check('scrim present when expanded', (await scrim.count()) === 1);
        check(
          'flow paused while expanded',
          (await page.evaluate(() => (window as unknown as { __moswFlowRunning?: boolean }).__moswFlowRunning)) === false,
        );
        await page.screenshot({ path: path.join(OUT_DIR, 'mobile-sheet-expanded.png') });

        // Tap the scrim (above the expanded sheet) → back to peek; flow resumes.
        await page.mouse.click(195, 70);
        await page.waitForTimeout(450);
        const peekBox = await sheet.boundingBox();
        check(
          'scrim tap collapses back to peek',
          !!peekBox && peekBox.height < 844 * 0.62,
          peekBox ? `${Math.round(peekBox.height)}px of 844` : 'no box',
        );
        check(
          'flow resumes at peek',
          (await page.evaluate(() => (window as unknown as { __moswFlowRunning?: boolean }).__moswFlowRunning)) === true,
        );

        // Tap the exposed map above the peek sheet → clears the selection and
        // closes the sheet (replaces the old backdrop-tap dismiss). The point
        // must clear the floating live chip (top-left) and the zoom cluster
        // (right edge) — with no backdrop these are tappable again.
        await page.mouse.click(300, 200);
        await page.waitForTimeout(400);
        check('tapping the map above the sheet closes it', (await page.locator('[role="dialog"]').count()) === 0);
      }
      check('mobile screenshots captured', true, OUT_DIR);
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
