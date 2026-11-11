// Local, fully intercepted report checks; no production API or database calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, createWriteStream, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { booleanPointInPolygon, point } from '@turf/turf';

const port = 3157, origin = `http://127.0.0.1:${port}`;
const fixture = resolve('src/app/river-sections-check');
const out = process.env.SECTIONS_SMOKE_OUTPUT || '/tmp/eddy-river-sections';
const now = Date.now(), hour = 3_600_000;
const sections = [
  { sectionSlug: 'upper-lesterville', name: 'Upper Black (Lesterville to Hwy K / Annapolis)', riverType: 'spring_fed_float', gaugeStationId: 'annapolis' },
  { sectionSlug: 'lower-markham-hammer', name: 'Lower Black (Markham Springs to Hammer, below Clearwater Dam)', riverType: 'dam_tailwater', gaugeStationId: 'poplar-bluff' },
];
const threshold = { riverId: 'black', riverName: 'Black River', riverSlug: 'black', riverState: 'MO', isPrimary: true,
  thresholdUnit: 'ft', levelTooLow: 1, levelLow: 2, levelOptimalMin: 3, levelOptimalMax: 4, levelHigh: 5, levelDangerous: 7,
  floodStageFt: 10, altLevelTooLow: null, altLevelLow: null, altLevelOptimalMin: null, altLevelOptimalMax: null,
  altLevelHigh: null, altLevelDangerous: null, distanceFromSectionMiles: 0, riverMile: null };
const station = { id: 'annapolis', usgsSiteId: '07061500', provider: 'usgs', name: 'Black River near Annapolis, MO',
  coordinates: { lat: 37.33, lng: -90.78 }, active: true, gaugeHeightFt: 3.8, dischargeCfs: 186,
  readingTimestamp: new Date(now - hour / 4).toISOString(), readingAgeHours: 0.25, readingSuspect: false,
  qualifierNote: null, thresholdDescriptions: null, thresholds: [threshold] };
const lower = { ...station, id: 'poplar-bluff', usgsSiteId: '07063000', name: 'Black River at Poplar Bluff, MO',
  coordinates: { lat: 36.76, lng: -90.39 }, gaugeHeightFt: 0.3, dischargeCfs: 512,
  thresholds: [{ ...threshold, isPrimary: false, levelTooLow: -1, levelLow: -0.5, levelOptimalMin: 0, levelOptimalMax: 2 }] };
const damContext = { dam: { id: 'swl-clearwater-dam', name: 'Clearwater Dam', state: 'MO', lakeName: 'Clearwater Lake',
  lat: 37.13, lon: -90.77, hasTurbines: false, generating: null, schedule: [], pattern: [], sources: ['USACE CWMS'],
  metrics: { release: { value: 336, unit: 'cfs', at: new Date(now - hour / 4).toISOString(), staleness: 'fresh' } } },
  forecast: [], forecastIsDaily: true };
function detail(gauge) {
  return { gauge: { ...gauge, siteId: gauge.usgsSiteId, curated: true, timeZone: 'America/Chicago',
    floodStages: null, flowPercentile: null, waterTemperature: null, dissolvedOxygen: null,
    historyCapabilities: { maxInstantDays: 90, supportsDaily: true, supportsCustomRange: true } } };
}
function history(gauge) {
  const readings = Array.from({ length: 169 }, (_, i) => ({ timestamp: new Date(now - (168 - i) * hour).toISOString(),
    gaugeHeightFt: gauge.gaugeHeightFt + Math.sin(i / 8) * 0.05, dischargeCfs: gauge.dischargeCfs + Math.round(Math.sin(i / 8) * 10) }));
  return { siteId: gauge.usgsSiteId, siteName: gauge.name, readings, timeZone: 'America/Chicago',
    observedThrough: readings.at(-1).timestamp, sampled: false, resolution: 'instant', statistic: 'instantaneous',
    requestedWindow: { from: readings[0].timestamp, to: readings.at(-1).timestamp },
    coverageWindow: { from: readings[0].timestamp, to: readings.at(-1).timestamp }, coverageComplete: true,
    typical: [], seasonalRange: [], forecast: [], forecastIssuedAt: null, truncationReason: null,
    stats: { minDischarge: gauge.dischargeCfs - 10, maxDischarge: gauge.dischargeCfs + 10, minHeight: gauge.gaugeHeightFt - 0.05, maxHeight: gauge.gaugeHeightFt + 0.05 } };
}
// Real USGS outline; the rain amounts/readings are deliberately local fixtures.
const sources = JSON.parse(gunzipSync(readFileSync('../docs/validation/rainfall/2026-11-11-review/source-responses.json.gz')));
const sourceBoundary = sources['07061500-basin.json'].data.features[0];
const boundary = { type: 'Feature', properties: {}, geometry: sourceBoundary.geometry.type === 'Polygon'
  ? { type: 'MultiPolygon', coordinates: [sourceBoundary.geometry.coordinates] } : sourceBoundary.geometry };
