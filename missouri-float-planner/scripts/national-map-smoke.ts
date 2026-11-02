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
//   * preferences never touch the planner's gauge-layer keys;
//   * keyboard: Enter at the map's reticle lists the gauges there (all of
//     them), focus enters and leaves details/fullscreen/settings predictably;
//   * iPhone-style fallback fullscreen (no Fullscreen API) covers the header;
//   * a failed station catalog says so and still draws NWS points.
// Added after the 2026-11-02 design-skill review (docs/national-river-map.md).

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

function fixtureFrame(ageMs: number, noaaOk = true) {
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
  const nws: NwsInput[] = !noaaOk ? [] : [
    { lid: 'EURM7', lng: -90.59, lat: 38.51, observed: 'major', observedAt: Math.floor((NOW - ageMs - 30 * 60_000) / 1000), observedValue: 28.1, units: 'ft', forecast: 'moderate', forecastValidAt: null, forecastIssuedAt: null, name: '' },
    { lid: 'ABCD1', lng: -97, lat: 35, observed: 'not_defined', observedAt: null, observedValue: null, units: 'ft', forecast: 'unknown', forecastValidAt: null, forecastIssuedAt: null, name: 'Undefined Creek' },
  ];
  return buildFrame({
    capturedAt: new Date(NOW - ageMs),
    latest,
    nws,
    lidToSite: new Map([['EURM7', '07019000']]),
    noaaOk,
  });
}

