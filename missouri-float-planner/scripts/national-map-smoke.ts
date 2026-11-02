// Playwright smoke for the national Live River Map (/river-map).
//
//   node --import tsx scripts/national-map-smoke.ts            # starts its own dev server
//   node --import tsx scripts/national-map-smoke.ts --url http://localhost:3000
//
// Fixture-backed: /api/river-map/* is intercepted with synthetic frames built
// by the real encoders (src/lib/national-map/frame.ts), so it needs no
// Supabase, USGS or NOAA access. It checks the plan's contract mechanically:
//   * the map draws (geometry + marks) with Explore chrome and a freshness line;
//   * Map only shows NO text and NO controls once idle;
//   * the first tap reveals the tray instead of opening a gauge; it hides again;
//   * Escape leaves fullscreen;
//   * a fully stale frame stops data-driven motion (the fx layer stays empty);
//   * search finds a station and opens its details;
//   * preferences never touch the planner's gauge-layer keys.

import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildFrame, type LatestInput, type NwsInput } from '../src/lib/national-map/frame';

const PORT = 3119;
const OUT_DIR = process.env.SMOKE_OUT ?? path.join(__dirname, '..', '.smoke');
const NOW = Date.now();
const TRAY_IDLE_MS = 8000;

// A coarse lattice over the lower 48, plus Alaska and Hawaii stations.
function fixtureStations() {
  const rows: Array<[string, number, number, string, 0 | 1, string, string]> = [];
  let n = 0;
  for (let lng = -123; lng <= -70; lng += 1.5) {
    for (let lat = 30; lat <= 47; lat += 1.5) {
      const id = String(10000000 + n++);
      rows.push([id, lng, lat, 'MO', 0, `Fixture Creek ${id}`, 'Fixture Creek']);
    }
  }
  rows.push(['15565447', -149.9, 61.2, 'AK', 0, 'Ship Creek at Anchorage, AK', 'Ship Creek']);
  rows.push(['16247100', -157.8, 21.4, 'HI', 0, 'Manoa Stream at Honolulu, HI', 'Manoa Stream']);
  rows.push(['07019000', -90.59, 38.51, 'MO', 1, 'Meramec River near Eureka, MO', 'Meramec River']);
  return { v: 1, generatedAt: new Date(NOW).toISOString(), rows };
}

function fixtureFrame(ageMs: number) {
  const stations = fixtureStations().rows;
  const latest: LatestInput[] = stations.map(([siteId], i) => ({
    siteId,
    dischargeCfs: 100 + i,
    gaugeHeightFt: 2 + (i % 5) / 10,
    readingTimestamp: new Date(NOW - ageMs - 20 * 60_000).toISOString(),
    suspect: false,
    flowPercentile: (i * 37) % 100,
    fetchedAt: new Date(NOW - ageMs).toISOString(),
  }));
  const nws: NwsInput[] = [
    { lid: 'EURM7', lng: -90.59, lat: 38.51, observed: 'major', observedAt: Math.floor((NOW - ageMs - 30 * 60_000) / 1000), observedValue: 28.1, units: 'ft', forecast: 'moderate', forecastValidAt: null, forecastIssuedAt: null, name: '' },
    { lid: 'ABCD1', lng: -97, lat: 35, observed: 'not_defined', observedAt: null, observedValue: null, units: 'ft', forecast: 'unknown', forecastValidAt: null, forecastIssuedAt: null, name: 'Undefined Creek' },
  ];
  return buildFrame({
    capturedAt: new Date(NOW - ageMs),
    latest,
    nws,
    lidToSite: new Map([['EURM7', '07019000']]),
    noaaOk: true,
  });
}

