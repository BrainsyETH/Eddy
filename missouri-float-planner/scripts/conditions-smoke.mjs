// Real Conditions components with local fixtures; no provider credentials.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const port = 3146;
const origin = `http://127.0.0.1:${port}`;
const root = '/conditions-layout-check';
const route = resolve(`src/app${root}`);
const out = process.env.CONDITIONS_SMOKE_OUTPUT || '/tmp/eddy-conditions';
const now = Date.now();
const at = new Date(now - 600000).toISOString();
const remoteImageFixture = await readFile('public/icons/eddy-wave.png');
const names = [
  ['current', 'Current River', 'MO'], ['buffalo', 'Buffalo River', 'AR'], ['meramec', 'Meramec River', 'MO'],
  ['huzzah', 'Huzzah Creek', 'MO'], ['courtois', 'Courtois Creek', 'MO'], ['jacks-fork', 'Jacks Fork', 'MO'],
  ['niangua', 'Niangua River', 'MO'], ['taneycomo', 'Lake Taneycomo', 'MO'], ['white', 'White River', 'AR'],
];
const rivers = names.map(([slug, name, state]) => ({ id: slug, slug, name, state,
  path: `${root}/detail?river=${slug}`, lengthMiles: 100, description: null, difficultyRating: 'Class I', region: 'Ozarks', riverType: 'spring_fed_float', accessPointCount: 5,
  currentCondition: { code: 'good', label: 'Good', thresholdUnit: 'cfs', dischargeCfs: 400, gaugeHeightFt: 3, readingAgeHours: .2, trend: null },
}));
const gauges = rivers.map((r, i) => ({ id: `g-${i}`, usgsSiteId: `0706700${i}`, name: `${r.name} gauge`, active: true,
  coordinates: { lat: 37.2 + i * .1, lng: -91.5 }, gaugeHeightFt: 3, dischargeCfs: 400,
  readingTimestamp: at, readingAgeHours: .2, readingSuspect: false, qualifierNote: null,
  thresholds: [{ riverId: r.id, riverName: r.name, riverSlug: r.slug, isPrimary: true, thresholdUnit: 'cfs', levelTooLow: 50, levelLow: 100, levelOptimalMin: 200, levelOptimalMax: 800, levelHigh: 1000, levelDangerous: 2000 }],
}));
const dams = [
  ['swl-table-rock-dam', 'Table Rock Dam', 'Table Rock Lake', 'MO'],
  ['swl-bull-shoals-dam', 'Bull Shoals Dam', 'Bull Shoals Lake', 'AR'],
  ['ameren-bagnell-dam', 'Bagnell Dam', 'Lake of the Ozarks', 'MO'],
  ['swl-norfork-dam', 'Norfork Dam', 'Norfork Lake', 'AR'],
  ['swl-beaver-dam', 'Beaver Dam', 'Beaver Lake', 'AR'],
  ['swl-greers-ferry-dam', 'Greers Ferry Dam', 'Greers Ferry Lake', 'AR'],
  ['swl-clearwater-dam', 'Clearwater Dam', 'Clearwater Lake', 'MO'],
  ['swt-tenkiller-dam', 'Tenkiller Ferry Dam', 'Tenkiller Ferry Lake', 'OK'],
  ['nwk-stockton-dam', 'Stockton Dam', 'Stockton Lake', 'MO'],
].map(([id, name, lakeName, state], i) => ({ id, name, lakeName, state, lat: 36 + i*.1, lon: -93,
  hasTurbines: true, generating: false, generationFloorCfs: 100,
  metrics: { generationFlow: { value: 20, unit: 'cfs', at, staleness: 'fresh' }, release: { value: 200, unit: 'cfs', at, staleness: 'fresh' } }, schedule: [], sources: ['USACE'],
}));
let server, browser;
let log = '';
async function readyConditions(page) {
  await page.waitForFunction(() => {
    const search = document.querySelector('input[type="search"]');
    return search && !search.disabled;
  });
}
async function cleanup() {
  server?.kill('SIGTERM');
  await browser?.close().catch(() => {});
  await rm(route, { recursive: true, force: true });
  const validator = resolve('.next/dev/types/validator.ts');
  if (existsSync(validator) && (await readFile(validator, 'utf8')).includes('conditions-layout-check')) await rm(validator);
  await rm(resolve('.next/dev/types/app/conditions-layout-check'), { recursive: true, force: true });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });
