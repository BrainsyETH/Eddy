// Local fixtures only: source switching, unrated readings and compact Read links.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:3158';
const route = resolve('src/app/river-report-check');
const out = process.env.RIVER_REPORT_OUTPUT || (process.env.SECTIONS_SMOKE_OUTPUT ? `${process.env.SECTIONS_SMOKE_OUTPUT}/sources` : '/tmp/eddy-river-report');
const now = Date.now(), hour = 3_600_000;
const stamp = hours => new Date(now - hours * hour).toISOString();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now);
const dates = [0, 1, 2].map(i => new Date(Date.parse(`${today}T12:00:00Z`) + i * 24 * hour).toISOString().slice(0, 10));
const metric = (value, unit = 'cfs') => ({ value, unit, at: stamp(0.25), staleness: 'fresh' });
const dam = {
  id: 'swl-bull-shoals-dam', name: 'Bull Shoals Dam', state: 'AR', lakeName: 'Bull Shoals Lake', lat: 36.36, lon: -92.57,
  hasTurbines: true, generating: false, generationFloorCfs: 850, sources: ['USACE CWMS', 'SWPA'], pattern: [],
  metrics: { release: metric(770), generationFlow: metric(770), tailwaterTempF: metric(58.5, 'F'), poolElevation: metric(652.45, 'ft') },
  generationReference: { units: 8, fullGenerationCfs: 26400, schedulingCapacityMw: 391, source: 'SWPA' },
  schedule: [{ scheduleDate: today, retrievedAt: stamp(0.1), hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: i >= 6 && i < 9 ? 100 : 0, cfs: null, isRamp: false })), idle: [] }],
};
const norforkDam = { ...dam, id: 'swl-norfork-dam', name: 'Norfork Dam', metrics: { ...dam.metrics, release: metric(3200) } };
const threshold = { riverId: 'white', riverName: 'White River', riverSlug: 'white', riverState: 'AR', isPrimary: false,
  thresholdUnit: 'cfs', levelTooLow: null, levelLow: null, levelOptimalMin: null, levelOptimalMax: null, levelHigh: null, levelDangerous: null,
  floodStageFt: null, altLevelTooLow: null, altLevelLow: null, altLevelOptimalMin: null, altLevelOptimalMax: null, altLevelHigh: null, altLevelDangerous: null, distanceFromSectionMiles: 0, riverMile: null };
const station = (id, name, provider, cfs, main = false) => ({ id, usgsSiteId: id, name, provider, coordinates: { lat: 36.2, lng: -92.2 },
  active: true, gaugeHeightFt: provider === 'usace' ? null : 4.65, dischargeCfs: cfs, readingTimestamp: stamp(0.25), readingAgeHours: 0.25,
  readingSuspect: false, qualifierNote: null, thresholds: [{ ...threshold, isPrimary: main }] });
const gauges = [station(dam.id, 'White River below Bull Shoals Dam', 'usace', 770, true),
  station(norforkDam.id, 'North Fork River below Norfork Dam', 'usace', 3200),
  station('07057370', 'White River near Norfork, AR', 'usgs', 1880),
  station('07060500', 'White River at Calico Rock, AR', 'usgs', 2500)];