const project = ([lon, lat]) => [6378137 * lon * Math.PI / 180, 6378137 * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
const mapContextSource = JSON.parse(readFileSync('../docs/validation/rainfall/2026-11-11-stream/black-river-context.json', 'utf8'));
const mapContext = { river: { name: mapContextSource.river.name, lines: [mapContextSource.river.geometry.coordinates] }, places: mapContextSource.places.filter(place => booleanPointInPolygon(point(place.coordinates), boundary)) };
const mapPoints = boundary.geometry.coordinates.flat(2).map(project);
const xs = mapPoints.map(p => p[0]), ys = mapPoints.map(p => p[1]);
function rainFixture(mode = 'normal') {
  const end = Math.floor(now / hour) * hour;
  const hourly = Array.from({ length: 168 }, (_, i) => ({ start: new Date(end - (168 - i) * hour).toISOString(), end: new Date(end - (167 - i) * hour).toISOString(),
    inches: mode === 'missing-rain' && i > 144 ? null : mode === 'dry' ? 0 : i >= 145 && i < 157 ? 0.065 : i === 130 ? 0.13 : 0,
    coverage: mode === 'missing-rain' && i > 144 ? 0.3 : 1 }));
  return { version: 1, siteId: station.usgsSiteId, updatedAt: new Date(end - (mode === 'stale-rain' ? 4 * hour : 0)).toISOString(),
    status: mode === 'missing-rain' ? 'partial' : 'ready', basin: { name: 'Black River near Annapolis', areaSqMi: 484, gauge: [-90.78, 37.33] }, hourly,
    totals: [24, 72].map(hours => ({ hours, start: new Date(end - hours * hour).toISOString(), end: new Date(end).toISOString(), inches: mode === 'missing-rain' ? null : mode === 'dry' ? 0 : hours === 24 ? 0.78 : 0.91, coverage: mode === 'missing-rain' ? 0.3 : 1 })),
    boundary, context: mapContext, shading: mode === 'missing-rain' ? null : { start: new Date(end - 24 * hour).toISOString(), end: new Date(end).toISOString(), xmin: Math.min(...xs), ymax: Math.max(...ys),
      dx: (Math.max(...xs) - Math.min(...xs)) / 40, dy: (Math.max(...ys) - Math.min(...ys)) / 40, width: 40, height: 40,
      inches: Array.from({ length: 1600 }, (_, i) => mode === 'dry' ? 0 : (Math.sin(i % 40 / 9) + Math.cos(Math.floor(i / 40) / 8) + 2) * 0.4) } };
}
let server, browser, owned = false, cleaned;
async function cleanup() {
  return cleaned ??= (async () => {
    await browser?.close();
    if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* exited */ } }
    if (owned) await rm(fixture, { recursive: true, force: true });
  })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void cleanup().finally(() => process.exit(1)));
