// Real planner + MapLibre, synthetic API data, no production credentials.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const port = 3144,
  origin = `http://127.0.0.1:${port}`;
const fixtureDir = resolve('src/app/planner-map-layout-check');
const out = process.env.PLANNER_SMOKE_OUTPUT || '/tmp/eddy-planner-map';
const timestamp = new Date().toISOString();
const basemap = JSON.parse(await readFile('src/data/mo-rivers-basemap.json', 'utf8'));
const named = ['Current', 'Meramec', 'Jacks Fork'];
const riverMeta = named.map((name, i) => ({
  id: `r-${i}`,
  name: `${name} River`,
  slug: name.toLowerCase().replaceAll(' ', '-'),
  state: 'MO',
  region: 'Ozarks',
  lengthMiles: 50,
  description: null,
  difficultyRating: null,
  currentCondition: null,
  accessPointCount: 3,
  path: `/rivers/missouri/${name.toLowerCase().replaceAll(' ', '-')}`,
  riverType: 'spring_fed_float'
}));
const geometry = named.map(name => basemap.rivers.features.find(f => f.properties.name.toLowerCase().startsWith(name.toLowerCase()))?.geometry ?? {
  type: 'LineString',
  coordinates: [[-91.8, 37.2], [-91.3, 37], [-91, 36.8]]
});
const points = riverMeta.map((river, i) => ['Put-in', 'Take-out', 'Riverside park'].map((suffix, j) => {
  const c = geometry[i].coordinates[Math.floor((geometry[i].coordinates.length - 1) * (0.25 + j * 0.2))];
  return {
    id: `p-${i}-${j}`,
    riverId: river.id,
    name: `${named[i]} ${suffix}`,
    slug: suffix.toLowerCase().replaceAll(' ', '-'),
    coordinates: {
      lng: c[0],
      lat: c[1]
    },
    riverMile: 5 + j * 5,
    type: 'access',
    types: ['access'],
    isPublic: true,
    isFloatEndpoint: j !== 2,
    ownership: 'Public',
    description: null,
    amenities: [],
    imageUrls: ['/email/eddy-quote.png'],
    parkingInfo: null,
    roadAccess: null,
    facilities: null,
    feeRequired: false,
    feeNotes: null
  };
}));
const dataset = {
  generated_at: timestamp,
  campgrounds: [],
  rivers: riverMeta.map((r, i) => ({
    ...r,
    length_miles: 50,
    geometry: geometry[i],
    pois: [{ id: `poi-${i}`, name: `${named[i]} Spring`, slug: 'spring', type: 'spring',
      lon: points[i][1].coordinates.lng + 0.01, lat: points[i][1].coordinates.lat + 0.01,
      river_mile: 10, nps_url: null, description: 'Fixture spring' }],
    access_points: points[i].map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      lon: p.coordinates.lng,
      lat: p.coordinates.lat,
      type: 'access',
      river_mile_downstream: p.riverMile,
      ownership: 'Public'
    })),
    gauges: [{
      site_id: `0706700${i}`,
      is_primary: true,
      name: r.name,
      lon: geometry[i].coordinates[0][0],
      lat: geometry[i].coordinates[0][1],
      threshold_unit: 'cfs',
      level_too_low: 50,
      level_low: 100,
      level_optimal_min: 200,
      level_optimal_max: 800,
      level_high: 1000,
      level_dangerous: 2000,
      flood_stage_ft: null,
      action_stage_ft: null
    }]
  }))
};
const statewide = {
  generatedAt: timestamp,
  cadenceSeconds: 900,
  gauges: riverMeta.map((r, i) => ({
    site_no: `0706700${i}`,
    river_id: r.id,
    is_primary: true,
    dischargeCfs: [500, 80, 1400][i],
    gaugeHeightFt: 3,
    readingTimestamp: timestamp,
    percentile: null
  }))
};
const condition = {
  code: 'flowing',
  label: 'Flowing',
  description: 'Fixture condition',
  dischargeCfs: 500,
  gaugeHeightFt: 3,
  readingAgeHours: 0,
  gaugeName: 'Fixture gauge'
};
const bbox = g => {
  const lng = g.coordinates.map(c => c[0]),
    lat = g.coordinates.map(c => c[1]);
  return [Math.min(...lng), Math.min(...lat), Math.max(...lng), Math.max(...lat)];
};
const style = {
  version: 8,
  glyphs: `${origin}/fixture-glyphs/{fontstack}/{range}.pbf`,
  sources: {
    context: {
      type: 'geojson',
      attribution: 'Fixture map credits',
      data: {
        type: 'FeatureCollection',
        features: basemap.rivers.features
      }
    }
  },
  layers: [{
    id: 'background',
    type: 'background',
    paint: {
      'background-color': '#e8e9df'
    }
  }, {
    id: 'water-context',
    type: 'line',
    source: 'context',
    paint: {
      'line-color': '#b4d0ce',
      'line-width': 1
    }
  }, {
    id: 'eddy-anchor-lines',
    type: 'background',
    paint: {
      'background-opacity': 0
    }
  }]
};
let browser,
  server,
  log = '';
