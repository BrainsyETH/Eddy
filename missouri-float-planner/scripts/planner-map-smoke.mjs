// Real planner + MapLibre, synthetic API data, no production credentials.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { waitForMapData, runNationalGaugeChecks, nationalGaugeIndex, nationalGaugeDetail, addNearbyGaugeFixtures, gaugeViewportFixture } from './national-gauges-smoke.mjs';
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
const points = riverMeta.map((river, i) => ['Put-in', 'Take-out', 'Riverside park', 'Alternative'].map((suffix, j) => {
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
    type: j === 0 ? 'campground' : 'boat_ramp',
    types: [j === 0 ? 'campground' : 'boat_ramp', 'access'],
    isPublic: true,
    isFloatEndpoint: j !== 2,
    ownership: 'Public',
    description: 'A shaded launch beside the river, with a short walk from the parking area.',
    amenities: ['boat_ramp'],
    imageUrls: ['/images/river-guides/buffalo-card.webp'],
    parkingInfo: 'Parking above the gravel ramp.',
    roadAccess: 'Paved road to the riverside lot.',
    facilities: 'Restrooms and picnic tables.',
    feeRequired: false,
    feeNotes: null
  };
}));
const nearbyGaugeIndex = addNearbyGaugeFixtures(points[0]);
async function selectAccessMarker(page, id, touch = false) {
  const marker = page.locator(`.access-point-marker[data-access-point-id="${id}"]`);
  const grouped = await marker.getAttribute('data-cluster-count');
  if (touch) await marker.tap(); else await marker.click();
  if (grouped) {
    const point = points.flat().find(point => point.id === id);
    const choice = page.getByRole('region', { name: 'Choose a place' }).getByRole('button', { name: new RegExp(point.name) });
    if (touch) await choice.tap(); else await choice.click();
  }
}
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
      type: p.type,
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
  log = '',
  heldAccess = null;