assert(!existsSync(route), 'Refusing to overwrite an existing fixture route');
try {
  await mkdir(`${route}/dams`, { recursive: true });
  await mkdir(`${route}/detail`, { recursive: true });
  await mkdir(`${route}/fallback`, { recursive: true });
  await mkdir(`${route}/partial`, { recursive: true });
  await mkdir(out, { recursive: true });
  const source = async (kind, entry) => {
    // Reuse the real entry's metadata without importing its database/provider
    // loader into a fixture that intentionally supplies its own observations.
    const pageSource = await readFile(`src/app/${entry}/page.tsx`, 'utf8');
    const metadata = pageSource.match(/export const metadata: Metadata = publicPageMetadata\([\s\S]*?\n\);/);
    assert(metadata, `${entry} metadata shape changed; update the browser fixture`);
    return `import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { publicPageMetadata } from '@/lib/seo';
import ConditionsLayout from '@/components/conditions/ConditionsLayout';
import { conditionsDamCatalogue } from '@/lib/conditions/dam-catalogue';
${metadata[0]}
export default function Page() {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_CONDITIONS_SMOKE !== '1') notFound();
  return <ConditionsLayout rivers={${JSON.stringify(rivers)}} dams={${JSON.stringify(dams)}} renderedAt={Date.now()} defaultKind="${kind}" />;
}`;
  };
  await writeFile(`${route}/page.tsx`, await source('all', 'rivers'));
  await writeFile(`${route}/dams/page.tsx`, await source('dams', 'dams'));
  await writeFile(`${route}/fallback/page.tsx`, (await source('all', 'rivers')).replace(`rivers={${JSON.stringify(rivers)}}`, 'rivers={[]}'));
  await writeFile(`${route}/partial/page.tsx`, (await source('dams', 'dams')).replace(`dams={${JSON.stringify(dams)}}`, `{...conditionsDamCatalogue(${JSON.stringify(dams.filter(dam => dam.id !== 'nwk-stockton-dam'))})}`));
  await writeFile(`${route}/detail/page.tsx`, `import { notFound } from 'next/navigation'; export default function Page() { if (process.env.NODE_ENV !== 'development' || process.env.EDDY_CONDITIONS_SMOKE !== '1') notFound(); return <h1>Fixture detail</h1>; }`);
  assert.equal(spawnSync('git', ['check-ignore', '--quiet', `${route}/page.tsx`]).status, 0);
  server = spawn(process.execPath, ['scripts/conditions-smoke-server.mjs', String(port)], {
    env: { ...process.env, NODE_ENV: 'development', NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=2048', NEXT_TELEMETRY_DISABLED: '1', EDDY_CONDITIONS_SMOKE: '1', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', c => { log += c; process.stdout.write(c); }); server.stderr.on('data', c => { log += c; process.stderr.write(c); });
  for (let i=0; i<150; i++) {
    if (server.exitCode !== null) throw new Error(log.slice(-5000));
    try { const r=await fetch(`${origin}${root}`, { signal: AbortSignal.timeout(2000) }); if(r.ok) break; } catch {}
    if(i===149) throw new Error(log.slice(-5000));
    await new Promise(done => setTimeout(done, 1000));
  }
  for (const [path, canonical] of [[root, '/rivers'], [`${root}/dams`, '/dams']]) {
    const html=await (await fetch(`${origin}${path}`)).text();
    assert(html.includes('Table Rock Dam') && html.includes('Bull Shoals Dam'), 'destinations render before JavaScript');
    assert(html.includes(path === root ? '>Conditions</h1>' : '>Lakes &amp; Dams</h1>'), 'entry keeps its visible heading');
    for (const dam of dams) assert(html.includes(`href="/dams/${dam.id}"`), `${dam.name} link renders before JavaScript`);
    if (path === root) {
      const directory = html.match(/<section aria-label="A–Z directory"[\s\S]*?<\/section>/)?.[0];
      assert(directory, 'full directory renders below previews');
      for (const river of rivers) assert(directory.includes(`href="${river.path}"`), `${river.name} link renders beyond previews`);
    }
    assert(html.includes(`rel="canonical" href="https://eddy.guide${canonical}"`), 'entry keeps its canonical');
  }
  browser=await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, headless:true, args:['--no-sandbox'] });
  for (const [label,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844],['small',320,720]]) {
    const context=await browser.newContext({ viewport:{width,height}, hasTouch:width<900, geolocation:{latitude:36,longitude:-93}, permissions:['geolocation'] });
    const page=await context.newPage();
    page.setDefaultNavigationTimeout(90000);
    const errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    await page.route('**/*', route => {
      const url=new URL(route.request().url());
      if(url.origin!==origin) return route.abort();
      // Next's image proxy is same-origin but can still fetch a remote CDN on
      // the server. Keep those requests local too, including the header logo.
      if(url.pathname==='/_next/image' && /^https?:/.test(url.searchParams.get('url') ?? '')) {
        return route.fulfill({contentType:'image/png',body:remoteImageFixture});
      }
      if(url.pathname==='/api/rivers') return route.fulfill({json:{rivers}});
      if(url.pathname==='/api/gauges') return route.fulfill({json:{gauges}});
      if(url.pathname==='/api/dams') return route.fulfill({json:{dams}});
      if(url.pathname==='/api/eddy-updates') return route.fulfill({json:{updates:{}}});
      if(url.pathname.startsWith('/api/')) return route.fulfill({json:{entries:[],history:[],data:[]}});
      return route.continue();
    });
    await page.goto(`${origin}${root}`, {waitUntil:'networkidle'});
    await readyConditions(page);
    const search=page.getByRole('searchbox', {name:'Search rivers, lakes, or dams'});
    assert.equal(await page.getByRole('group',{name:'Destination type'}).getByRole('button',{name:'All',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await page.getByRole('button',{name:'Floatable now',exact:true}).count(),0);
    assert.equal(await page.getByRole('region',{name:'A–Z directory'}).getByRole('link').count(), rivers.length + dams.length);
    const featured=page.getByRole('region',{name:'Featured destinations'});
    assert.equal(await featured.locator('[data-destination]').count(),4);
    assert.equal(await page.locator('[aria-label="Rivers preview"] [data-destination]:visible').count(),width<768?3:6);
    assert.equal(await page.locator('[aria-label="Lakes & Dams preview"] [data-destination]:visible').count(),width<768?3:6);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label}: no horizontal overflow`);
    await page.addStyleTag({content:'nextjs-portal { display:none; }'});
    await page.screenshot({path:`${out}/${label}-all.png`,fullPage:true});
    let searches=0;
    const requests=request=>{if(request.url().includes('/api/')||request.headers().rsc==='1') searches++;};
    page.on('request',requests);
    await search.fill('Lake of the Ozarks');
    await page.waitForFunction(()=>document.querySelectorAll('[data-result]').length===1);
    assert.equal(await page.locator('[data-result]').getAttribute('data-result'),'dam:ameren-bagnell-dam');
    assert.equal(await page.getByLabel('Sort destinations').inputValue(),'relevance');
    await search.fill('Taneycomo');
    await page.waitForFunction(()=>document.querySelectorAll('[data-result]').length===2);
    assert.deepEqual(await page.locator('[data-result]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-result'))),['river:taneycomo','dam:swl-table-rock-dam']);
    assert(await page.getByText('Releases into Lake Taneycomo',{exact:true}).isVisible());
    await search.fill('No matching river here');
    await page.getByText('No matching destinations.',{exact:true}).waitFor();
    assert.equal(searches,0,`${label}: typing makes no API or RSC request`);
    page.off('request',requests);
    await page.getByRole('button',{name:'Clear search',exact:true}).click();
    await page.getByLabel('Filter by state').selectOption('OK');
    assert.equal(await page.locator('[aria-label="Rivers preview"]').count(),0);
    assert.equal(await page.getByText(/No rivers/).count(),0);
    await page.getByRole('group',{name:'Destination type'}).getByRole('button',{name:'Rivers',exact:true}).click();
    await page.getByText('Oklahoma filter cleared.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Filter by state').inputValue(),'all');
    await page.goBack();
    await page.waitForFunction(()=>document.querySelector('select[aria-label="Filter by state"]')?.value==='OK');
    assert.equal(await page.getByText('Oklahoma filter cleared.',{exact:true}).count(),0);
    await page.goForward();
    await page.waitForFunction(()=>document.querySelector('select[aria-label="Filter by state"]')?.value==='all');
    await page.goBack();
    await page.waitForFunction(()=>document.querySelector('select[aria-label="Filter by state"]')?.value==='OK');
    await page.reload({waitUntil:'networkidle'});
    await readyConditions(page);
    assert.equal(await page.getByLabel('Filter by state').inputValue(),'OK');
    await page.goto(`${origin}${root}?condition=good&type=spring_fed_float&diff=beginner`,{waitUntil:'networkidle'});
    await readyConditions(page);
    assert.equal(await page.getByRole('group',{name:'Destination type'}).getByRole('button',{name:'Rivers',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await page.getByLabel('Filter by difficulty').inputValue(),'beginner');
    await page.goto(`${origin}${root}/dams?kind=dams&diff=advanced`,{waitUntil:'networkidle'});
    await readyConditions(page);
    assert.equal(await page.getByLabel('Filter by difficulty').count(),0);
    assert.equal(await page.locator('[data-result]').count(),dams.length);
    await page.addStyleTag({content:'nextjs-portal { display:none; }'});
    await page.screenshot({path:`${out}/${label}-dams.png`,fullPage:true});
    await page.getByRole('group',{name:'Destination type'}).getByRole('button',{name:'All',exact:true}).click();
    await page.getByLabel('Sort destinations').selectOption('name');
    assert.equal(await page.getByRole('region',{name:'Featured destinations'}).count(),0);
    const first=await page.locator('[data-result]').first().getAttribute('data-result');
    await search.fill('Bull Shoals');
    await page.getByRole('button',{name:'Clear search',exact:true}).click();
    assert.equal(await page.getByLabel('Sort destinations').inputValue(),'name');
    assert.equal(await page.locator('[data-result]').first().getAttribute('data-result'),first);
    await page.getByLabel('Sort destinations').selectOption('nearest');
    await page.waitForFunction(()=>document.querySelector('[data-result]')?.getAttribute('data-result')==='dam:swl-table-rock-dam');
    assert(!new URL(page.url()).searchParams.has('lat'));
    await page.goto(`${origin}${root}?kind=all&state=AR`, {waitUntil:'networkidle'});
    await readyConditions(page);
    const beforeShowAll=page.url().split('?')[0];
    await page.getByRole('button',{name:'Show all lakes & dams',exact:true}).click();
    assert.equal(page.url().split('?')[0],beforeShowAll);
    assert.equal(await page.getByLabel('Filter by state').inputValue(),'AR');
    assert(await search.evaluate(el=>el===document.activeElement));
    await search.fill('Bull Shoals');
    await page.keyboard.press('Escape');
    assert.equal(await search.inputValue(),'');
    if (label==='desktop') {
      let damRequests = 0;
      const countDamRequests = request => { if (new URL(request.url()).pathname === '/api/dams') damRequests++; };
      page.on('request', countDamRequests);
      await page.goto(`${origin}${root}/partial`,{waitUntil:'networkidle'});
      await readyConditions(page);
      assert.equal(damRequests, 0, 'partial stored readings do not trigger an immediate catalogue refresh');
      assert.equal(await page.getByText('Loading latest dam readings…',{exact:true}).count(), 0);
      const missing = page.getByRole('link').filter({has:page.getByRole('heading',{name:'Stockton Dam',exact:true})});
      assert(await missing.getByText('Current generation unavailable',{exact:true}).isVisible());
      page.off('request', countDamRequests);
      await page.goto(`${origin}${root}/fallback`,{waitUntil:'networkidle'});
      await readyConditions(page);
      await page.getByRole('heading',{name:'Current River',exact:true}).waitFor();
      await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Current River',exact:true})}).click();
      await page.getByRole('heading',{name:'Fixture detail',exact:true}).waitFor();
      await page.goBack({waitUntil:'networkidle'});
      await search.waitFor();
      await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(_success,error)=>error({code:1})}}));
      await page.getByLabel('Sort destinations').selectOption('nearest');
      await page.getByText('Location unavailable. Showing featured order.',{exact:false}).waitFor();
      assert.equal(await page.locator('[data-result]').first().getAttribute('data-result'),'dam:swl-table-rock-dam');
    }
    assert.deepEqual(errors,[],`${label}: no runtime errors`);
    console.log(`PASS ${label}: search, ranking, filters, history, entry URLs, sorts and layout`);
    await context.close();
  }
} catch (error) {
  console.error(log.slice(-5000));
  throw error;
} finally { await cleanup(); }