const errors = [];
async function cleanup() {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
  }
  await browser?.close();
  await rm(fixtureDir, {
    recursive: true,
    force: true
  });
  await rm('.next/dev/types/app/planner-map-layout-check', {
    recursive: true,
    force: true
  });
  await rm('.next/dev/types/validator.ts', {
    force: true
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void cleanup().finally(() => process.exit(1));
});
assert(!existsSync(fixtureDir));
try {
  await mkdir(fixtureDir, {
    recursive: true
  });
  await mkdir(out, {
    recursive: true
  });
  await writeFile(`${fixtureDir}/page.tsx`, `import { notFound } from 'next/navigation'; import Fixture from './Fixture'; export default function Page(){if(process.env.NODE_ENV!=='development'||process.env.EDDY_PLANNER_SMOKE!=='1')notFound();return <Fixture/>;}`);
  await writeFile(`${fixtureDir}/Fixture.tsx`, `'use client'; import {useEffect,useState} from 'react'; import * as maplibregl from 'maplibre-gl'; import Plan from '@/app/plan/PlanPageClient'; export default function Fixture(){const[ready,setReady]=useState(false); useEffect(()=>{const original=maplibregl.Map.prototype.addSource;maplibregl.Map.prototype.addSource=function(...args){(window as unknown as {plannerMap:maplibregl.Map}).plannerMap=this;return original.apply(this,args);};setReady(true);return()=>{maplibregl.Map.prototype.addSource=original;};},[]);return ready?<Plan initialRiverSlug={null} defaultBounds={[-92.5,36.5,-90.4,38.6]}/>:null;}`);
  await mkdir(`${fixtureDir}/ssr`, { recursive: true });
  await writeFile(`${fixtureDir}/ssr/page.tsx`, `import { notFound } from 'next/navigation'; import Plan from '@/app/plan/PlanPageClient'; export const dynamic = 'force-dynamic'; export default function Page(){if(process.env.NODE_ENV!=='development'||process.env.EDDY_PLANNER_SMOKE!=='1')notFound();return <Plan initialRiverSlug={null}/>;}`);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    detached: true,
    env: {
      ...process.env,
      EDDY_PLANNER_SMOKE: '1',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', d => log += d);
  server.stderr.on('data', d => log += d);
  console.log('Starting planner browser checks');
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw Error(log.slice(-5000));
    try {
      if ((await fetch(`${origin}/planner-map-layout-check`, {
        signal: AbortSignal.timeout(10000)
      })).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  assert(ready, log.slice(-5000));
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  // With JavaScript disabled, viewport state is still unknown. The desktop
  // search must already be visible in the server-rendered HTML.
  const ssrPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, javaScriptEnabled: false });
  await ssrPage.goto(`${origin}/planner-map-layout-check/ssr`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  assert(await ssrPage.getByRole('combobox', { name: 'Search rivers and access points' }).isVisible());
  await ssrPage.setViewportSize({ width: 390, height: 844 });
  await ssrPage.getByRole('combobox', { name: 'Search rivers and access points' }).waitFor({ state: 'hidden' });
  await ssrPage.close();
  console.log('Desktop search is visible before hydration without appearing on mobile');
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 1000
    },
    deviceScaleFactor: 1
  });
  page.setDefaultTimeout(25000);
  page.on('pageerror', e => {
    errors.push(String(e));
    console.log('Browser error:', String(e));
  });
  page.on('console', m => {
    if (m.type() === 'error' && /Error adding|layers\.|sources\.|expression|GeoJSON|TypeError|error occurred|Something went wrong|synchronously unmount/i.test(m.text())) errors.push(m.text());
  });
  let failCatalog = false,
    delayAccess = false, delayRiver = false;
  let documentRequests = 0;
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++; });
  await page.addInitScript(() => localStorage.setItem('eddy-plan-map-filters-v1', JSON.stringify({
    showNetwork: false, showRiverNames: false, showGauges: false, showPOIs: false, showPhotos: false, hiddenPoiCategories: ['spring']
  })));
  const routeHandler = async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      return route.fulfill({
        status: 204
      });
    }
    if (url.pathname.startsWith('/map-styles/')) return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(style)
    });
    if (url.pathname.startsWith('/fixture-glyphs/')) return route.fulfill({
      body: Buffer.alloc(0)
    });
    if (url.pathname === '/_next/image') return route.fulfill({
      contentType: 'image/png',
      body: await readFile('public/email/eddy-quote.png')
    });
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname;
    let result = {};
    if (path === '/api/usgs/mo-dataset') {
      if (failCatalog && !url.searchParams.has('slim')) return route.fulfill({
        status: 503,
        body: '{}'
      });
      result = url.searchParams.has('slim') ? {
        ...dataset,
        rivers: dataset.rivers.map(r => ({
          ...r,
          access_points: null
        }))
      } : dataset;
    } else if (path === '/api/usgs/mo-statewide') result = statewide;else if (path === '/api/rivers') result = {
      rivers: riverMeta
    };else if (path === '/api/vessel-types') result = {
      vesselTypes: [{
        id: 'canoe',
        slug: 'canoe',
        name: 'Canoe'
      }, {
        id: 'kayak',
        slug: 'kayak',
        name: 'Kayak'
      }]
    };else if (path === '/api/gauges') result = {
      gauges: riverMeta.map((river, i) => ({
        id: `g-${i}`, name: `${named[i]} gauge`, usgsSiteId: `0706700${i}`, active: true,
        coordinates: { lng: points[i][0].coordinates.lng + 0.3, lat: points[i][0].coordinates.lat + 0.3 },
        gaugeHeightFt: 3, dischargeCfs: 500, readingTimestamp: timestamp, readingAgeHours: 0,
        readingSuspect: false, qualifierNote: null, thresholdDescriptions: null,
        thresholds: [{ riverId: river.id, riverName: river.name, riverSlug: river.slug,
          isPrimary: true, riverMile: 5, thresholdUnit: 'cfs', levelTooLow: 50, levelLow: 100,
          levelOptimalMin: 200, levelOptimalMax: 800, levelHigh: 1000, levelDangerous: 2000 }]
      }))
    };else if (path.startsWith('/api/weather/forecast')) result = { days: [], city: 'Van Buren' };else if (path.startsWith('/api/weather')) result = { temp: 72, condition: 'Clear', conditionIcon: '01d', windSpeed: 5, windDirection: 180, humidity: 60, city: 'Van Buren', rain1hInches: 0, rain3hInches: 0 };else if (path.startsWith('/api/conditions/')) result = {
      condition
    };else if (path === '/api/plan') {
      const i = riverMeta.findIndex(river => river.id === url.searchParams.get('riverId'));
      const putIn = points[i]?.find(point => point.id === url.searchParams.get('startId'));
      const takeOut = points[i]?.find(point => point.id === url.searchParams.get('endId'));
      result = { plan: putIn && takeOut ? {
        river: { ...riverMeta[i], geometry: geometry[i], bounds: bbox(geometry[i]) }, putIn, takeOut,
        vessel: { id: 'canoe', name: 'Canoe', slug: 'canoe' },
        distance: { miles: 7.5, formatted: '7.5 miles' },
        floatTime: { minutes: 240, formatted: '4 hours', speedMph: 2, timeRange: { min: 210, max: 330 } },
        driveBack: { minutes: 20, miles: 14, formatted: '20 min', routeSummary: null, routeGeometry: null },
        condition, hazards: [], warnings: [], route: { type: 'Feature', properties: {}, geometry: {
          type: 'LineString', coordinates: geometry[i].coordinates.slice(
            Math.floor((geometry[i].coordinates.length - 1) * 0.25), Math.floor((geometry[i].coordinates.length - 1) * 0.45) + 1),
        } },
      } : null };
    } else for (let i = 0; i < riverMeta.length; i++) {
      const r = riverMeta[i];
      if (path === `/api/rivers/${r.slug}`) {
        if (delayRiver) await new Promise(resolve => setTimeout(resolve, 900));
        result = {
        river: {
          ...r,
          geometry: geometry[i],
          bounds: bbox(geometry[i])
        }
      };
      }
      if (path === `/api/rivers/${r.slug}/pois`) result = { pois: [] };
      if (path === `/api/rivers/${r.slug}/hazards`) result = { hazards: [{
        id: `hazard-${i}`, name: 'Fixture crossing', type: 'low_water_crossing', severity: 'moderate',
        coordinates: points[i][2].coordinates, riverMile: 15, description: 'Crossing', portageRequired: false,
      }] };
      if (path === `/api/rivers/${r.slug}/visuals/pins`) result = { pins: [{
        id: `photo-${i}`, imageUrl: '/email/eddy-quote.png', lat: points[i][2].coordinates.lat + 0.01,
        lng: points[i][2].coordinates.lng + 0.01, conditionCode: 'flowing', matchesCurrent: true,
        gaugeHeightFt: 3, dischargeCfs: 500, gaugeName: null, accessPointName: named[i],
        accessPointHref: null, capturedAt: timestamp, createdAt: timestamp,
      }] };
      if (path === `/api/rivers/${r.slug}/visuals`) result = {
        visuals: [],
        byLevel: [],
        currentCondition: 'flowing',
        currentGaugeHeightFt: 3,
        currentDischargeCfs: 500
      };
      if (path === `/api/rivers/${r.slug}/access-points`) {
        if (delayAccess) await new Promise(r => setTimeout(r, 700));
        result = {
          accessPoints: points[i]
        };
      }
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(result)
    });
  };
  await page.route('**/*', routeHandler);
  await page.goto(`${origin}/planner-map-layout-check`, {
    waitUntil: 'domcontentloaded'
  });
  console.log('Planner page loaded');
  const search = page.getByRole('combobox', {
    name: 'Search rivers and access points'
  });
  await search.waitFor();
  console.log('Search mounted');
  await page.screenshot({
    path: `${out}/initial-debug.png`
  });
  await page.waitForFunction(() => window.plannerMap?.getLayer('condition-network-layer') && window.plannerMap?.getLayer('planner-access-dots'));
  await page.waitForFunction(() => window.plannerMap?.getSource('planner-access-catalog')?.getData().then(data => data.features.length === 9));
  await page.waitForFunction(() => window.plannerMap?.queryRenderedFeatures({
    layers: ['condition-network-layer']
  }).length > 0);
  await page.screenshot({
    path: `${out}/desktop-overview.png`
  });
  console.log('Overview: all rivers and access sources mounted', await page.evaluate(() => ({
    layers: window.plannerMap.getStyle().layers.map(l => l.id),
    rendered: window.plannerMap.queryRenderedFeatures().length,
    loaded: window.plannerMap.isSourceLoaded('condition-network-source')
  })));
  await page.evaluate(() => { window.firstPlannerMap = window.plannerMap; });
  await page.waitForFunction(() => document.querySelectorAll('.gauge-station-marker').length === 3 && document.querySelectorAll('.poi-marker').length === 3 && document.querySelectorAll('.river-photo-marker').length === 3);
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  assert.equal(await attribution.getAttribute('open'), null);
  assert.equal(await attribution.evaluate(el => el.classList.contains('maplibregl-compact-show')), false);
  for (const text of ['Your next river day', 'River colors show current', 'Make a day of it']) assert.equal(await page.getByText(text, { exact: false }).count(), 0);
  await page.getByRole('button', { name: 'Map filters', exact: true }).click();
  for (const name of ['Nearby rivers', 'River names', 'Gauge stations', 'Water flow', 'Points of interest', 'River photos']) {
    assert.equal(await page.getByRole('button', { name: new RegExp(name) }).getAttribute('aria-pressed'), 'true');
  }
  await page.getByRole('button', { name: /Gauge stations/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.gauge-station-marker').length === 0);
  await page.getByRole('button', { name: /Gauge stations/ }).click();
  await page.getByRole('button', { name: 'Map filters', exact: true }).click();
  console.log('All desktop filters start enabled; statewide gauges, POIs and collapsed attribution verified');
  delayRiver = true;
  await search.fill('current');
  await page.getByRole('option', { name: /^Current River\b/ }).click();
  await page.getByRole('button', { name: 'Eddy Says — River Report' }).waitFor();
  assert(await page.evaluate(() => window.plannerMap === window.firstPlannerMap));
  await page.getByRole('button', { name: 'All rivers', exact: true }).click();
  assert(await page.evaluate(() => window.plannerMap === window.firstPlannerMap));
  await search.fill('current put');
  await page.getByRole('option', {
    name: /Current Put-in/
  }).click();
  await page.getByRole('button', {
    name: 'Use as put-in',
    exact: true
  }).waitFor();
  await page.getByRole('button', {
    name: 'Eddy Says — River Report'
  }).waitFor();
  await page.waitForFunction(() => window.plannerMap?.getLayer('condition-river-layer') && window.plannerMap.queryRenderedFeatures({
    layers: ['condition-river-layer']
  }).length > 0 && window.plannerMap.getZoom() >= 11.99 && !window.plannerMap.isMoving());
  await page.screenshot({
    path: `${out}/desktop-access.png`
  });
  // Changing the floating panel width must move the chosen access to the
  // center of the remaining map area, without a fixed camera offset.
  const panel = page.locator('.planner-panel');
  await panel.evaluate(el => { el.style.width = '400px'; });
  await page.waitForFunction(coordinates => {
    const map = window.plannerMap;
    const canvas = map.getCanvas().getBoundingClientRect();
    const panel = document.querySelector('.planner-panel').getBoundingClientRect();
    const point = map.project([coordinates.lng, coordinates.lat]);
    return !map.isMoving() && Math.abs(point.x - (canvas.width + Math.min(canvas.width / 2, panel.right - canvas.left + 24) - 64) / 2) < 2;
  }, points[0][0].coordinates);
  await panel.evaluate(el => { el.style.width = ''; });
  await page.waitForFunction(() => !window.plannerMap.isMoving());
  console.log('Access camera centers beside the measured panel width');

  await page.getByRole('button', {
    name: 'Use as put-in',
    exact: true
  }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('putIn') === 'p-0-0');
  await search.fill('current take');
  await search.press('ArrowDown');
  await search.press('Enter');
  const planRequest = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === '/api/plan' && url.searchParams.get('startId') === 'p-0-0' && url.searchParams.get('endId') === 'p-0-1' && url.searchParams.get('riverId') === 'r-0';
  });
  await page.getByRole('button', {
    name: 'Use as take-out',
    exact: true
  }).click();
  await planRequest;
  await page.waitForFunction(() => new URLSearchParams(location.search).get('takeOut') === 'p-0-1');
  console.log('Mouse + keyboard search retains both route endpoints and requests the correct plan');
  const assertDesktopLayout = async () => {
    const result = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const panel = box('.planner-panel');
      const strip = box('.planner-access-strip');
      const map = box('.planner-desktop');
      const nav = box('.maplibregl-ctrl-top-right .maplibregl-ctrl-group');
      const tools = box('.eddy-map-tools');
      const card = box('.planner-glass.flex-1');
      return { noPanelOverlap: panel.right < strip.left, cardExtends: map.bottom - card.bottom <= 41,
        controlsStack: nav.bottom + 8 <= tools.top, noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.deepEqual(result, { noPanelOverlap: true, cardExtends: true, controlsStack: true, noHorizontalOverflow: true });
  };
  await assertDesktopLayout();
  await page.getByRole('button', { name: 'Map filters', exact: true }).click();
  await assertDesktopLayout();
  await page.getByRole('button', { name: 'Map filters', exact: true }).click();
  await page.screenshot({ path: `${out}/desktop-route.png` });
  await page.getByRole('button', { name: 'All rivers', exact: true }).click();
  await page.waitForFunction(() => !window.plannerMap.isMoving());
  assert(await page.evaluate(() => window.plannerMap === window.firstPlannerMap));
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('putIn')), 'p-0-0');
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('takeOut')), 'p-0-1');
  await assertDesktopLayout();
  assert.equal(documentRequests, 1, 'River changes must not navigate/reload the document');
  // Poll: after All rivers the network source is re-set asynchronously, and
  // when the camera doesn't move there's no moveend to wait on first.
  const riverHit = await (await page.waitForFunction(coordinates => {
    const map = window.plannerMap;
    const rect = map.getCanvas().getBoundingClientRect();
    for (const coordinate of coordinates) {
      const p = map.project(coordinate);
      const x = rect.left + p.x, y = rect.top + p.y;
      if (x < 380 || x > rect.right - 80 || y < rect.top + 90 || y > rect.bottom - 200) continue;
      if (document.elementFromPoint(x, y) !== map.getCanvas()) continue;
      if (map.queryRenderedFeatures(p, { layers: ['planner-access-dots'] }).length) continue;
      if (map.queryRenderedFeatures(p, { layers: ['condition-network-hit-layer'] }).some(f => f.properties.slug === 'current')) return { x, y };
    }
    return null;
  }, geometry[0].coordinates).catch(() => null))?.jsonValue();
  assert(riverHit, 'A condition-colored river must have a clickable segment');
  await page.mouse.click(riverHit.x, riverHit.y);
  await page.getByRole('button', { name: 'All rivers', exact: true }).waitFor();
  assert(await page.evaluate(() => window.plannerMap === window.firstPlannerMap));
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('putIn')), 'p-0-0');
  console.log('Same map across overview, loading, selection and All Rivers; saved plan and camera preserved');
  await page.getByRole('button', {
    name: 'Map layers',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: 'Natural',
    exact: true
  }).click();
  await page.waitForFunction(() => window.plannerMap?.getLayer('planner-access-dots') && window.plannerMap?.getLayer('condition-river-layer') && window.plannerMap.queryRenderedFeatures({
    layers: ['condition-river-layer']
  }).length > 0);
  assert.equal(await attribution.getAttribute('open'), null);
  await page.locator('.maplibregl-ctrl-attrib-button').click();
  assert.notEqual(await attribution.getAttribute('open'), null);
  await page.evaluate(() => window.plannerMap.addSource('late-credit', { type: 'geojson', attribution: 'Late fixture credit', data: { type: 'FeatureCollection', features: [] } }));
  assert.notEqual(await attribution.getAttribute('open'), null);
  await page.locator('.maplibregl-ctrl-attrib-button').click();
  console.log('Access and condition layers survive a basemap change; attribution stays collapsed until opened');
  await search.fill('current riverside');
  await page.getByRole('option', {
    name: /Current Riverside park/
  }).click();
  await page.getByText('A place to explore; this is not a float launch.').waitFor();
  assert.equal(await page.getByRole('button', {
    name: 'Use as put-in',
    exact: true
  }).count(), 0);
  console.log('Non-endpoints remain viewable and cannot start a float');
  delayAccess = true;
  await search.fill('meramec put');
  await page.getByRole('option', {
    name: /Meramec Put-in/
  }).click();
  await page.getByRole('button', {
    name: 'Use as put-in',
    exact: true
  }).waitFor();
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('putIn')), 'p-0-0');
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('takeOut')), 'p-0-1');
  await page.getByRole('button', {
    name: 'Use as put-in',
    exact: true
  }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('putIn') === 'p-1-0');
  assert(await page.evaluate(() => window.plannerMap === window.firstPlannerMap));
  assert.equal(documentRequests, 1);
  console.log('Cross-river inspection preserves the route until an endpoint is chosen');
  await page.waitForFunction(() => !window.plannerMap.isMoving());
  await page.setViewportSize({
    width: 1024,
    height: 768
  });
  await page.screenshot({
    path: `${out}/desktop-1024.png`
  });
  await assertDesktopLayout();
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.getByRole('button', {
    name: 'Eddy Says — River Report'
  }).waitFor();
  assert.equal(await search.count(), 0);
  await page.screenshot({
    path: `${out}/mobile-unchanged.png`
  });
  // Returning to the catalogue and clicking a dot exercises overlapping river hits.
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.getByRole('button', { name: 'Map layers', exact: true }).waitFor();
  await page.getByRole('button', {
    name: 'All rivers',
    exact: true
  }).click();
  await page.waitForFunction(() => window.plannerMap?.getLayer('planner-access-dots') && window.plannerMap.isSourceLoaded('planner-access-catalog') && !window.plannerMap.isMoving());
  const dot = await page.evaluate(() => {
    const map = window.plannerMap;
    const f = map.queryRenderedFeatures({
      layers: ['planner-access-dots']
    }).find(f => f.properties.name === 'Current Put-in');
    if (!f) return null;
    const p = map.project(f.geometry.coordinates),
      r = map.getCanvas().getBoundingClientRect();
    return {
      x: r.x + p.x,
      y: r.y + p.y
    };
  });
  assert(dot, 'Overview access pin must actually paint');
  await page.mouse.click(dot.x, dot.y);
  await page.getByRole('region', {
    name: 'Selected access point'
  }).getByRole('heading', {
    name: 'Current Put-in',
    exact: true
  }).waitFor();
  await page.getByRole('button', {
    name: 'Use as put-in',
    exact: true
  }).waitFor();
  console.log('A pin overlapping a river opens access details');
  // A failed full catalogue still leaves river search available and offers retry.
  failCatalog = true;
  await page.goto(`${origin}/planner-map-layout-check`, {
    waitUntil: 'domcontentloaded'
  });
  await search.fill('current');
  await page.getByText('Access points couldn’t load.', {
    exact: false
  }).waitFor();
  await page.getByRole('option', {
    name: /Current River/
  }).waitFor();
  failCatalog = false;
  await page.getByRole('button', {
    name: 'Try again',
    exact: true
  }).click();
  await search.fill('current put');
  await page.getByRole('option', {
    name: /Current Put-in/
  }).waitFor();
  await search.press('Escape');
  assert.equal(await search.getAttribute('aria-expanded'), 'false');
  console.log('Catalogue failure, retry, and Escape dismissal passed');
  delayRiver = false;
  await page.goto(`${origin}/planner-map-layout-check?river=current&lat=37.4&lng=-91.2&z=10`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Eddy Says — River Report' }).waitFor();
  await page.waitForFunction(() => window.plannerMap?.getLayer('condition-river-layer') && !window.plannerMap.isMoving());
  const camera = await page.evaluate(() => ({ lat: window.plannerMap.getCenter().lat, lng: window.plannerMap.getCenter().lng, zoom: window.plannerMap.getZoom() }));
  assert(Math.abs(camera.lat - 37.4) < 0.0001 && Math.abs(camera.lng + 91.2) < 0.0001 && Math.abs(camera.zoom - 10) < 0.01);
  console.log('Initial camera deep link survives loading river data and vessel defaults');

  // Complete plans, selection recovery, and fullscreen use the real planner.
  await page.goto(`${origin}/planner-map-layout-check?river=current&putIn=p-0-0&takeOut=p-0-1`, { waitUntil: 'domcontentloaded' });
  const currentEndpoints = points[0].slice(0, 2).map(point => point.coordinates);
  const endpointsVisible = async (target, mobile = false) => {
    await target.waitForFunction(({ coords, mobile }) => {
      const map = window.plannerMap;
      if (!map || map.isMoving() || !map.getLayer('float-route-layer')) return false;
      const canvas = map.getCanvas().getBoundingClientRect();
      const panel = document.querySelector('.planner-panel')?.getBoundingClientRect();
      const sheetElement = document.querySelector('[data-plan-sheet]');
      if (mobile && sheetElement?.getAnimations().some(animation => animation.playState === 'running')) return false;
      const sheet = sheetElement?.getBoundingClientRect();
      if (mobile && (!sheet || Math.abs(sheet.height - Math.round(innerHeight * 0.42)) > 1)) return false;
      return coords.every(c => {
        const p = map.project([c.lng, c.lat]);
        return p.x > (mobile ? 8 : panel.right - canvas.left + 8) && p.x < canvas.width - 44
          && p.y > 75 && p.y < (mobile && sheet ? sheet.top - canvas.top - 24 : canvas.height - 85);
      });
    }, { coords: currentEndpoints, mobile });
  };
  await endpointsVisible(page);
  assert.equal(await page.evaluate(() => window.plannerMap.getPaintProperty('float-route-layer', 'line-color')), '#F07052');
  await page.locator('button[data-access-point-id="p-0-1"]').click();
  await page.getByRole('region', { name: 'Selected access point' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('takeOut'), 'p-0-1', 'Inspecting the selected strip card must retain it');
  await page.keyboard.press('Escape');
  await page.getByRole('region', { name: 'Selected access point' }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Clear route & start over', exact: true }).click();
  await page.waitForFunction(() => !new URLSearchParams(location.search).has('putIn') && !new URLSearchParams(location.search).has('takeOut'));
  await page.getByRole('button', { name: 'Undo route change', exact: true }).click();
  await endpointsVisible(page);
  assert.equal(new URL(page.url()).searchParams.get('putIn'), 'p-0-0');
  assert.equal(new URL(page.url()).searchParams.get('takeOut'), 'p-0-1');
  await search.fill('meramec');
  await page.getByRole('option', { name: /^Meramec River\b/ }).click();
  await page.getByRole('button', { name: 'Undo route change', exact: true }).click();
  await endpointsVisible(page);
  await page.getByRole('button', { name: 'Expand map', exact: true }).click();
  await page.locator('button[data-access-point-id="p-0-1"]').click();
  const useTakeOut = page.getByRole('button', { name: 'Use as take-out', exact: true });
  await useTakeOut.click(); // A covered button fails Playwright's actual hit test.
  await endpointsVisible(page);
  await page.screenshot({ path: `${out}/desktop-fullscreen-route.png` });
  await page.getByRole('button', { name: 'Collapse map', exact: true }).click();
  await endpointsVisible(page);
  const marker = page.locator('.access-point-marker[data-access-point-id="p-0-1"]');
  await marker.focus();
  await marker.press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Selected access point');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.matches('.access-point-marker[data-access-point-id="p-0-1"]'));
  for (const [selector, popup] of [['.gauge-station-marker', '.gauge-station-popup'], ['.poi-marker', '.poi-popup'], ['.hazard-marker', '.hazard-popup']]) {
    const pin = page.locator(selector).first();
    await pin.evaluate(el => {
      const map = window.plannerMap;
      const canvas = map.getCanvas().getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const x = rect.x + rect.width / 2 - canvas.x, y = rect.y + rect.height / 2 - canvas.y;
      if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) {
        if (el.tabIndex !== -1) throw new Error('Offscreen pin is still in the tab order');
      }
      map.jumpTo({ center: map.unproject([x, y]) });
    });
    await pin.focus();
    await pin.press('Enter');
    await page.locator(popup).waitFor();
    await pin.press('Escape');
    await page.locator(popup).waitFor({ state: 'hidden' });
  }
  // A real pan must survive a panel resize; Show route deliberately restores it.
  await page.getByRole('button', { name: 'Show route', exact: true }).click();
  await endpointsVisible(page);
  const canvas = await page.locator('.maplibregl-canvas').boundingBox();
  const initialCenter = await page.evaluate(() => window.plannerMap.getCenter().toArray());
  await page.mouse.move(canvas.x + canvas.width * 0.7, canvas.y + canvas.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.7 + 100, canvas.y + canvas.height * 0.5 + 60, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(before => !window.plannerMap.isMoving()
    && window.plannerMap.getCenter().lng !== before[0], initialCenter);
  const pannedCenter = await page.evaluate(() => window.plannerMap.getCenter().toArray());
  await panel.evaluate(el => { el.style.width = '400px'; });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(await page.evaluate(() => window.plannerMap.getCenter().toArray()), pannedCenter);
  await panel.evaluate(el => { el.style.width = ''; });
  await page.getByRole('button', { name: 'Show route', exact: true }).click();
  await endpointsVisible(page);
  console.log('Desktop route framing, orange route, Undo, fullscreen, keyboard markers and pan recovery passed');

  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  mobile.on('pageerror', error => errors.push(String(error)));
  await mobile.route('**/*', routeHandler);
  await mobile.goto(`${origin}/planner-map-layout-check?river=current`, { waitUntil: 'domcontentloaded' });
  await mobile.locator('.access-point-marker[data-access-point-id="p-0-0"]').waitFor();
  assert.equal(await mobile.locator('.maplibregl-ctrl-zoom-in,.maplibregl-ctrl-zoom-out').count(), 2);
  await mobile.evaluate(c => window.plannerMap.jumpTo({ center: [c.lng, c.lat], zoom: 12 }), points[0][0].coordinates);
  await mobile.locator('.access-point-marker[data-access-point-id="p-0-0"]').tap();
  await mobile.getByRole('button', { name: 'Use as put-in', exact: true }).waitFor();
  assert.equal(new URL(mobile.url()).searchParams.get('putIn'), null);
  await mobile.getByRole('button', { name: 'Use as put-in', exact: true }).tap();
  await mobile.waitForFunction(() => new URLSearchParams(location.search).get('putIn') === 'p-0-0');
  await mobile.getByRole('button', { name: /Search rivers and access points, currently/ }).tap();
  const mobileSearch = mobile.getByRole('combobox', { name: 'Search rivers and access points', exact: true });
  await mobileSearch.fill('take');
  await mobile.getByRole('option', { name: /Current Take-out/ }).tap();
  await mobile.getByRole('button', { name: 'Use as take-out', exact: true }).tap();
  await endpointsVisible(mobile, true);
  await mobile.screenshot({ path: `${out}/mobile-completed-route.png` });
  await mobile.getByRole('button', { name: 'Expand map', exact: true }).tap();
  await endpointsVisible(mobile, true);
  await mobile.getByRole('button', { name: /Search rivers and access points, currently/ }).tap();
  await mobileSearch.fill('put');
  await mobile.getByRole('option', { name: /Current Put-in/ }).tap();
  await mobile.getByRole('button', { name: 'Use as put-in', exact: true }).tap();
  await endpointsVisible(mobile, true);
  assert.equal(new URL(mobile.url()).searchParams.get('takeOut'), 'p-0-1', 'Replacing the start with itself preserves the finish');
  await mobile.getByRole('button', { name: 'Collapse map', exact: true }).tap();
  await mobile.getByRole('button', { name: /Search rivers and access points, currently/ }).tap();
  await mobileSearch.fill('meramec');
  await mobile.getByRole('option', { name: /^Meramec River\b/ }).tap();
  await mobile.getByRole('button', { name: 'Undo route change', exact: true }).tap();
  await endpointsVisible(mobile, true);
  await mobile.screenshot({ path: `${out}/mobile-restored-route.png` });
  console.log('Mobile touch preview, current-river access search, zoom controls, fullscreen, route fit and Undo passed');
  assert.deepEqual(errors, []);
  console.log('Desktop 1440/1024, mobile and runtime checks passed');
} catch (error) {
  console.error(log.slice(-4500));
  console.error('Browser errors:', errors);
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) {
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    console.error('Control diagnostics', await page.evaluate(() => Array.from(document.querySelectorAll('.maplibregl-ctrl-top-right, .eddy-map-tools')).map(el => ({
      className: el.className, rect: el.getBoundingClientRect().toJSON(), position: getComputedStyle(el).position,
      buttons: el.querySelectorAll('button').length,
    }))).catch(() => []));
  }
  throw error;
} finally {
  await cleanup();
}