async function intercept(page: Page, frameAgeMs: number, stationsStatus = 200, noaaOk = true) {
  const frame = JSON.stringify(fixtureFrame(frameAgeMs, noaaOk));
  const stations = JSON.stringify(fixtureStations());
  await page.route('**/api/river-map/stations', (r) =>
    stationsStatus === 200
      ? r.fulfill({ contentType: 'application/json', body: stations })
      : r.fulfill({ status: stationsStatus, body: 'unavailable' }),
  );
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

/**
 * Where the geography landed: the base layer's non-background bounding box as
 * fractions of the canvas [left, top, right, bottom].
 */
function geographyBox(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[aria-roledescription="map"] canvas')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    // The corner is open water / page background; geography is whatever differs.
    const bg = [d[0], d[1], d[2], d[3]];
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    for (let y = 0; y < c.height; y += 2) {
      for (let x = 0; x < c.width; x += 2) {
        const i = (y * c.width + x) * 4;
        if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) + Math.abs(d[i + 3] - bg[3]) > 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return [minX / c.width, minY / c.height, maxX / c.width, maxY / c.height];
  });
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
    const searchBox = page.getByRole('combobox');
    await searchBox.fill('07019000');
    await page.keyboard.press('Enter');
    await page.getByRole('region', { name: 'Details for Meramec River near Eureka, MO' }).waitFor();
    const focused = () => page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return a ? `${a.tagName}|${a.getAttribute('aria-label') ?? ''}|${a.textContent?.slice(0, 40) ?? ''}` : 'none';
    });
    assert.match(await focused(), /^H2\|/, 'opening details from search moves focus to its heading');
    await page.getByRole('button', { name: 'Flooding', exact: true }).click();
    await page.getByText('At or above the NWS major flood stage').waitFor();
    await page.getByRole('heading', { name: 'Meramec River near Eureka, MO' }).focus();
    await page.keyboard.press('Escape');
    await page.getByRole('region', { name: /^Details for/ }).waitFor({ state: 'detached' });
    assert.match(await focused(), /^INPUT\|/, 'closing details returns focus to search');
    console.log('PASS search → details → Escape, focus in and back, NWS status on the USGS gauge');

    // Keyboard exploration: Enter at the reticle lists the gauges there.
    // Search centres the station under the reticle; close, then Enter on the map.
    await searchBox.fill('07019000');
    await page.keyboard.press('Enter');
    await page.getByRole('region', { name: /^Details for/ }).waitFor();
    await page.getByRole('button', { name: 'Close details' }).click();
    await page.locator('[aria-roledescription="map"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() =>
      !!document.querySelector('[role="dialog"][aria-label^="Choose a gauge"]') || !!document.querySelector('[aria-label^="Details for"]'),
    );
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    console.log('PASS Enter on the focused map lists gauges at the reticle');

    // Settings: Tab moves from the trigger into the panel; Escape returns.
    await page.getByRole('button', { name: 'Map settings' }).click();
    await page.keyboard.press('Tab');
    assert.ok(
      await page.evaluate(() => !!document.activeElement?.closest('[role="group"][aria-label="Map settings"]')),
      'Tab from the settings trigger enters the settings panel',
    );
    await page.keyboard.press('Escape');
    assert.match(await focused(), /Map settings/, 'Escape closes settings and refocuses its trigger');
    await page.getByRole('button', { name: 'Map settings' }).click();

    // ── 3. Map only: no text, no controls; a tap reveals the tray ───────
    // Framing regression: a small off-centre zoom, then fullscreen, used to
    // leave the country small and low in the wall frame; exit kept the shift.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Show the whole country' }).click();
    await page.waitForTimeout(400);
    await page.mouse.move(1150, 300);
    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(600);
    const explorBox = await geographyBox(page);
    await page.getByRole('button', { name: 'Fullscreen map' }).click();
    await page.locator('[data-presentation="map-only"]').waitFor();
    await page.waitForTimeout(600);
    const wallBox = await geographyBox(page);
    const [l, t, r, b] = wallBox;
    assert.ok(Math.abs((l + r) / 2 - 0.5) < 0.02 && Math.abs((t + b) / 2 - 0.5) < 0.02, `fullscreen centres the country (got ${wallBox.map((v) => v.toFixed(3))})`);
    assert.ok(r - l > 0.9 || b - t > 0.9, `fullscreen fills the frame (got ${wallBox.map((v) => v.toFixed(3))})`);
    // The wall opens on "Follow the river" (motion on, data live), and the
    // journey adds no words to map-only (asserted just below).
    assert.equal(await page.locator('[data-act]').getAttribute('data-act'), 'journey', 'fullscreen opens with a river journey');
    assert.deepEqual(await visibleText(page), [], 'map-only shows no words at all');
    assert.equal(await page.getByRole('button', { name: 'Exit fullscreen' }).isVisible(), false, 'no persistent controls');
    await page.screenshot({ path: `${OUT_DIR}/national-map-only.png` });
    await page.mouse.click(720, 450);
    await page.getByRole('group', { name: 'Fullscreen controls' }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Exit fullscreen' }).isVisible(), 'a tap reveals the tray');
    assert.equal(await page.getByRole('region', { name: /^Details for/ }).count(), 0, 'the first tap never opens a gauge');
    // Use the tray with the mouse (the clicked button keeps focus), then walk
    // away: the display must return to clean. Only keyboard focus holds it.
    await page.getByRole('group', { name: 'Fullscreen controls' }).getByRole('button', { name: 'Flooding', exact: true }).click();
    await page.mouse.move(100, 100);
    await page.waitForTimeout(TRAY_IDLE_MS + 1500);
    assert.deepEqual(await visibleText(page), [], 'after a mouse choice the tray hides again; pointer drift does not hold it open');
    await page.mouse.click(720, 450);
    await page.getByRole('group', { name: 'Fullscreen controls' }).getByRole('button', { name: 'Flow', exact: true }).click();
    await page.mouse.move(100, 100);
    await page.waitForTimeout(TRAY_IDLE_MS + 1500);
    await page.keyboard.press('Escape');
    await page.locator('[data-presentation="explore"]').waitFor();
    await page.waitForTimeout(300);
    assert.match(await focused(), /Fullscreen map/, 'leaving fullscreen returns focus to the Fullscreen button');
    await page.waitForTimeout(500);
    const backBox = await geographyBox(page);
    assert.ok(backBox.every((v, i) => Math.abs(v - explorBox[i]) < 0.01), `leaving fullscreen restores the Explore framing (${explorBox} → ${backBox})`);
    console.log('PASS map-only is text-free and centred, the tray reveals and hides, Escape exits to the trigger and the prior view');

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
    await stale.getByText(/older than expected; marks age/).waitFor({ timeout: 120_000 });
    await stale.waitForTimeout(1500);
    assert.equal(await layerInk(stale, 1), 0, 'no traces or rings over stale data');
    assert.ok((await layerInk(stale, 0)) > 0, 'geography stays');
    await stale.screenshot({ path: `${OUT_DIR}/national-stale.png` });
    console.log('PASS stale snapshot: static geography, neutral marks, no motion');
    await stale.close();

    // ── 6. iPhone-style fallback fullscreen covers the site header ───────
    // iPhone Safari has no element Fullscreen API. Remove it from EVERY
    // prototype that can carry it (deleting only Element.prototype's copy left
    // a native path alive in CI's browser build, so the fallback never ran),
    // and wait for the page to be interactive before tapping.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.addInitScript(() => {
      for (const proto of [Element.prototype, HTMLElement.prototype, HTMLDivElement.prototype]) {
        for (const name of ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen']) {
          Object.defineProperty(proto, name, { value: undefined, configurable: true, writable: true });
        }
      }
    });
    await intercept(phone, 5 * 60_000);
    await phone.goto(target, { waitUntil: 'domcontentloaded' });
    await phone.getByRole('heading', { name: 'Live River Map' }).waitFor({ timeout: 120_000 });
    await phone.getByRole('combobox').waitFor({ state: 'visible' });
    await phone.waitForFunction(() => !(document.querySelector('input[role="combobox"]') as HTMLInputElement | null)?.disabled, null, { timeout: 60_000 });
    await phone.getByRole('button', { name: 'Fullscreen map' }).tap();
    try {
      await phone.locator('[data-presentation="map-only"][data-fallback="true"]').waitFor({ timeout: 30_000 });
    } catch (err) {
      const state = await phone.evaluate(() => ({
        presentation: document.querySelector('[data-presentation]')?.getAttribute('data-presentation'),
        fallback: document.querySelector('[data-presentation]')?.getAttribute('data-fallback'),
        nativeFullscreen: !!document.fullscreenElement,
        api: typeof (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen,
      }));
      await phone.screenshot({ path: `${OUT_DIR}/national-phone-fallback-FAILED.png` });
      console.error('Fallback state at failure:', state);
      throw err;
    }
    await phone.waitForTimeout(600);
    const top = await phone.evaluate(() => {
      const el = document.elementFromPoint(195, 20);
      return !!el?.closest('[data-presentation]');
    });
    assert.ok(top, 'the fallback fullscreen sits above the site header');
    assert.deepEqual(await visibleText(phone), [], 'the phone fallback shows no words either');
    await phone.screenshot({ path: `${OUT_DIR}/national-phone-fallback.png` });
    console.log('PASS iPhone-style fallback fullscreen covers the header');
    await phone.close();

    // ── 6b. NOAA down, USGS fresh: Flooding goes still; Flow keeps moving ─
    const noaa = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await intercept(noaa, 5 * 60_000, 200, false);
    await noaa.goto(`${target}?view=flooding`, { waitUntil: 'domcontentloaded' });
    await noaa.getByText(/not a report of no flooding/).waitFor({ timeout: 120_000 });
    await noaa.waitForTimeout(1200);
    assert.equal(await layerInk(noaa, 1), 0, 'no motion in Flooding while NWS status is unavailable');
    assert.equal(await noaa.locator('[data-live="false"]').count(), 1, 'the map is presented as not live');
    await noaa.getByRole('button', { name: 'Fullscreen map' }).click();
    await noaa.locator('[data-presentation="map-only"]').waitFor();
    await noaa.waitForTimeout(800);
    assert.deepEqual(await visibleText(noaa), [], 'still text-free while unavailable');
    assert.equal(await layerInk(noaa, 1), 0, 'and still motionless');
    assert.notEqual(await noaa.locator('[data-act]').getAttribute('data-act'), 'journey', 'no river journey while the view is not live');
    await noaa.mouse.click(640, 400);
    await noaa.getByText('NWS flood status is unavailable right now').waitFor();
    await noaa.getByRole('group', { name: 'Fullscreen controls' }).getByRole('button', { name: 'Flow', exact: true }).click();
    await noaa.waitForTimeout(1200);
    assert.ok((await layerInk(noaa, 1)) > 0, 'Flow, which does not depend on NWS, keeps its motion');
    assert.equal(await noaa.locator('[data-act]').getAttribute('data-act'), 'journey', 'and Flow runs the journey');
    console.log('PASS NOAA outage: Flooding still and subdued, tray says why; Flow unaffected');
    await noaa.close();

    // ── 7. Station catalog down: say so, still draw NWS points ──────────
    const down = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await intercept(down, 5 * 60_000, 503);
    await down.goto(`${target}?view=flooding`, { waitUntil: 'domcontentloaded' });
    await down.getByText(/Station list unavailable/).waitFor({ timeout: 120_000 });
    await down.waitForTimeout(1000);
    assert.ok((await layerInk(down, 2)) + (await layerInk(down, 3)) > 0, 'NWS points still draw without the catalog');
    console.log('PASS catalog outage is reported and NWS points still draw');
    await down.close();
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
