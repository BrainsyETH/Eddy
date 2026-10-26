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
    imageUrls: [],
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
    pois: [],
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
  await ssrPage.goto(`${origin}/planner-map-layout-check/ssr`, { waitUntil: 'domcontentloaded' });
  assert(await ssrPage.getByRole('combobox', { name: 'Search rivers and access points' }).isVisible());
  await ssrPage.setViewportSize({ width: 390, height: 844 });
  assert.equal(await ssrPage.getByRole('combobox', { name: 'Search rivers and access points' }).isVisible(), false);
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
    delayAccess = false;
  await page.route('**/*', async route => {
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
      gauges: []
    };else if (path.startsWith('/api/weather')) result = null;else if (path.startsWith('/api/conditions/')) result = {
      condition
    };else if (path === '/api/plan') result = {
      plan: null
    };else for (let i = 0; i < riverMeta.length; i++) {
      const r = riverMeta[i];
      if (path === `/api/rivers/${r.slug}`) result = {
        river: {
          ...r,
          geometry: geometry[i],
          bounds: bbox(geometry[i])
        }
      };
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
  });
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
  const panel = page.locator('.pointer-events-none.absolute.top-20');
  await panel.evaluate(el => { el.style.width = '400px'; });
  await page.waitForFunction(coordinates => {
    const map = window.plannerMap;
    const canvas = map.getCanvas().getBoundingClientRect();
    const panel = document.querySelector('.pointer-events-none.absolute.top-20').getBoundingClientRect();
    const point = map.project([coordinates.lng, coordinates.lat]);
    return !map.isMoving() && Math.abs(point.x - (canvas.width + panel.right - canvas.left) / 2) < 2;
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
  console.log('Access and condition layers survive a basemap change');
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
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('putIn')), null);
  await page.getByRole('button', {
    name: 'Use as put-in',
    exact: true
  }).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get('putIn') === 'p-1-0');
  console.log('Cross-river selection clears old endpoints and waits for eligible details');
  await page.waitForFunction(() => !window.plannerMap.isMoving());
  await page.setViewportSize({
    width: 1024,
    height: 768
  });
  await page.screenshot({
    path: `${out}/desktop-1024.png`
  });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
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
  await page.getByRole('button', {
    name: 'All rivers',
    exact: true
  }).click();
  await page.waitForFunction(() => window.plannerMap?.getLayer('planner-access-dots') && window.plannerMap.isSourceLoaded('planner-access-catalog'));
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
  assert.deepEqual(errors, []);
  console.log('Desktop 1440/1024, mobile and runtime checks passed');
} catch (error) {
  console.error(log.slice(-4500));
  console.error('Browser errors:', errors);
  throw error;
} finally {
  await cleanup();
}