async function intercept(page: Page, frameAgeMs: number) {
  const frame = JSON.stringify(fixtureFrame(frameAgeMs));
  const stations = JSON.stringify(fixtureStations());
  await page.route('**/api/river-map/stations', (r) => r.fulfill({ contentType: 'application/json', body: stations }));
  await page.route('**/api/river-map/frame**', (r) => r.fulfill({ contentType: 'application/json', body: frame }));
  await page.route('**/api/gauges/*/history**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ readings: [] }) }));
}

async function waitForServer(url: string) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(60_000) })).ok) return;
    } catch {
      /* compiling */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server never answered ${url}`);
}

/** Sum of alpha in a canvas layer under the map stage (0 = nothing drawn). */
function layerInk(page: Page, nth: number) {
  return page.evaluate((i) => {
    const c = document.querySelectorAll<HTMLCanvasElement>('[aria-roledescription="map"] canvas')[i];
    const g = c.getContext('2d')!;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let k = 3; k < d.length; k += 16) sum += d[k];
    return sum;
  }, nth);
}

/** Text a person could actually see inside the map root. */
function visibleText(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-presentation]')!;
    const out: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      const el = n.parentElement;
      if (!text || !el) continue;
      let visible = true;
      for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || e.classList.contains('sr-only')) {
          visible = false;
          break;
        }
      }
      const r = el.getBoundingClientRect();
      if (visible && r.width > 0 && r.height > 0) out.push(text);
    }
    return out;
  });
}

async function main() {
  const urlArg = process.argv.indexOf('--url');
  const baseUrl = urlArg > -1 ? process.argv[urlArg + 1] : `http://127.0.0.1:${PORT}`;
  let server: ChildProcess | null = null;
  if (urlArg === -1) {
    server = spawn(process.execPath, ['--max-old-space-size=4096', 'scripts/map-smoke-server.mjs', String(PORT)], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, EDDY_PLANNER_SMOKE: '1', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' },
      detached: true,
    });
    server.stderr?.on('data', (d) => process.stderr.write(d));
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const target = `${baseUrl}/river-map`;
  await waitForServer(target);

  const fallback = '/opt/pw-browsers/chromium';
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(fallback) ? fallback : undefined);
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  try {
    // ── 1. Explore draws, with a freshness line ─────────────────────────
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await intercept(page, 5 * 60_000);
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Live River Map' }).waitFor({ timeout: 120_000 });
    await page.getByText(/^Snapshot /).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    assert.ok((await layerInk(page, 0)) > 0, 'geography drew');
    assert.ok((await layerInk(page, 2)) + (await layerInk(page, 3)) > 0, 'gauge marks drew');
    assert.ok((await layerInk(page, 1)) > 0, 'live data animates the fx layer');
    await page.screenshot({ path: `${OUT_DIR}/national-explore.png` });
    console.log('PASS explore draws geography, marks and motion');

    // ── 2. Search opens a station's details ─────────────────────────────
    await page.getByRole('combobox').fill('07019000');
    await page.keyboard.press('Enter');
    await page.getByRole('region', { name: 'Details for Meramec River near Eureka, MO' }).waitFor();
    await page.getByRole('button', { name: 'Flooding', exact: true }).click();
    await page.getByText('At or above the NWS major flood stage').waitFor();
    await page.getByRole('button', { name: 'Close details' }).click();
    console.log('PASS search → details, and the USGS gauge carries its NWS status');

    // ── 3. Map only: no text, no controls; a tap reveals the tray ───────
    await page.getByRole('button', { name: 'Fullscreen map' }).click();
    await page.locator('[data-presentation="map-only"]').waitFor();
    await page.waitForTimeout(600);
    assert.deepEqual(await visibleText(page), [], 'map-only shows no words at all');
    assert.equal(await page.getByRole('button', { name: 'Exit fullscreen' }).isVisible(), false, 'no persistent controls');
    await page.screenshot({ path: `${OUT_DIR}/national-map-only.png` });
    await page.mouse.click(720, 450);
    await page.getByRole('toolbar', { name: 'Fullscreen controls' }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Exit fullscreen' }).isVisible(), 'a tap reveals the tray');
    assert.equal(await page.getByRole('region', { name: /^Details for/ }).count(), 0, 'the first tap never opens a gauge');
    await page.mouse.move(100, 100);
    await page.waitForTimeout(TRAY_IDLE_MS + 1200);
    assert.deepEqual(await visibleText(page), [], 'the tray hides again; pointer drift does not hold it open');
    await page.keyboard.press('Escape');
    await page.locator('[data-presentation="explore"]').waitFor();
    console.log('PASS map-only is text-free, the tray reveals and hides, Escape exits');

    // ── 4. Preferences stay on this page ────────────────────────────────
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert.ok(keys.includes('eddy-river-map-prefs-v1'));
    assert.ok(!keys.includes('eddy-web-gauge-layers-v1'), 'the planner’s layer choices are untouched');
    assert.deepEqual(errors, []);
    await page.close();

    // ── 5. A fully stale snapshot stops data-driven motion ──────────────
    const stale = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await intercept(stale, 2 * 86_400_000);
    await stale.goto(target, { waitUntil: 'domcontentloaded' });
    await stale.getByText(/older than expected/).waitFor({ timeout: 120_000 });
    await stale.waitForTimeout(1500);
    assert.equal(await layerInk(stale, 1), 0, 'no traces or rings over stale data');
    assert.ok((await layerInk(stale, 0)) > 0, 'geography stays');
    await stale.screenshot({ path: `${OUT_DIR}/national-stale.png` });
    console.log('PASS stale snapshot: static geography, neutral marks, no motion');
    await stale.close();
  } finally {
    await browser.close();
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