function history(gauge) {
  const readings = Array.from({ length: 169 }, (_, i) => ({ timestamp: new Date(now - (168 - i) * hour).toISOString(), gaugeHeightFt: gauge.gaugeHeightFt, dischargeCfs: gauge.dischargeCfs }));
  return { siteId: gauge.usgsSiteId, siteName: gauge.name, readings, resolution: 'instant', statistic: 'instantaneous', timeZone: 'America/Chicago',
    observedThrough: readings.at(-1).timestamp, coverageComplete: true, sampled: false,
    requestedWindow: { from: readings[0].timestamp, to: readings.at(-1).timestamp }, coverageWindow: { from: readings[0].timestamp, to: readings.at(-1).timestamp },
    typical: [], seasonalRange: [], forecast: [], forecastIssuedAt: null, truncationReason: null, stats: { minDischarge: gauge.dischargeCfs, maxDischarge: gauge.dischargeCfs, minHeight: gauge.gaugeHeightFt, maxHeight: gauge.gaugeHeightFt } };
}
let server, browser, cleanupPromise;
async function cleanup() { return cleanupPromise ??= (async () => { await browser?.close(); if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} } await rm(route, { recursive: true, force: true }); })(); }
assert(!existsSync(route), 'Refusing to overwrite existing fixture');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void cleanup().finally(() => process.exit(1)));
try {
  await mkdir(route, { recursive: true }); await mkdir(out, { recursive: true });
  await writeFile(`${route}/page.tsx`, `import { notFound } from 'next/navigation';
import RiverGaugeDetail from '@/components/gauge/RiverGaugeDetail';
import RiverDamPanel from '@/components/dam/RiverDamPanel';
import type { RiverDamContext } from '@/lib/data/dams';
const context = ${JSON.stringify({ dam, tailwaterGaugeSiteId: dam.id, forecast: [], forecastIsDaily: true })} as RiverDamContext;
export default async function Page({ searchParams }: { searchParams: Promise<{ ordinary?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_REPORT_SMOKE !== '1') notFound();
  const { ordinary } = await searchParams;
  return <main className="mx-auto max-w-5xl px-4 py-6"><h1 className="font-display text-2xl">{ordinary ? 'Gasconade River' : 'White River'}</h1>
    <div id="gauge-selection-slot" className="my-4" /><h2 className="mb-4 font-display text-xl">Live report</h2>
    <RiverGaugeDetail riverSlug="white" heldDamId={ordinary ? null : context.dam.id}
      damLead={ordinary ? null : <RiverDamPanel context={context} position="lead" now={${now}} />}
      damFooter={ordinary ? null : <RiverDamPanel context={context} position="footer" now={${now}} />} /></main>;
}`);
  const log = createWriteStream(`${out}/server.log`);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '-p', '3158'], { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, EDDY_REPORT_SMOKE: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only', NEXT_PUBLIC_GA_MEASUREMENT_ID: '' } });
  server.stdout.pipe(log); server.stderr.pipe(log);
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${origin}/river-report-check`, { signal: AbortSignal.timeout(5000) })).ok) break; } catch {}
    if (i > 100 || server.exitCode != null) throw new Error(`Server failed; see ${out}/server.log`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--disable-dev-shm-usage'] });
  const errors = [];
  async function pageFor(width, mode = 'normal') {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(20_000); page.on('pageerror', e => errors.push(e.message));
    let release, requested;
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { requested = resolve; });
    await page.route('**/*', async r => {
      const url = new URL(r.request().url());
      if (url.origin !== origin) return r.abort();
      if (!url.pathname.startsWith('/api/')) return r.continue();
      const json = body => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      const ordinary = mode === 'ordinary';
      let list = ordinary ? gauges.slice(2).map((g, i) => ({ ...g, name: i === 0 ? 'Gasconade River at Rich Fountain, MO' : 'Gasconade River at Jerome, MO', thresholds: [{ ...threshold, isPrimary: i === 0 }] })) : gauges;
      list = list.map(g => g.usgsSiteId !== '07057370' ? g : { ...g,
        readingAgeHours: mode === 'stale' ? 8 : 0.25, readingSuspect: mode === 'flagged', qualifierNote: mode === 'flagged' ? 'Gauge equipment problem.' : null,
        dischargeCfs: mode === 'missing' ? null : g.dischargeCfs, gaugeHeightFt: mode === 'missing' ? null : g.gaugeHeightFt,
        thresholds: g.thresholds.map(t => ({ ...t, floodStageFt: mode === 'flood' ? 4 : null })) });
      if (mode === 'error-stale') list = list.map(g => g.provider === 'usace' ? { ...g, readingAgeHours: 8 } : g);
      const gauge = list.find(g => url.pathname.includes(g.usgsSiteId)) ?? list[0];
      if (url.pathname === '/api/gauges') return json({ gauges: list });
      if (url.pathname.endsWith('/history')) return json(history(gauge));
      if (url.pathname.endsWith('/rainfall')) return r.fulfill({ status: 404, body: '{}' });
      if (/\/api\/gauges\/[^/]+$/.test(url.pathname)) return json({ gauge: { ...gauge, siteId: gauge.usgsSiteId, curated: true,
        timeZone: 'America/Chicago', floodStages: ['flood', 'station-flood'].includes(mode) ? { actionFt: 3, floodFt: 4, moderateFt: 6, majorFt: 8 } : null,
        waterTemperature: { valueF: 59, observedAt: stamp(0.2), measuredAtName: 'Separate water-quality monitor' }, dissolvedOxygen: null,
        historyCapabilities: { maxInstantDays: 90, supportsDaily: true, supportsCustomRange: true } } });
      if (url.pathname.startsWith('/api/dams/')) {
        if (mode === 'late') { requested(); await held; }
        if (mode.startsWith('error')) return r.fulfill({ status: 503, body: '{}' });
        return json(mode === 'mismatch' ? dam : norforkDam);
      }
      if (url.pathname.startsWith('/api/dam-update/')) return json({ available: mode !== 'no-read', generatedAt: stamp(url.pathname.includes(norforkDam.id) ? 3 : 2) });
      if (url.pathname.startsWith('/api/gauge-update/') || url.pathname.startsWith('/api/eddy-update/')) return json({ available: mode !== 'no-read', update: { summaryText: 'Private-looking fixture prose must not be rendered here.', generatedAt: stamp(11) } });
      if (url.pathname.startsWith('/api/weather')) return json({ city: 'Norfork', days: dates.map(date => ({ date, dayOfWeek: new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date(`${date}T12:00:00Z`)), tempHigh: 62, tempLow: 43, conditionIcon: '01d', precipitation: 10, windSpeed: 4, humidity: 50 })) });
      if (url.pathname.startsWith('/api/usgs/mo-forecast')) return json({ entries: mode === 'forecast' ? [{ site_no: '07057370', stages: dates.map(date => ({ dateTime: `${date}T18:00:00Z`, valueFt: 5 })) }] : [] });
      if (url.pathname.endsWith('/visuals')) return json({ byLevel: [], currentCondition: 'unknown' });
      return json({ rivers: [], alerts: [], data: [] });
    });
    await page.goto(`${origin}/river-report-check${mode === 'ordinary' ? '?ordinary=1' : ''}`);
    await page.getByRole('combobox', { name: /^(View dam or gauge|Gauge)$/ }).waitFor();
    return { page, release, started };
  }
  for (const width of [1440, 390, 320]) {
    const { page } = await pageFor(width);
    const select = page.getByRole('combobox', { name: 'View dam or gauge' });
    await page.locator('[data-dam-panel="lead"]').getByRole('heading', { name: 'Bull Shoals Dam' }).waitFor();
    const read = page.locator('[data-river-read]'); await read.getByRole('link').waitFor();
    assert.match(await read.innerText(), /Written 2h/); assert.doesNotMatch(await read.innerText(), /11h|via|Weather/);
    assert.equal(await read.getByRole('link').getAttribute('data-ga-app-destination'), '/dam/swl-bull-shoals-dam');
    await select.selectOption(norforkDam.id);
    await page.locator('[data-dam-panel="lead"]').getByRole('heading', { name: 'Norfork Dam' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Bull Shoals Dam' }).count(), 0);
    assert.equal(await page.getByText('Unknown', { exact: true }).count(), 0);
    await read.getByRole('link', { name: /Norfork Dam/ }).waitFor();
    assert.equal(await read.getByRole('link').getAttribute('data-ga-app-destination'), '/dam/swl-norfork-dam');
    await select.selectOption('07057370');
    const reading = page.getByRole('group', { name: 'Current gauge reading' });
    await reading.getByRole('heading', { name: 'White River near Norfork, AR', includeHidden: true }).waitFor();
    await reading.getByText('Not rated', { exact: true }).waitFor();
    assert.equal(await reading.getByText('Unknown', { exact: true }).count(), 0);
    assert.equal(await reading.getByText('Lake level', { exact: true }).count(), 0);
    await reading.getByText(/Separate water-quality monitor/).waitFor();
    assert(await reading.getByText('At the dam', { exact: true }).isVisible());
    assert.equal(await reading.getByText('No flood stages published for this gauge.', { exact: true }).isVisible(), false);
    await reading.getByText('Source details', { exact: true }).click();
    assert(await reading.getByText('No flood stages published for this gauge.', { exact: true }).isVisible());
    await reading.getByText('Source details', { exact: true }).click();
    await read.getByRole('link', { name: /White River near Norfork/ }).waitFor();
    assert.equal(await read.getByRole('link').getAttribute('data-ga-app-destination'), '/gauge/07057370');
    assert.equal(await page.locator('[data-nosnippet]').count(), 0);
    assert.equal(await read.getByRole('link').count(), 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px overflow`);
    await page.screenshot({ path: `${out}/norfork-gauge-${width}.png`, fullPage: true });
    await select.selectOption(dam.id);
    await page.screenshot({ path: `${out}/bull-shoals-${width}.png`, fullPage: true });
    await page.close(); console.log(`PASS ${width}px: dam/gauge identity, Read targets/age, compact layout, source details`);
  }
  for (const [mode, label] of [['stale', 'Last reading'], ['flagged', 'Reading flagged'], ['missing', 'No reading'], ['flood', 'Flood']]) {
    const { page } = await pageFor(390, mode); await page.getByRole('combobox', { name: 'View dam or gauge', exact: true }).selectOption('07057370');
    const reading = page.getByRole('group', { name: 'Current gauge reading' });
    await reading.getByText(label, { exact: true }).first().waitFor();
    assert.equal(await reading.getByText('Not rated', { exact: true }).count(), 0);
    if (mode === 'flood') await reading.getByText(/flood stage/i).first().waitFor();
    await page.close(); console.log(`PASS ${mode}: status takes precedence over Not rated`);
  }
  for (const mode of ['error', 'error-stale', 'mismatch']) {
    const { page } = await pageFor(390, mode); await page.getByRole('combobox', { name: 'View dam or gauge', exact: true }).selectOption(norforkDam.id);
    await page.getByText('Dam details are unavailable right now.', { exact: true }).waitFor();
    const reading = page.getByRole('group', { name: 'Current gauge reading' });
    assert(await reading.getByText('3,200 cfs', { exact: true }).isVisible());
    assert(await page.getByText('Release at the dam', { exact: true }).isVisible());
    assert(await reading.getByText(mode === 'error-stale' ? 'Last reading' : 'Not rated', { exact: true }).isVisible());
    assert(await reading.getByText(mode === 'error-stale' ? 'Updated 8h ago' : 'Updated 15m ago', { exact: true }).isVisible());
    await page.screenshot({ path: `${out}/${mode}-390.png`, fullPage: true });
    assert.equal(await page.getByRole('heading', { name: 'Bull Shoals Dam' }).count(), 0);
    await page.close(); console.log(`PASS ${mode}: known release and age retained, no borrowed dam report`);
  }
  {
    const { page, release, started } = await pageFor(390, 'late');
    await page.getByRole('combobox', { name: 'View dam or gauge', exact: true }).selectOption(norforkDam.id); await started;
    assert(await page.getByRole('group', { name: 'Current gauge reading' }).getByText('3,200 cfs', { exact: true }).isVisible());
    await page.getByRole('combobox', { name: 'View dam or gauge', exact: true }).selectOption(dam.id); release();
    await page.locator('[data-dam-panel="lead"]').getByRole('heading', { name: 'Bull Shoals Dam' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Norfork Dam' }).count(), 0);
    await page.close(); console.log('PASS late dam response stays isolated');
  }
  {
    const { page } = await pageFor(390, 'ordinary');
    await page.getByRole('combobox', { name: 'Gauge', exact: true }).waitFor();
    await page.getByRole('group', { name: 'Current gauge reading' }).getByText('Not rated', { exact: true }).waitFor();
    await page.locator('[data-river-read]').getByRole('link').waitFor();
    assert.equal(await page.locator('[data-dam-panel]').count(), 0);
    await page.close(); console.log('PASS ordinary unrated river retains Gauge selector and compact Read');
  }
  {
    const { page } = await pageFor(390, 'no-read');
    await page.getByRole('heading', { name: 'Weather', exact: true }).waitFor();
    assert.equal(await page.locator('[data-river-read]').count(), 0);
    await page.close(); console.log('PASS missing Read does not remove weather');
  }
  {
    const { page } = await pageFor(390, 'station-flood');
    await page.getByRole('combobox', { name: 'View dam or gauge', exact: true }).selectOption('07057370');
    const reading = page.getByRole('group', { name: 'Current gauge reading' });
    await reading.getByText(/flood stage/i).first().waitFor();
    assert(await reading.getByText('Not rated', { exact: true }).isVisible());
    assert.equal(await reading.getByText('Flood', { exact: true }).count(), 0);
    await page.screenshot({ path: `${out}/station-flood-390.png`, fullPage: true });
    await page.close(); console.log('PASS station flood warning stays visible without a page-only condition override');
  }
  {
    const { page } = await pageFor(390, 'forecast');
    await page.getByRole('heading', { name: 'Weather', exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'View dam or gauge', exact: true }).selectOption('07057370');
    await page.getByRole('heading', { name: 'Forecast', exact: true }).waitFor();
    assert(await page.getByRole('group', { name: 'NWS river forecast, daily high' }).isVisible());
    await page.screenshot({ path: `${out}/tailwater-forecast-390.png`, fullPage: true });
    await page.getByRole('combobox', { name: 'View dam or gauge', exact: true }).selectOption(dam.id);
    await page.getByRole('heading', { name: 'Weather', exact: true }).waitFor();
    assert.equal(await page.getByRole('group', { name: 'NWS river forecast, daily high' }).count(), 0);
    await page.close(); console.log('PASS forecast heading follows selected station data on tailwaters');
  }
  assert.deepEqual(errors, []); console.log(`PASS screenshots: ${out}`);
} finally { await cleanup(); }