const errors = [];
function holdAccess(slug) {
  assert.equal(heldAccess, null);
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  heldAccess = { slug, wait, release };
  return () => { heldAccess = null; release(); };
}
async function cleanup() {
  heldAccess?.release();
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
  server = spawn(process.execPath, ['scripts/map-smoke-server.mjs', String(port)], {
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
  assert((await fetch(`${origin}/river-map`)).ok, 'Prewarm the second map before browser hydration');
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  // With JavaScript disabled, viewport state is still unknown. The desktop
  // search must already be visible in the server-rendered HTML.
  const ssrPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, javaScriptEnabled: false });
  await ssrPage.route('**/_next/image?*', async route => route.fulfill({
    contentType: 'image/png', body: await readFile('public/email/eddy-quote.png'),
  }));
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
  let nationalFixture = false;
  let failCatalog = false,
    delayRiver = false, emptyAccessRiver = null, clusterFixture = false;
  let documentRequests = 0;
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++; });
  await page.addInitScript(() => localStorage.setItem('eddy-plan-map-filters-v1', JSON.stringify({
    showNetwork: false, showRiverNames: false, showGauges: true, showPOIs: false, showPhotos: false, hiddenPoiCategories: ['spring']
  })));
  const routeHandler = async route => {
    const url = new URL(route.request().url());
    if (url.hostname.endsWith('.public.blob.vercel-storage.com') && url.pathname.includes('Eddy_Otter/')) {
      const mood = url.pathname.includes('flag') ? 'flag' : ['green', 'red', 'yellow', 'flood'].find(mood => url.pathname.includes(mood)) ?? 'standard';
      return route.fulfill({ contentType: 'image/png', body: await readFile(`../eddy-ios/assets/otter/${mood}.png`) });
    }
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
    if (url.pathname === '/_next/image') {
      const source = url.searchParams.get('url') ?? '';
      const local = source.startsWith('/') && existsSync(`public${source}`) ? `public${source}` : 'public/email/eddy-quote.png';
      return route.fulfill({ contentType: local.endsWith('.webp') ? 'image/webp' : 'image/png', body: await readFile(local) });
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname;
    let result = {};
    if (path === '/api/gauges/points') return route.fulfill({ json: nationalFixture ? nationalGaugeIndex : nearbyGaugeIndex });
    if (path === '/api/gauges/map') return route.fulfill({ json: gaugeViewportFixture(nationalFixture ? nationalGaugeIndex : nearbyGaugeIndex, url) });
    if (path.startsWith('/api/gauges/')) return route.fulfill({ json: { gauge: nationalGaugeDetail(path.split('/').pop()) } });
    if (path === '/api/usgs/mo-history-bundle' || path === '/api/usgs/mo-forecast') return route.fulfill({ json: { entries: [], generatedAt: timestamp, days: 30 } });
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
      } : clusterFixture ? { ...dataset, rivers: dataset.rivers.map((r, i) => i ? r : { ...r, pois: r.pois.map(p => ({ ...p, lon: points[0][3].coordinates.lng, lat: points[0][3].coordinates.lat })) }) } : dataset;
    } else if (path === '/api/usgs/mo-statewide') result = statewide;else if (path === '/api/rivers') result = {
      rivers: riverMeta
    };else if (path === '/api/vessel-types') result = {
      vesselTypes: [{
        id: 'canoe',
        slug: 'canoe',
        name: 'Canoe'
      }, {
        id: 'raft',
        slug: 'raft',
        name: 'Raft'
      }]
    };else if (path === '/api/gauges') result = {
      gauges: riverMeta.map((river, i) => ({
        id: `g-${i}`, name: `${named[i]} gauge`, usgsSiteId: `0706700${i}`, active: true,
        coordinates: clusterFixture && i === 0 ? points[0][3].coordinates : { lng: points[i][0].coordinates.lng + 0.3, lat: points[i][0].coordinates.lat + 0.3 },
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
      if (path === `/api/rivers/${r.slug}/pois`) result = { pois: dataset.rivers[i].pois.map(poi => ({ ...poi, riverId: r.id, latitude: clusterFixture && i === 0 ? points[0][3].coordinates.lat : poi.lat, longitude: clusterFixture && i === 0 ? points[0][3].coordinates.lng : poi.lon, riverMile: poi.river_mile, images: [], amenities: [], bodyText: null, source: 'manual', active: true })) };
      const selected = points[i].find(point => path === `/api/rivers/${r.slug}/access/${point.slug}`);
      if (selected) result = {
        accessPoint: { ...selected, roadSurface: ['paved'], parkingCapacity: '20', managingAgency: 'NPS', officialSiteUrl: null, localTips: null, nearbyServices: [], npsCampground: null,
          drivingLat: selected.coordinates.lat + 0.005, drivingLng: selected.coordinates.lng + 0.005,
          path: `${r.path}/access/${selected.slug}`, river: r,
          availability: { window: { startDate: timestamp.slice(0, 10), endDate: timestamp.slice(0, 10), label: 'Tonight' }, sitesOpen: 8, sitesReservable: 24, status: 'open', kind: 'campground', source: 'mo_state_parks', fetchedAt: timestamp },
          booking: { source: 'mo_state_parks', url: 'https://icampmo.usedirect.com/' },
        },
        nearbyAccessPoints: [],
        gaugeStatus: { level: 'flowing', cfs: 500, heightFt: 3, label: 'Flowing', trend: 'steady', lastUpdated: timestamp, gaugeId: `g-${i}`, gaugeName: 'Fixture gauge', usgsId: `0706700${i}` },
      };
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
        if (heldAccess?.slug === r.slug) await heldAccess.wait;
        result = {
          accessPoints: emptyAccessRiver === r.slug ? [] : points[i]
        };
      }
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(result)
    });
  };
  if (!process.env.NATIONAL_GAUGES_ONLY) {
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
  await page.waitForFunction(() => window.plannerMap?.getLayer('condition-network-layer') && window.plannerMap?.getLayer('planner-place-hits'));
  await waitForMapData(page, () => window.plannerMap?.getSource('planner-places')?.getData().then(data => data.features.length === 18));
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
  await waitForMapData(page, async () => { const data = await window.plannerMap.getSource('planner-places').getData(); return data.features.filter(f => f.properties.key.startsWith('gauge:')).length === 3 && data.features.filter(f => f.properties.key.startsWith('poi:')).length === 3 && document.querySelectorAll('.river-photo-marker').length === 3; });
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  assert.equal(await page.getByRole('button', { name: 'Undo route change', exact: true }).count(), 0);
  assert.equal(await attribution.getAttribute('open'), null);
  assert.equal(await attribution.evaluate(el => el.classList.contains('maplibregl-compact-show')), false);
  for (const text of ['Your next river day', 'River colors show current', 'Make a day of it']) assert.equal(await page.getByText(text, { exact: false }).count(), 0);
  await page.getByRole('button', { name: 'Map filters', exact: true }).click();
  for (const name of ['Nearby rivers', 'River names', 'USGS gauges', 'Water flow', 'Points of interest', 'River photos']) {
    assert.equal(await page.getByRole('button', { name: new RegExp(name) }).getAttribute('aria-pressed'), 'true');
  }
  await page.getByRole('button', { name: /USGS gauges/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.gauge-station-marker').length === 0);
  await page.getByRole('button', { name: /USGS gauges/ }).click();
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
  await page.getByRole('heading', { name: 'Getting in', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Parking', exact: true }).waitFor();
  await page.getByText('8 of 24 sites open · Tonight', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has('putIn'), false);
  assert(await page.locator('img[src*="eddy-campground"]').count() > 0);
  await page.screenshot({ path: `${out}/desktop-rich-details.png` });
  const firstPutIn = page.getByRole('button', { name: 'Use as put-in', exact: true });
  assert(await firstPutIn.evaluate(el => getComputedStyle(el).backgroundColor === 'rgb(29, 82, 95)'));
  assert.equal(await page.locator('.planner-selected-ring').count(), 0);
  await page.locator('[data-selected-place-id="p-0-0"] img[src*="eddy-campground"]').waitFor();
  // Inspection reveals a pin without re-centering an already visible one.
  const panel = page.locator('.planner-panel');
  const beforePanelResize = await page.evaluate(() => ({ center: window.plannerMap.getCenter().toArray(), zoom: window.plannerMap.getZoom() }));
  await panel.evaluate(el => { el.style.width = '400px'; });
  await page.waitForFunction(coordinates => {
    const map = window.plannerMap;
    const canvas = map.getCanvas().getBoundingClientRect();
    const panel = document.querySelector('.planner-panel').getBoundingClientRect();
    const point = map.project([coordinates.lng, coordinates.lat]);
    return !map.isMoving() && point.x > panel.right - canvas.left + 12 && point.x < canvas.width - 44;
  }, points[0][0].coordinates);
  assert.equal(await page.evaluate(() => window.plannerMap.getZoom()), beforePanelResize.zoom);
  await panel.evaluate(el => { el.style.width = ''; });
  await page.waitForFunction(() => !window.plannerMap.isMoving());
  console.log('Access inspection preserves zoom and clears the measured panel');

  await page.getByRole('button', {
    name: 'Use as put-in',
    exact: true
  }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('putIn') === 'p-0-0');
  await page.locator('[data-selected-place-id="p-0-0"] .planner-marker-label').waitFor();
  assert.equal(await page.locator('[data-selected-place-id="p-0-0"] .planner-marker-label').textContent(), 'Put-in · Current Put-in');
  assert.equal(await page.locator('[data-selected-place-id="p-0-0"] .planner-marker-label').count(), 1);
  const planRequest = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === '/api/plan' && url.searchParams.get('startId') === 'p-0-0' && url.searchParams.get('endId') === 'p-0-1' && url.searchParams.get('riverId') === 'r-0';
  });
  await search.fill('current take');
  await page.getByRole('option', { name: /Current Take-out/ }).waitFor();
  await search.press('ArrowDown');
  await page.getByRole('option', { name: /Current Take-out/, selected: true }).waitFor();
  await search.press('Enter');
  await planRequest;
  await page.waitForFunction(() => new URLSearchParams(location.search).get('takeOut') === 'p-0-1');
  await page.locator('[data-endpoint-card="p-0-1"] button[aria-expanded="true"]').waitFor();
  await page.locator('[data-selected-place-id="p-0-1"]').waitFor();
  assert.equal(await page.locator('.access-point-marker[data-access-point-id="p-0-1"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: /^(🛶 Canoe|🚣 Raft)$/ }).count(), 0);
  await page.locator('[data-plan-scroll]').evaluate(el => { el.scrollTop = 0; });
  assert(await page.getByRole('button', { name: 'Clear route & start over' }).evaluate(el => {
    const header = el.closest('[data-plan-header]');
    return header && el.getBoundingClientRect().left > header.querySelector('h2').getBoundingClientRect().right;
  }));
  const timeTrigger = page.getByRole('button', { name: 'About estimated float time' });
  assert.equal(await timeTrigger.locator('circle').count(), 1);
  assert(await timeTrigger.evaluate(el => getComputedStyle(el).borderWidth === '0px' && el.getBoundingClientRect().width === 24));
  await timeTrigger.click();
  const tip = page.getByRole('dialog', { name: 'Estimated float time' });
  await tip.getByText(/Rafts may be slower/).waitFor();
  assert(await tip.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight && el.contains(document.elementFromPoint(rect.x + 20, rect.y + 20));
  }), 'Pace information is visible above panels and headers');
  await page.keyboard.press('Escape');
  await tip.waitFor({ state: 'hidden' });
  await page.screenshot({ path: `${out}/desktop-canoe-pace.png` });
  console.log('Mouse + keyboard search retains both route endpoints and requests the correct plan');
  const assertDesktopLayout = async () => {
    await page.locator('.planner-glass.flex-1').waitFor();
    const result = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const panel = box('.planner-panel');
      const strip = box('.planner-access-strip');
      const map = box('.planner-desktop');
      const nav = box('.maplibregl-ctrl-top-right .maplibregl-ctrl-group');
      const tools = box('.eddy-map-tools');
      const card = box('.planner-glass.flex-1');
      return { noPanelOverlap: panel.bottom <= strip.top, cardExtends: Math.abs(strip.top - card.bottom) <= 16, fullWidth: Math.abs(strip.left - map.left) < 1 && Math.abs(strip.right - map.right) < 1,
        controlsStack: nav.bottom + 8 <= tools.top, noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.deepEqual(result, { noPanelOverlap: true, cardExtends: true, fullWidth: true, controlsStack: true, noHorizontalOverflow: true });
  };
  await assertDesktopLayout();
  await page.getByRole('button', { name: 'Map filters', exact: true }).click();
  await assertDesktopLayout();
  await page.getByRole('button', { name: 'Map filters', exact: true }).click();
  await page.screenshot({ path: `${out}/desktop-route.png` });
  await page.getByRole('button', { name: 'All rivers', exact: true }).click();
  // Let the scheduled camera fit start before waiting for it to finish.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => !window.plannerMap.isMoving());
  assert(await page.evaluate(() => window.plannerMap === window.firstPlannerMap));
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('putIn')), 'p-0-0');
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('takeOut')), 'p-0-1');
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('river')), 'current');
  assert.equal(await page.locator('.planner-access-strip button[data-access-point-id="p-0-0"]').count(), 1,
    'All rivers keeps current-river access data and the saved route');
  await assertDesktopLayout();
  assert.equal(documentRequests, 1, 'River changes must not navigate/reload the document');
  // Poll: after All rivers the network source is re-set asynchronously, and
  // when the camera doesn't move there's no moveend to wait on first.
  const riverHit = await (await page.waitForFunction(coordinates => {
    const map = window.plannerMap;
    if (map.isMoving()) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    for (const coordinate of coordinates) {
      const p = map.project(coordinate);
      const x = rect.left + p.x, y = rect.top + p.y;
      if (x < 380 || x > rect.right - 80 || y < rect.top + 90 || y > rect.bottom - 200) continue;
      if (document.elementFromPoint(x, y) !== map.getCanvas()) continue;
      if (map.queryRenderedFeatures(p, { layers: ['planner-place-hits'] }).length) continue;
      if (map.queryRenderedFeatures(p, { layers: ['condition-network-hit-layer'] }).some(f => f.properties.slug === 'current')) return { x, y };
    }
    return null;
  }, geometry[0].coordinates).catch(() => null))?.jsonValue();
  assert(riverHit, 'A condition-colored river must have a clickable segment');
  const riverTapCamera = await page.evaluate(() => ({ center: window.plannerMap.getCenter().toArray(), zoom: window.plannerMap.getZoom() }));
  await page.mouse.click(riverHit.x, riverHit.y);
  await page.getByRole('button', { name: 'All rivers', exact: true }).waitFor();
  assert(await page.evaluate(() => window.plannerMap === window.firstPlannerMap));
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('putIn')), 'p-0-0');
  assert.deepEqual(await page.evaluate(() => ({ center: window.plannerMap.getCenter().toArray(), zoom: window.plannerMap.getZoom() })), riverTapCamera, 'River taps keep the current camera');
  console.log('Same map across overview, loading, selection and All Rivers; saved plan and camera preserved');
  await page.getByRole('button', {
    name: 'Map layers',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: 'Natural',
    exact: true
  }).click();
  await page.waitForFunction(() => window.plannerMap?.getLayer('planner-place-hits') && window.plannerMap?.getLayer('condition-river-layer') && window.plannerMap.queryRenderedFeatures({
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
  await page.locator('.planner-access-strip button[data-access-point-id="p-0-0"]').waitFor({ state: 'visible' });
  // Switching rivers directly: hold the new river's access response until the
  // river actually renders. A fixed delay can finish before an assertion and
  // miss the stale-selection window.
  const releaseJacksAccess = holdAccess('jacks-fork');
  const jacksAccessRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/rivers/jacks-fork/access-points');
  await search.fill('jacks fork');
  await page.getByRole('option', { name: /^Jacks Fork River\b/ }).click();
  await jacksAccessRequest;
  await waitForMapData(page, async () => (await window.plannerMap?.getSource('condition-river-source')?.getData())?.properties?.name === 'Jacks Fork River');
  await page.waitForFunction(() => !document.querySelector('.planner-access-strip [data-access-point-id^="p-0-"]'));
  assert.equal(await page.locator('.planner-access-strip button[data-access-point-id]').count(), 0, 'desktop strips must not expose the previous river while access data loads');
  assert.equal(await page.getByRole('button', { name: 'Use as put-in', exact: true }).count(), 0);
  assert(await page.evaluate(() => window.plannerMap === window.firstPlannerMap),
    'switching rivers retains the desktop map while access data is pending');
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForMapData(page, async () => {
    const map = window.plannerMap;
    const container = map?.getContainer();
    return container?.isConnected && container.closest('[class~="lg:hidden"]') &&
      (await map.getSource('condition-river-source')?.getData())?.properties?.name === 'Jacks Fork River';
  });
  // River and place sources finish independently during the responsive map
  // handoff. Inspect controls after the new place source and its marker frame.
  await waitForMapData(page, async () => {
    const map = window.plannerMap;
    const source = map?.getSource('planner-places');
    return source && map.isSourceLoaded('planner-places') && (await source.getData()).features.every(f => !f.properties.key.startsWith('access:'));
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.access-point-marker, button[data-access-point-id]').count(), 0, 'mobile markers and strip must not expose previous-river endpoints');
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('putIn')), null);
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Dev Strict Mode creates, removes and recreates the map on the same
  // container; only the live instance still has its canvas in the document.
  await page.waitForFunction(() => window.plannerMap?.getContainer()?.closest('.planner-desktop')
    && window.plannerMap.getCanvas().isConnected);
  // Crossing the desktop/mobile breakpoint intentionally replaces the map.
  // Subsequent desktop-only selection must preserve this new instance.
  await page.evaluate(() => { window.resumedDesktopMap = window.plannerMap; });
  releaseJacksAccess();
  const jacksStart = page.locator('.planner-access-strip button[data-access-point-id="p-2-0"]');
  await jacksStart.waitFor({ state: 'visible' });
  await jacksStart.click();
  await page.getByRole('button', { name: 'Use as put-in', exact: true }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('putIn') === 'p-2-0');
  console.log('Direct river switches hide stale access controls while the new river loads');
  // Previewing another river's access keeps the current route until an
  // endpoint is explicitly chosen; the preview waits for its own access data.
  const releaseMeramecAccess = holdAccess('meramec');
  const meramecAccessRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/rivers/meramec/access-points');
  await search.fill('meramec put');
  await page.getByRole('option', { name: /Meramec Put-in/ }).click();
  await meramecAccessRequest;
  await page.getByText('Loading access details…', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Use as put-in', exact: true }).count(), 0);
  releaseMeramecAccess();
  await page.getByRole('button', { name: 'Use as put-in', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('river')), 'jacks-fork');
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('putIn')), 'p-2-0');
  // Keyboard choice on an uncached river: focus must never drop to <body>
  // while the river loads, and must land on the new put-in once it mounts.
  await page.evaluate(() => {
    window.focusFellToBody = false;
    const watch = () => { if (document.activeElement === document.body) window.focusFellToBody = true; };
    window.focusWatch = setInterval(watch, 10);
  });
  await page.getByRole('button', { name: 'Use as put-in', exact: true }).press('Enter');
  await page.waitForFunction(() => new URLSearchParams(location.search).get('putIn') === 'p-1-0');
  // The new river loads after the endpoint choice; wait for its route panel.
  await page.locator('.planner-glass.flex-1').waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('.access-point-marker[data-access-point-id="p-1-0"]'));
  assert.equal(await page.evaluate(() => { clearInterval(window.focusWatch); return window.focusFellToBody; }), false,
    'keyboard focus must not fall to <body> while the chosen river loads');
  assert(await page.evaluate(() => window.plannerMap === window.resumedDesktopMap));
  assert.equal(documentRequests, 1);
  console.log('Cross-river inspection preserves the route until an endpoint is chosen');
  await page.waitForFunction(() => !window.plannerMap.isMoving());
  await page.setViewportSize({
    width: 1024,
    height: 768
  });
  await assertDesktopLayout();
  await page.screenshot({
    path: `${out}/desktop-1024.png`
  });
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
  // Source readiness can precede the scheduled camera fit and the first paint.
  // Wait for the actual pin at a settled, clickable position.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(c => window.plannerMap.jumpTo({ center: [c.lng, c.lat], zoom: 13 }), points[0][0].coordinates);
  const overviewPin = page.locator('.access-point-marker[data-access-point-id="p-0-0"]');
  await overviewPin.click();
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
  // Wait for the re-render rather than reading the attribute once.
  await page.locator('.planner-search input[aria-expanded="false"]').waitFor();
  console.log('Catalogue failure, retry, and Escape dismissal passed');
  delayRiver = false;
  await page.goto(`${origin}/planner-map-layout-check?river=current&lat=37.4&lng=-91.2&z=10&vessel=raft`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Eddy Says — River Report' }).waitFor();
  await page.waitForFunction(() => window.plannerMap?.getLayer('condition-river-layer') && !window.plannerMap.isMoving());
  const camera = await page.evaluate(() => ({ lat: window.plannerMap.getCenter().lat, lng: window.plannerMap.getCenter().lng, zoom: window.plannerMap.getZoom() }));
  assert(Math.abs(camera.lat - 37.4) < 0.0001 && Math.abs(camera.lng + 91.2) < 0.0001 && Math.abs(camera.zoom - 10) < 0.01);
  await page.waitForFunction(() => new URLSearchParams(location.search).get('vessel') === 'canoe');
  console.log('Initial camera deep link survives loading river data and vessel defaults');

  // Complete plans, selection recovery, and fullscreen use the real planner.
  await page.goto(`${origin}/planner-map-layout-check?river=current&putIn=p-0-0&takeOut=p-0-1`, { waitUntil: 'domcontentloaded' });
  const currentEndpoints = points[0].slice(0, 2).map(point => point.coordinates);
  const endpointsVisible = async (target, mobile = false) => {
    await target.getByRole('button', { name: 'Show route', exact: true }).click();
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
        // Mobile: clear Filters and the route-tools row (left-3, ~108px wide).
        return p.x > (mobile ? 20 : panel.right - canvas.left + 8) && p.x < canvas.width - 44
          && p.y > 75 && p.y < (mobile && sheet ? sheet.top - canvas.top - 24 : canvas.height - 85);
      });
    }, { coords: currentEndpoints, mobile });
  };
  await endpointsVisible(page);
  assert.equal(await page.evaluate(() => window.plannerMap.getPaintProperty('float-route-layer', 'line-color')), '#F07052');
  assert.equal(await page.getByRole('button', { name: 'Undo route change', exact: true }).count(), 0);
  await page.locator('.planner-access-strip button[data-access-point-id="p-0-1"]').click();
  await page.locator('[data-endpoint-card="p-0-1"] button[aria-expanded="true"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('takeOut'), 'p-0-1');
  await page.getByRole('button', { name: 'Remove take-out', exact: true }).click();
  await page.waitForFunction(() => !new URLSearchParams(location.search).has('takeOut'));
  assert.equal(await page.getByRole('region', { name: 'Selected access point' }).count(), 0);
  await page.getByRole('button', { name: 'Undo route change', exact: true }).press('Enter');
  await endpointsVisible(page);
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Show route');
  assert.equal(await page.getByRole('button', { name: 'Undo route change', exact: true }).count(), 0);
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

  // Strip clicks inspect first; explicit choices still order the pair downstream.
  await page.getByRole('button', { name: 'Clear route & start over', exact: true }).click();
  await page.locator('.planner-access-strip button[data-access-point-id="p-0-1"]').click();
  assert.equal(new URL(page.url()).searchParams.has('putIn'), false);
  await page.getByRole('button', { name: 'Use as put-in', exact: true }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('putIn') === 'p-0-1');
  await page.locator('.planner-access-strip button[data-access-point-id="p-0-0"]').click();
  await endpointsVisible(page);
  assert.equal(new URL(page.url()).searchParams.get('putIn'), 'p-0-0');
  assert.equal(new URL(page.url()).searchParams.get('takeOut'), 'p-0-1');

  // An upstream preview keeps the take-out action and restores automatic ordering.
  await page.getByRole('button', { name: 'Clear route & start over', exact: true }).click();
  await search.fill('current take');
  await page.getByRole('option', { name: /Current Take-out/ }).click();
  await page.getByRole('button', { name: 'Use as put-in', exact: true }).click();
  await search.fill('current put');
  await page.getByRole('option', { name: /Current Put-in/ }).click();
  await endpointsVisible(page);
  assert.equal(new URL(page.url()).searchParams.get('putIn'), 'p-0-0');
  assert.equal(new URL(page.url()).searchParams.get('takeOut'), 'p-0-1');

  await page.getByRole('button', { name: 'Expand map', exact: true }).click();
  await selectAccessMarker(page, 'p-0-1');
  await page.locator('[data-endpoint-card="p-0-1"] button[aria-expanded="true"]').waitFor();
  await page.getByRole('button', { name: 'Show route', exact: true }).click();
  await endpointsVisible(page);
  await page.screenshot({ path: `${out}/desktop-fullscreen-route.png` });
  await page.getByRole('button', { name: 'Collapse map', exact: true }).click();
  await endpointsVisible(page);
  await page.evaluate(c => window.plannerMap.jumpTo({ center: [c.lng, c.lat], zoom: 15 }), points[0][3].coordinates);
  const marker = page.locator('.access-point-marker[data-access-point-id="p-0-3"]');
  await marker.focus();
  await marker.press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Selected access point');
  const filters = page.getByRole('button', { name: 'Map filters', exact: true });
  await page.getByRole('button', { name: 'Expand map', exact: true }).click();
  await filters.click();
  await filters.press('Escape');
  assert.equal(await filters.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.getByRole('region', { name: 'Selected access point' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Collapse map', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Expand weather details', exact: true }).click();
  const weather = page.getByRole('button', { name: 'Collapse weather details', exact: true }).last();
  await weather.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Expand weather details', exact: true }).getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Expand weather details');
  assert.equal(await page.getByRole('button', { name: 'Collapse map', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Show map legend', exact: true }).click();
  await page.getByRole('button', { name: 'Hide map legend', exact: true }).press('Escape');
  await page.getByRole('button', { name: 'Show map legend', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Show map legend');
  assert.equal(await page.getByRole('button', { name: 'Collapse map', exact: true }).count(), 1,
    'Escape closes the legend without leaving fullscreen');
  assert.equal(await page.getByRole('region', { name: 'Selected access point' }).count(), 1);
  await page.getByRole('region', { name: 'Selected access point' }).focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.matches('.access-point-marker[data-access-point-id="p-0-3"]'));
  await page.getByRole('button', { name: 'Collapse map', exact: true }).click();
  for (const [selector, popup] of [['.hazard-marker', '.hazard-popup']]) {
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
  await page.evaluate(c => window.plannerMap.jumpTo({ center: [c.lon, c.lat], zoom: 15 }), dataset.rivers[0].pois[0]);
  const poiPin = page.locator('.poi-marker').first();
  await poiPin.focus();
  await poiPin.press('Enter');
  const poiCard = page.getByRole('region', { name: 'Selected point of interest' });
  await poiCard.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('putIn'), 'p-0-0');
  assert.equal(new URL(page.url()).searchParams.get('takeOut'), 'p-0-1');
  await poiCard.press('Escape');
  await poiCard.waitFor({ state: 'hidden' });
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

  await page.goto(`${origin}/planner-map-layout-check?river=current&putIn=p-0-1&takeOut=p-0-0`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Upstream — paddling against current', { exact: false }).waitFor();
  // Inspecting a third access never mutates endpoints; replacement is explicit.
  await search.fill('current alternative');
  await page.getByRole('option', { name: /Current Alternative/ }).click();
  assert.equal(new URL(page.url()).searchParams.get('putIn'), 'p-0-1');
  assert.equal(new URL(page.url()).searchParams.get('takeOut'), 'p-0-0');
  await page.locator('.planner-place-popup [aria-label="Selected access point"]').waitFor();
  assert.equal(await page.locator('.planner-panel [aria-label="Selected access point"]').count(), 0);
  assert.equal(await page.locator('.planner-panel [data-endpoint-card]').count(), 2);
  await page.locator('[data-selected-place-id="p-0-3"]').waitFor();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForFunction(() => {
    const box = document.querySelector('.planner-place-popup')?.getBoundingClientRect();
    const panel = document.querySelector('.planner-panel')?.getBoundingClientRect();
    return box && panel && box.left > panel.right && box.right < innerWidth && box.top > 175 && box.bottom < innerHeight - 70;
  });
  await page.screenshot({ path: `${out}/desktop-1024-callout.png` });
  await page.getByRole('button', { name: /View details/ }).click();
  await page.locator('.planner-panel [aria-label="Selected access point"]').waitFor();
  assert.equal(await page.locator('.planner-place-popup').count(), 0);
  await page.getByRole('heading', { name: 'Getting in', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back to route', exact: false }).click();
  await page.locator('.planner-panel [data-endpoint-card]').first().waitFor();
  assert.equal(new URL(page.url()).searchParams.get('putIn'), 'p-0-1');
  assert.equal(new URL(page.url()).searchParams.get('takeOut'), 'p-0-0');
  await search.fill('current alternative');
  await page.getByRole('option', { name: /Current Alternative/ }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${out}/desktop-third-place.png` });
  await page.getByRole('button', { name: 'Replace take-out', exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Replace put-in', exact: true }).evaluate(el => getComputedStyle(el).backgroundColor === 'rgb(29, 82, 95)'));
  assert(await page.getByRole('button', { name: 'Replace take-out', exact: true }).evaluate(el => getComputedStyle(el).backgroundColor === 'rgb(240, 112, 82)'));
  await page.getByRole('button', { name: 'Replace put-in', exact: true }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('putIn') === 'p-0-0'
    && new URLSearchParams(location.search).get('takeOut') === 'p-0-3');
  await page.getByRole('button', { name: 'Undo route change', exact: true }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('putIn') === 'p-0-1'
    && new URLSearchParams(location.search).get('takeOut') === 'p-0-0');

  // Deep links survive pending requests, but a completed empty access list
  // must clear both endpoint IDs instead of retaining an unusable route.
  emptyAccessRiver = 'jacks-fork';
  const releaseEmptyAccess = holdAccess(emptyAccessRiver);
  const emptyAccessRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/rivers/jacks-fork/access-points');
  await page.goto(`${origin}/planner-map-layout-check?river=jacks-fork&putIn=p-2-0&takeOut=p-2-1&vessel=canoe`, { waitUntil: 'domcontentloaded' });
  await emptyAccessRequest;
  await waitForMapData(page, async () => (await window.plannerMap?.getSource('condition-river-source')?.getData())?.properties?.name === 'Jacks Fork River');
  assert.deepEqual(await page.evaluate(() => {
    const params = new URLSearchParams(location.search);
    return [params.get('putIn'), params.get('takeOut')];
  }), ['p-2-0', 'p-2-1'], 'loading must preserve deep-link endpoints');
  releaseEmptyAccess();
  await page.waitForFunction(() => {
    const params = new URLSearchParams(location.search);
    return params.get('river') === 'jacks-fork' && !params.has('putIn') && !params.has('takeOut');
  });
  assert.equal(await page.locator('[data-access-point-id^="p-2-"]').count(), 0);
  console.log('Delayed access responses hide stale desktop/mobile controls; empty responses clear both deep-link endpoints');
  emptyAccessRiver = null;
  await page.close();
  // Exact coordinate collisions remain individually reachable on mouse, keyboard and touch.
  clusterFixture = true;
  for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const touch = size.width < 1024;
    const nearby = await browser.newPage({ viewport: size, hasTouch: touch, isMobile: touch });
    nearby.on('pageerror', e => errors.push(String(e)));
    await nearby.route('**/*', routeHandler);
    const c = points[0][3].coordinates;
    await nearby.goto(`${origin}/planner-map-layout-check?river=current&putIn=p-0-0&takeOut=p-0-1&lat=${c.lat}&lng=${c.lng}&z=17`, { waitUntil: 'domcontentloaded' });
    const cluster = nearby.locator('[data-cluster-count="3"]');
    const choose = async name => {
      if (touch) await cluster.tap(); else { await cluster.focus(); await cluster.press('Enter'); }
      await nearby.getByRole('region', { name: 'Choose a place' }).waitFor();
      const row = nearby.getByRole('region', { name: 'Choose a place' }).getByRole('button', { name: new RegExp(name) });
      if (touch) await row.tap(); else await row.click();
    };
    await choose('Current gauge');
    const gauge = nearby.getByRole('region', { name: 'Selected gauge' });
    await gauge.waitFor();
    await nearby.mouse.move(10, 10);
    await nearby.getByRole('group', { name: 'Current gauge reading' }).waitFor();
    assert(await gauge.isVisible(), 'gauge stays open after mouseleave');
    assert.equal(await gauge.getByRole('link', { name: 'View gauge & chart' }).getAttribute('href'), '/gauges/07067000');
    await nearby.locator('[data-selected-place-id="g-0"]').waitFor();
    assert.equal(await nearby.locator('[data-selected-place-id="g-0"]').count(), 1);
    await nearby.waitForFunction(() => !window.plannerMap.isMoving());
    if (touch) await nearby.waitForFunction(() => {
      const label = document.querySelector('[data-selected-place-id="g-0"] .planner-marker-label')?.getBoundingClientRect();
      const back = [...document.querySelectorAll('button')].find(el => el.textContent.includes('Back to route'))?.getBoundingClientRect();
      return label && back && label.bottom + 8 <= back.top;
    });
    await nearby.screenshot({ path: `${out}/${touch ? 'mobile' : 'desktop'}-gauge.png` });
    if (!touch) {
      await nearby.getByRole('button', { name: 'Map layers', exact: true }).click();
      await nearby.getByRole('button', { name: 'Natural', exact: true }).click();
      await nearby.waitForFunction(() => window.plannerMap?.isSourceLoaded('planner-places'));
      assert(await gauge.isVisible(), 'basemap changes preserve selected gauge details');
    }
    await nearby.getByRole('button', { name: 'Close gauge details' }).click();
    await choose('Current Spring');
    await nearby.getByRole('region', { name: 'Selected point of interest' }).waitFor();
    await nearby.getByRole('button', { name: 'Close place details' }).click();
    await choose('Current Alternative');
    const accessCard = nearby.getByRole('region', { name: 'Selected access point' });
    await accessCard.waitFor();
    await nearby.locator('[data-selected-place-id="p-0-3"]').waitFor();
    assert.equal(await nearby.locator('[data-selected-place-id="p-0-3"]').count(), 1);
    // Dismiss from uncovered map space, without hitting a marker, card or river.
    const outside = await nearby.evaluate(() => {
      const map = window.plannerMap, canvas = map.getCanvas(), r = canvas.getBoundingClientRect();
      for (let y = r.top + 150; y < Math.min(r.bottom, innerHeight) - 60; y += 30) for (let x = r.left + 60; x < r.right - 80; x += 30) {
        if (document.elementFromPoint(x, y) === canvas && !map.queryRenderedFeatures([x-r.left,y-r.top], { layers: ['condition-network-hit-layer', 'planner-place-hits'].filter(id => map.getLayer(id)) }).length) return { x, y };
      }
    });
    assert(outside);
    await nearby.mouse.click(outside.x, outside.y);
    await accessCard.waitFor({ state: 'hidden' });
    assert.equal(await nearby.evaluate(() => window.plannerMap.getZoom()), 17, 'Repeated place taps must not zoom the map');
    assert.equal(new URL(nearby.url()).searchParams.get('putIn'), 'p-0-0');
    assert.equal(new URL(nearby.url()).searchParams.get('takeOut'), 'p-0-1');
    await nearby.close();
  }
  clusterFixture = false;
  console.log('Coincident access/POI/gauge choices, persistent gauges, and outside dismissal passed on desktop and touch');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  mobile.on('pageerror', error => errors.push(String(error)));
  await mobile.route('**/*', routeHandler);
  await mobile.goto(`${origin}/planner-map-layout-check?river=current`, { waitUntil: 'domcontentloaded' });
  // Access points may share a curated place cluster; reference gauges use a separate source.
  // Wait for catalog membership before the explicit close-up below.
  await waitForMapData(mobile, async () => {
    const source = window.plannerMap?.getSource('planner-places');
    return source && (await source.getData()).features.some(feature => feature.properties.key === 'access:p-0-0');
  });
  await mobile.locator('.access-point-marker').first().waitFor();
  await mobile.locator('.maplibregl-ctrl-zoom-in').waitFor();
  await mobile.evaluate(() => { window.firstMobilePlannerMap = window.plannerMap; });
  assert.equal(await mobile.getByRole('button', { name: 'Undo route change', exact: true }).count(), 0);
  assert.equal(await mobile.locator('.maplibregl-ctrl-zoom-in,.maplibregl-ctrl-zoom-out').count(), 2);
  await mobile.waitForFunction(() => window.plannerMap && !window.plannerMap.isMoving());
  await mobile.evaluate(c => window.plannerMap.jumpTo({ center: [c.lng, c.lat], zoom: 12 }), points[0][1].coordinates);
  await selectAccessMarker(mobile, 'p-0-1', true);
  assert.equal(new URL(mobile.url()).searchParams.has('putIn'), false);
  await mobile.getByRole('button', { name: 'Use as put-in', exact: true }).tap();
  await mobile.waitForFunction(() => new URLSearchParams(location.search).get('putIn') === 'p-0-1');
  assert.equal(await mobile.getByRole('region', { name: 'Selected access point' }).count(), 0);
  await mobile.evaluate(c => window.plannerMap.jumpTo({ center: [c.lng, c.lat], zoom: 12 }), points[0][0].coordinates);
  await selectAccessMarker(mobile, 'p-0-0', true);
  await mobile.locator('[data-endpoint-card="p-0-0"] button[aria-expanded="true"]').waitFor();
  assert.equal(await mobile.getByRole('button', { name: 'Use as take-out', exact: true }).count(), 0);
  await endpointsVisible(mobile, true);
  assert.equal(new URL(mobile.url()).searchParams.get('putIn'), 'p-0-0');
  assert.equal(new URL(mobile.url()).searchParams.get('takeOut'), 'p-0-1');
  await selectAccessMarker(mobile, 'p-0-0', true);
  assert.equal(new URL(mobile.url()).searchParams.get('putIn'), 'p-0-0');
  await mobile.locator('[data-endpoint-card="p-0-0"] button[aria-expanded="true"]').waitFor();
  await mobile.getByRole('button', { name: 'Show route', exact: true }).tap();
  await endpointsVisible(mobile, true);
  // Short phones (fresh pages: the sheet sizes itself from the viewport it
  // opens in): the default plan sheet must not cover the route tools.
  for (const size of [{ width: 375, height: 667 }, { width: 390, height: 568 }]) {
    const phone = await browser.newPage({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    phone.on('pageerror', error => errors.push(String(error)));
    await phone.route('**/*', routeHandler);
    await phone.goto(`${origin}/planner-map-layout-check?river=current&putIn=p-0-0&takeOut=p-0-1`, { waitUntil: 'domcontentloaded' });
    const settledSheet = () => phone.waitForFunction(() => {
      const sheet = document.querySelector('[data-plan-sheet]');
      return sheet && !sheet.getAnimations().some(a => a.playState === 'running')
        && Math.abs(sheet.getBoundingClientRect().height - Math.round(innerHeight * 0.42)) <= 1;
    });
    await settledSheet();
    // Create history without changing endpoint selection by browsing a pin.
    await phone.getByRole('button', { name: /Search rivers and access points, currently/ }).tap();
    await phone.getByRole('combobox', { name: 'Search rivers and access points', exact: true }).fill('meramec');
    await phone.getByRole('option', { name: /^Meramec River\b/ }).tap();
    await phone.getByRole('button', { name: 'Undo route change', exact: true }).tap();
    await settledSheet();
    const covered = await phone.evaluate(() => {
      const sheetTop = document.querySelector('[data-plan-sheet]').getBoundingClientRect().top;
      return ['Show route'].filter(label => {
        const control = document.querySelector(`[aria-label="${label}"]`)?.getBoundingClientRect();
        return !control || control.bottom > sheetTop;
      });
    });
    assert.deepEqual(covered, [], `route tools must clear the plan sheet at ${size.width}x${size.height}`);
    await phone.screenshot({ path: `${out}/mobile-tools-${size.width}x${size.height}.png` });
    await phone.close();
  }
  await mobile.getByRole('button', { name: /Search rivers and access points, currently/ }).tap();
  const mobileSearch = mobile.getByRole('combobox', { name: 'Search rivers and access points', exact: true });
  await mobileSearch.fill('take');
  await mobileSearch.evaluate(el => el.blur());
  assert.equal(await mobileSearch.getAttribute('aria-expanded'), 'true');
  await mobile.getByRole('dialog', { name: 'Search rivers and access points', exact: true }).locator('[tabindex="-1"]').tap({ position: { x: 4, y: 4 } });
  assert.equal(await mobileSearch.getAttribute('aria-expanded'), 'true');
  await mobile.getByRole('option', { name: /Current Take-out/ }).tap();
  await mobile.locator('[data-endpoint-card="p-0-1"] button[aria-expanded="true"]').waitFor();
  const mobileSelectionVisible = () => mobile.waitForFunction(() => {
    const ring = document.querySelector('[data-selected-place-id]')?.getBoundingClientRect();
    const preview = document.querySelector('[aria-label="Selected access point"]')?.getBoundingClientRect();
    const sheet = document.querySelector('[data-plan-sheet]')?.getBoundingClientRect();
    const bottom = preview?.top ?? sheet?.top ?? innerHeight;
    return !window.plannerMap.isMoving() && ring && ring.left > 0 && ring.right < innerWidth - 44
      && ring.top > 120 && ring.bottom < bottom - 8;
  });
  await mobileSelectionVisible();
  await mobile.screenshot({ path: `${out}/mobile-selected-takeout.png` });
  await mobile.getByRole('button', { name: 'Show route', exact: true }).tap();
  await endpointsVisible(mobile, true);
  await mobile.screenshot({ path: `${out}/mobile-completed-route.png` });
  await mobile.getByRole('button', { name: 'Expand map', exact: true }).tap();
  await endpointsVisible(mobile, true);
  await mobile.getByRole('button', { name: /Search rivers and access points, currently/ }).tap();
  await mobileSearch.fill('put');
  await mobile.getByRole('option', { name: /Current Put-in/ }).tap();
  await mobile.locator('[data-endpoint-card="p-0-0"] button[aria-expanded="true"]').waitFor();
  await mobile.getByRole('button', { name: 'Show route', exact: true }).tap();
  await endpointsVisible(mobile, true);
  assert.equal(new URL(mobile.url()).searchParams.get('takeOut'), 'p-0-1', 'Replacing the start with itself preserves the finish');
  await mobile.getByRole('button', { name: 'Collapse map', exact: true }).tap();
  await mobile.getByRole('button', { name: /Search rivers and access points, currently/ }).tap();
  await mobileSearch.fill('meramec');
  await mobile.getByRole('option', { name: /^Meramec River\b/ }).tap();
  await mobile.getByRole('button', { name: 'Undo route change', exact: true }).tap();
  await endpointsVisible(mobile, true);
  assert(await mobile.evaluate(() => window.plannerMap === window.firstMobilePlannerMap), 'Mobile keeps one map across river changes and Undo');
  await mobile.getByRole('button', { name: /Search rivers and access points, currently/ }).tap();
  await mobileSearch.fill('alternative');
  await mobile.getByRole('option', { name: /Current Alternative/ }).tap();
  await mobile.getByRole('button', { name: 'Replace take-out', exact: true }).waitFor();
  assert.equal(new URL(mobile.url()).searchParams.get('putIn'), 'p-0-0');
  assert.equal(new URL(mobile.url()).searchParams.get('takeOut'), 'p-0-1');
  await mobile.locator('[data-selected-place-id="p-0-3"]').waitFor();
  await mobileSelectionVisible();
  await mobile.screenshot({ path: `${out}/mobile-third-place.png` });
  await mobile.getByRole('button', { name: 'Close access details', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Show route', exact: true }).tap();
  await endpointsVisible(mobile, true);
  await mobile.screenshot({ path: `${out}/mobile-restored-route.png` });
  console.log('Mobile details-first planning, persistent search results, zoom controls, fullscreen, route fit and Undo passed');
  }
  nationalFixture = true;
  await runNationalGaugeChecks({ browser, origin, out, routeHandler, accessPoints: points[0] });
  assert.deepEqual(errors, []);
  console.log('Desktop/mobile map and national gauge checks passed');
} catch (error) {
  console.error(error);
  console.error(log.slice(-4500));
  console.error('Browser errors:', errors);
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) {
    console.error('Map diagnostics', await page.evaluate(() => ({
      zoom: window.plannerMap?.getZoom(), moving: window.plannerMap?.isMoving(),
      center: window.plannerMap?.getCenter().toArray(), url: location.href,
      sameMap: window.plannerMap === window.firstPlannerMap,
      focus: document.activeElement?.tagName,
      placeControls: [...document.querySelectorAll('[data-planner-marker]')].map(el => ({ key: el.dataset.plannerMarker, id: el.dataset.accessPointId, mobile: !!el.closest('[class~="lg:hidden"]'), visible: el.checkVisibility() })),
      options: Array.from(document.querySelectorAll('[role="option"]')).map(el => ({ text: el.textContent, selected: el.getAttribute('aria-selected') })),
      popup: document.querySelector('.planner-place-popup')?.getBoundingClientRect().toJSON(),
      panel: document.querySelector('.planner-panel')?.getBoundingClientRect().toJSON(),
    })).catch(() => null));
    await page.screenshot({ path: `${out}/failure.png`, timeout: 10000 }).catch(() => {});
    console.error('Control diagnostics', await page.evaluate(() => Array.from(document.querySelectorAll('.maplibregl-ctrl-top-right, .eddy-map-tools')).map(el => ({
      className: el.className, rect: el.getBoundingClientRect().toJSON(), position: getComputedStyle(el).position,
      buttons: el.querySelectorAll('button').length,
    }))).catch(() => []));
  }
  throw error;
} finally {
  await cleanup();
}