assert(!existsSync(fixture), 'Refusing to overwrite an existing fixture route');
try {
  await mkdir(fixture, { recursive: true }); owned = true;
  await mkdir(out, { recursive: true });
  await writeFile(`${fixture}/page.tsx`, `import { notFound } from 'next/navigation';
import RiverGaugeDetail from '@/components/gauge/RiverGaugeDetail';
import RiverDamPanel from '@/components/dam/RiverDamPanel';
import type { RiverDamContext } from '@/lib/data/dams';
import type { RiverReportSection } from '@/lib/river-report-sections';
const context = ${JSON.stringify(damContext)} as unknown as RiverDamContext;
export default async function Page({ searchParams }: { searchParams: Promise<{ ordinary?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_SECTIONS_SMOKE !== '1') notFound();
  const { ordinary } = await searchParams;
  return <main className="mx-auto max-w-5xl px-4 py-6"><h1 className="mb-6 font-display text-3xl font-semibold">Black River</h1>
    <div id="gauge-selection-slot" /><h2 className="mb-4 font-display text-2xl font-semibold">Live report</h2>
    <RiverGaugeDetail riverSlug="black" sections={ordinary ? undefined : ${JSON.stringify(sections)} as RiverReportSection[]}
      damSectionSlug="lower-markham-hammer" heldDamId="swl-clearwater-dam"
      damLead={<RiverDamPanel context={context} position="lead" now={${now}} />}
      damFooter={<RiverDamPanel context={context} position="footer" now={${now}} />} /></main>;
}`);
  const log = createWriteStream(`${out}/server.log`);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '-p', String(port)],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, EDDY_SECTIONS_SMOKE: '1', NEXT_TELEMETRY_DISABLED: '1' } });
  server.stdout.pipe(log); server.stderr.pipe(log);
  for (let attempts = 0; ; attempts++) {
    try { if ((await fetch(`${origin}/river-sections-check`, { signal: AbortSignal.timeout(5000) })).status === 200) break; } catch { /* compiling */ }
    if (attempts > 100) throw new Error(`Server failed to start; see ${out}/server.log`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--disable-dev-shm-usage'] });
  const browserErrors = [];
  async function newPage(width, mode = 'normal') {
    const page = await browser.newPage({ viewport: { width, height: 1050 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(20_000);
    page.on('pageerror', error => browserErrors.push(error.message));
    const requests = [];
    let releaseLower, markLower;
    const lowerRequested = new Promise(resolve => { markLower = resolve; });
    const lowerGate = new Promise(resolve => { releaseLower = resolve; });
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
      const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      const gauge = url.pathname.includes('07063000') ? lower : station;
      if (url.pathname === '/api/gauges') return json({ gauges: mode === 'missing' ? [station] : [station, lower] });
      if (/\/api\/gauges\/[^/]+\/rainfall$/.test(url.pathname)) {
        if (gauge === lower) return route.fulfill({ status: 404, body: '{}' });
        const rain = rainFixture(mode);
        if (url.searchParams.get('detail') !== '1') { delete rain.boundary; delete rain.shading; delete rain.context; }
        return json(rain);
      }
      if (/\/api\/gauges\/[^/]+\/history$/.test(url.pathname)) return json(history(gauge));
      if (/\/api\/gauges\/[^/]+$/.test(url.pathname)) return json(detail(gauge));
      if (url.pathname.startsWith('/api/gauge-update/')) {
        if (mode === 'late') { markLower(); await lowerGate; }
        return json({ available: true, update: { summaryText: 'Lower Black fixture report.', generatedAt: new Date(now).toISOString() } });
      }
      if (url.pathname.startsWith('/api/eddy-update/')) return json({ available: true, update: { summaryText: 'Upper Black fixture report.', generatedAt: new Date(now).toISOString() } });
      if (url.pathname.startsWith('/api/weather')) return route.fulfill({ status: 404, body: '{}' });
      if (url.pathname.startsWith('/api/usgs/mo-forecast')) return json({ entries: [] });
      if (url.pathname.endsWith('/visuals')) return json({ byLevel: [], currentCondition: 'unknown' });
      return json({ rivers: [], alerts: [], data: [] });
    });
    return { page, requests, releaseLower, lowerRequested };
  }
  const target = `${origin}/river-sections-check`;
  const heading = (page, lowerSelected) => page.getByRole('heading', { name: lowerSelected ? 'Poplar Bluff gauge' : 'Annapolis gauge', exact: true });
  for (const width of [1440, 390, 320]) {
    const { page, requests } = await newPage(width);
    await page.goto(target);
    await heading(page, false).waitFor();
    await page.getByText('Upper Black fixture report.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('radio').count(), 2);
    assert.equal(await page.locator('#gauge-selection-slot').innerText(), '');
    assert.equal(await page.locator('[data-dam-panel]').count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Reaches', exact: true }).count(), 0);
    assert.equal(await page.getByText('Observed 15m ago', { exact: true }).count(), 1);
    await page.getByRole('slider').first().waitFor();
    const rainToggle = page.getByRole('button', { name: 'Show rain upstream', exact: true });
    await rainToggle.waitFor(); await page.locator('[data-rain-track]').waitFor();
    const readY = () => page.locator('#eddy-says').evaluate(node => node.getBoundingClientRect().top + window.scrollY);
    const firstReadY = await readY();
    const forecastY = await page.getByRole('heading', { name: 'Will it hold?', exact: true }).evaluate(node => node.getBoundingClientRect().top + window.scrollY);
    assert(firstReadY < forecastY, 'Read precedes the forecast');
    const slider = page.getByRole('slider').first(); await slider.focus(); await page.keyboard.press('End');
    assert.match(await slider.getAttribute('aria-valuetext'), /Rain (upstream|data unavailable)/);
    await rainToggle.click(); assert.equal(await page.locator('[data-rain-track]').count(), 0);
    assert(Math.abs(await readY() - firstReadY) < 2, 'Rain toggle must not move the Read or grow the chart');
    await page.reload(); await heading(page, false).waitFor(); await rainToggle.waitFor();
    assert.equal(await rainToggle.getAttribute('aria-pressed'), 'false', 'Remember rain off');
    await rainToggle.click(); await page.locator('[data-rain-track]').waitFor();
    await page.getByRole('button', { name: 'Open rain upstream details' }).click();
    const rainDialog = page.getByRole('dialog', { name: 'Rain upstream', exact: true });
    await rainDialog.getByText('0.78 in', { exact: true }).waitFor();
    assert.equal(await rainDialog.getByRole('img', { name: /Watershed upstream/ }).count(), 1);
    assert(await rainDialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    await page.screenshot({ path: `${out}/rain-detail-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape'); assert.equal(await rainDialog.count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Open rain upstream details' }).evaluate(node => node === document.activeElement), true);
    await page.screenshot({ path: `${out}/upper-${width}.png`, fullPage: true });
    const frame = page.locator('#river-section-report > .card-panel').first();
    assert.equal(await frame.getByRole('group', { name: 'Current gauge reading' }).count(), 1);
    assert.equal(await frame.getByRole('heading', { name: 'Stage history' }).count(), 1);
    if (width < 1024) {
      const frameBox = await frame.boundingBox();
      const expandBox = await frame.getByRole('button', { name: 'Expand', exact: true }).boundingBox();
      assert(frameBox && expandBox && expandBox.x + expandBox.width <= frameBox.x + frameBox.width,
        `${width}px chart controls must fit inside their clipping card`);
    }
    await page.getByRole('radio', { name: /Lower Black/ }).check();
    await heading(page, true).waitFor();
    await page.getByText('Lower Black fixture report.', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-dam-panel]').count(), 1);
    assert.match(page.url(), /section=lower-markham-hammer/);
    assert(requests.some(url => url.startsWith('/api/gauges/07063000/history')));
    assert.equal(await page.getByText('Upper Black fixture report.', { exact: true }).count(), 0);
    assert.equal(await page.locator('[data-rain-track]').count(), 0, 'Lower Black cannot reuse Upper Black rain');
    await page.screenshot({ path: `${out}/lower-${width}.png`, fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overflow`);
    await page.goBack(); await heading(page, false).waitFor();
    await page.goForward(); await heading(page, true).waitFor();
    await page.reload(); await heading(page, true).waitFor();
    await page.getByRole('radio', { name: /Lower Black/ }).focus();
    await page.keyboard.press('ArrowLeft'); await heading(page, false).waitFor();
    if (width < 1024) {
      await page.getByRole('button', { name: 'Expand', exact: true }).click();
      const expanded = page.getByRole('dialog', { name: /history/i });
      await expanded.waitFor();
      await expanded.getByRole('button', { name: 'Open rain upstream details' }).click();
      await page.getByRole('dialog', { name: 'Rain upstream', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await expanded.waitFor();
      assert.equal(await expanded.getByRole('button', { name: 'Open rain upstream details' }).evaluate(node => node === document.activeElement), true);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
    } else {
      await page.getByRole('button', { name: '1Y', exact: true }).waitFor();
      await page.getByRole('button', { name: /Export CSV/ }).waitFor();
    }
    await page.goto(`${target}#reach-lower-markham-hammer`); await heading(page, true).waitFor();
    await page.close(); console.log(`PASS ${width}px: section switching, sources, charts, Read, history, reload, keyboard, deep link`);
  }
  {
    const { page } = await newPage(390, 'missing');
    await page.goto(`${target}?section=lower-markham-hammer`);
    await page.getByText('Live gauge data isn’t available for Lower Black right now.', { exact: true }).waitFor();
    assert.equal(await heading(page, false).count(), 0);
    assert.equal(await page.getByRole('slider').count(), 0);
    assert.equal(await page.locator('[data-dam-panel]').count(), 1);
    await page.getByRole('radio', { name: /Upper Black/ }).check(); await heading(page, false).waitFor();
    await page.close(); console.log('PASS missing lower gauge: no primary substitution, upper selection recovers');
  }
  {
    const { page, releaseLower, lowerRequested } = await newPage(390, 'late');
    await page.goto(target); await heading(page, false).waitFor();
    await page.getByRole('radio', { name: /Lower Black/ }).check(); await lowerRequested;
    await page.getByRole('radio', { name: /Upper Black/ }).check();
    const response = page.waitForResponse(url => url.url().includes('/api/gauge-update/07063000'));
    releaseLower(); await response;
    await page.getByText('Upper Black fixture report.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Lower Black fixture report.', { exact: true }).count(), 0);
    await page.close(); console.log('PASS late lower report cannot replace the selected upper report');
  }
  {
    const { page } = await newPage(1440);
    await page.goto(`${target}?ordinary=1`);
    await page.locator('#gauge-selection-slot select').waitFor();
    assert.equal(await page.getByRole('radio').count(), 0);
    await page.close(); console.log('PASS ordinary river retains its gauge picker');
  }
  for (const mode of ['dry', 'missing-rain', 'stale-rain']) {
    const { page } = await newPage(390, mode); await page.goto(target);
    await page.getByRole('button', { name: 'Show rain upstream' }).waitFor();
    if (mode === 'stale-rain') {
      await page.getByText('Rain data unavailable', { exact: true }).waitFor();
      assert.equal(await page.locator('[data-rain-track]').count(), 0);
    } else {
      await page.getByRole('button', { name: 'Open rain upstream details' }).click();
      const dialog = page.getByRole('dialog', { name: 'Rain upstream' });
      await dialog.getByText('Black River near Annapolis', { exact: true }).waitFor();
      if (mode === 'dry') assert.equal(await dialog.locator('dl').getByText('0.00 in', { exact: true }).count(), 2);
      else { assert.equal(await dialog.locator('dl').getByText('Unavailable', { exact: true }).count(), 2); assert.equal(await dialog.locator('dl').getByText('0.00 in', { exact: true }).count(), 0); }
      await page.keyboard.press('Escape');
    }
    await page.screenshot({ path: `${out}/rain-${mode}-390.png`, fullPage: true });
    await page.close();
  }
  assert.deepEqual(browserErrors, [], 'Browser runtime errors');
  console.log(`PASS all river section checks. Screenshots: ${out}`);
} finally { await cleanup(); }
