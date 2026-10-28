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
const originalImages = new Map();
if (process.env.CONDITIONS_SMOKE_IMAGES) {
  for (const key of ['canoe', 'green', 'red', 'yellow', 'flood']) originalImages.set(key, await readFile(resolve(process.env.CONDITIONS_SMOKE_IMAGES, `${key}.png`)));
}
const historyReadings = Array.from({length:57}, (_,i) => ({timestamp:new Date(now-(56-i)*6*3600000).toISOString(),dischargeCfs:250+i*2+Math.sin(i/5)*90,gaugeHeightFt:2.5+i*.01}));
const scheduleDates = [now, now+86400000].map(value => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(value));
const names = [
  ['current', 'Current River', 'MO'], ['buffalo', 'Buffalo River', 'AR'], ['meramec', 'Meramec River', 'MO'],
  ['huzzah', 'Huzzah Creek', 'MO'], ['courtois', 'Courtois Creek', 'MO'], ['jacks-fork', 'Jacks Fork', 'MO'],
  ['niangua', 'Niangua River', 'MO'], ['taneycomo', 'Lake Taneycomo', 'MO'], ['white', 'White River', 'AR'],
];
const rivers = names.map(([slug, name, state], i) => ({ id: slug, slug, name, state, primaryGaugeId:`g-${i}`, primaryGaugeSiteId:`0706700${i}`,
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
  hasTurbines: true, generating: true, generationFloorCfs: 100,
  generationReference:{units:8, fullGenerationCfs:20000, schedulingCapacityMw:400, source:'SWPA'},
  metrics: { generationFlow: { value: 10000, unit: 'cfs', at, staleness: 'fresh' }, release: { value: 10500, unit: 'cfs', at, staleness: 'fresh' }, tailwaterTempF:{value:52,unit:'F',at,staleness:'fresh'},tailwaterElevation:{value:650.25,unit:'ft',at,staleness:'fresh'} },
  schedule: scheduleDates.map(scheduleDate => ({scheduleDate,retrievedAt:at,idle:[],hours:Array.from({length:24},(_,i)=>({hourEnding:i+1,megawatts:i%4<2?200:400,cfs:i%4<2?10000:20000,isRamp:i%2===0}))})), sources: ['USACE','SWPA'],
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
    assert(html.includes('>Conditions</h1>'), 'both entries use the shared Conditions heading');
    assert.equal((html.match(/<section aria-label="Today’s generation schedule"/g) ?? []).length, dams.length, 'today’s schedules render before JavaScript');
    for (const dam of dams) assert(html.includes(`href="/dams/${dam.id}"`), `${dam.name} link renders before JavaScript`);
    if (path === root) {
      const directory = html.match(/<section aria-label="A–Z directory"[\s\S]*?<\/section>/)?.[0];
      assert(directory, 'full directory renders below reports');
      for (const river of rivers) assert(directory.includes(`href="${river.path}"`), `${river.name} link renders before JavaScript`);
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
    await page.route('**/*', async route => {
      const url=new URL(route.request().url());
      if(url.origin!==origin) return route.abort();
      // Exercise the real card links without invoking the production detail
      // loader; serve the local detail fixture at the canonical destination.
      if(url.pathname==='/dams/swl-table-rock-dam') {
        const response=await route.fetch({url:`${origin}${root}/detail${url.search}`});
        return route.fulfill({response});
      }
      // Next's image proxy is same-origin but can still fetch a remote CDN on
      // the server. Keep those requests local too, including the header logo.
      if(url.pathname==='/_next/image' && /^https?:/.test(url.searchParams.get('url') ?? '')) {
        const source=decodeURIComponent(url.searchParams.get('url') ?? '');
        const key=source.includes('canoe')?'canoe':['green','red','yellow','flood'].find(color=>source.includes(`_${color}.png`));
        return route.fulfill({contentType:'image/png',body:originalImages.get(key) ?? remoteImageFixture});
      }
      if(url.pathname==='/api/rivers') return route.fulfill({json:{rivers}});
      if(/^\/api\/gauges\/[^/]+\/history$/.test(url.pathname)) return route.fulfill({json:{siteId:url.pathname.split('/')[3],siteName:'Fixture gauge',readings:historyReadings}});
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
    assert.equal(await page.locator('[data-destination]:visible').count(), rivers.length + dams.length, 'every full card is visible without Show all');
    await page.locator('[data-destination="river:current"]').getByRole('img',{name:/Flow.*trend chart/}).waitFor();
    await page.waitForFunction(count => document.querySelectorAll('[data-destination^="river:"] svg[role="img"]').length === count, rivers.length);
    assert.equal(await page.getByText('Eddy says',{exact:true}).count(), rivers.length);
    assert.equal(await page.getByRole('img',{name:/Flow.*trend chart/}).count(),rivers.length);
    assert.equal(await page.getByRole('img',{name:'Eddy the Otter',exact:true}).count(),rivers.length+1);
    const featuredDam=featured.locator('[data-destination="dam:swl-table-rock-dam"]');
    assert(await featuredDam.getByText('10,500 cfs',{exact:true}).isVisible());
    assert(await featuredDam.getByText('Water temp',{exact:true}).isVisible());
    assert(await featuredDam.getByText('52.0 °F',{exact:true}).isVisible());
    assert.equal(await featuredDam.getByText(/Generating now|of full generation|Below-dam elevation/).count(),0);
    assert.equal(await featuredDam.locator('dt').count(),2,'dam cards show only release and temperature readings');
    assert(await featuredDam.getByText(/(?:Increases|Decreases) at/).isVisible());
    for (const control of [page.getByLabel('Filter by state'),page.getByLabel('Sort destinations')]) {
      const fit=await control.evaluate(select=>{
        const style=getComputedStyle(select);
        const canvas=document.createElement('canvas');
        const context=canvas.getContext('2d');
        context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return {text:context.measureText(select.selectedOptions[0].text).width,available:select.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)};
      });
      assert(fit.text<=fit.available,`${label}: selected filter label fits without crowding the arrow`);
    }
    await page.addStyleTag({content:'nextjs-portal { display:none; }'});
    await page.screenshot({path:`${out}/${label}-top.png`});
    const schedules=page.getByRole('region',{name:'Today’s generation schedule',exact:true});
    assert.equal(await schedules.count(),dams.length);
    assert.equal(await schedules.getByRole('img').count(),dams.length,'one visible timeline per dam, even with two days available');
    assert.equal(await schedules.locator('details,[role="tab"]').count(),0,'today is visible without a disclosure or day selector');
    const schedule=featuredDam.getByRole('region',{name:'Today’s generation schedule',exact:true});
    const timeline=schedule.getByRole('img');
    assert(await featuredDam.locator('.bg-secondary-100').count(), 'directory uses the warm reading panel');
    assert(await schedule.locator('[data-peak-window]').count(), 'directory shares peak highlighting');
    assert.equal(await timeline.evaluate(node=>node.closest('a')),null,'chart interaction is separate from navigation');
    const beforeTimeline=page.url();
    await timeline.scrollIntoViewIfNeeded();
    const bounds=await timeline.boundingBox();
    assert(bounds && bounds.height>=44);
    const hourPosition={x:bounds.width*1.5/24,y:bounds.height/2};
    if(width<900) await timeline.tap({position:hourPosition});
    else await timeline.hover({position:hourPosition});
    await schedule.getByText('1 AM–2 AM · ~10,000 cfs scheduled',{exact:true}).waitFor();
    assert.equal(page.url(),beforeTimeline,'hover or tap does not navigate');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label}: hourly readout fits`);
    await page.addStyleTag({content:'nextjs-portal { display:none; }'});
    await featuredDam.screenshot({path:`${out}/${label}-dam-hour.png`});
    assert((await featuredDam.boundingBox()).height<550,`${label}: dam card stays compact with an hourly readout`);
    // Reset pointer inspection explicitly. Compact cards no longer need to
    // scroll when the report link receives focus, so hover can otherwise stay.
    await page.mouse.move(0,0);
    await timeline.focus();
    await featuredDam.getByRole('link',{name:'Full report for Table Rock Dam',exact:true}).focus();
    await timeline.focus();
    await timeline.press('ArrowRight');
    await schedule.getByText('12 AM–1 AM · 200 megawatts scheduled',{exact:true}).waitFor();
    await timeline.press('ArrowRight');
    await schedule.getByText('1 AM–2 AM · ~10,000 cfs scheduled',{exact:true}).waitFor();
    assert.equal(page.url(),beforeTimeline,'keyboard exploration does not navigate');
    await timeline.press('Tab');
    assert.equal(await featuredDam.getByRole('link',{name:'Full report for Table Rock Dam',exact:true}).evaluate(node=>node===document.activeElement),true,'keyboard focus moves from the chart to Full report');
    await page.mouse.move(0,0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label}: no horizontal overflow`);
    await page.addStyleTag({content:'nextjs-portal { display:none; }'});
    await page.screenshot({path:`${out}/${label}-all.png`,fullPage:true});
    await featured.screenshot({path:`${out}/${label}-featured.png`});
    let searches=0;
    const requests=request=>{if(request.url().includes('/api/')||request.headers().rsc==='1') searches++;};
    page.on('request',requests);
    await search.fill('Lake of the Ozarks');
    await page.waitForFunction(()=>document.querySelectorAll('[data-result]').length===1);
    assert.equal(await page.locator('[data-result]').getAttribute('data-result'),'dam:ameren-bagnell-dam');
    assert.equal(await page.getByLabel('Sort destinations').inputValue(),'relevance');
    assert(await page.locator('[data-result]').getByText('Water temp',{exact:true}).isVisible(), 'search retains dam detail');
    assert(await page.locator('[data-result]').getByText(/(?:Increases|Decreases) at/).isVisible());
    assert(await page.locator('[data-result]').getByRole('region',{name:'Today’s generation schedule',exact:true}).getByRole('img').isVisible(),'search retains the hourly dam timeline');
    await search.fill('Current River');
    await page.locator('[data-result="river:current"]').getByRole('img',{name:/Flow.*trend chart/}).waitFor();
    assert(await page.getByText('Eddy says',{exact:true}).isVisible(), 'search retains Eddy and the river chart');
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
    assert.equal(await page.getByRole('region',{name:'Rivers',exact:true}).count(),0);
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
    assert(await page.getByRole('heading',{name:'Conditions',exact:true,level:1}).isVisible());
    assert.equal(await schedules.getByRole('img').count(),dams.length,'the dams entry retains hourly timelines');
    await page.addStyleTag({content:'nextjs-portal { display:none; }'});
    await page.screenshot({path:`${out}/${label}-dams.png`,fullPage:true});
    await page.getByRole('group',{name:'Destination type'}).getByRole('button',{name:'All',exact:true}).click();
    assert(await page.getByRole('heading',{name:'Conditions',exact:true,level:1}).isVisible(),'switching to All on /dams keeps the shared heading');
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
    const beforeCategory=page.url().split('?')[0];
    await page.getByRole('group',{name:'Destination type'}).getByRole('button',{name:'Lakes & Dams',exact:true}).click();
    assert.equal(page.url().split('?')[0],beforeCategory);
    assert.equal(await page.getByLabel('Filter by state').inputValue(),'AR');
    await search.fill('Bull Shoals');
    await page.keyboard.press('Escape');
    assert.equal(await search.inputValue(),'');
    if (label==='desktop') {
      await page.getByLabel('Filter by state').selectOption('MO');
      await search.fill('Table Rock');
      for (const name of ['Table Rock Dam Table Rock Lake','Full report for Table Rock Dam']) {
        await page.locator('[data-result="dam:swl-table-rock-dam"]').getByRole('link',{name,exact:true}).click();
        await page.getByRole('heading',{name:'Fixture detail',exact:true}).waitFor();
        assert.equal(new URL(page.url()).pathname,'/dams/swl-table-rock-dam');
        await page.goBack({waitUntil:'networkidle'});
        await readyConditions(page);
        assert.equal(await search.inputValue(),'Table Rock','returning from the report preserves search');
        assert.equal(await page.getByLabel('Filter by state').inputValue(),'MO');
      }
      let damRequests = 0;
      const countDamRequests = request => { if (new URL(request.url()).pathname === '/api/dams') damRequests++; };
      page.on('request', countDamRequests);
      await page.goto(`${origin}${root}/partial`,{waitUntil:'networkidle'});
      await readyConditions(page);
      assert.equal(damRequests, 0, 'partial stored readings do not trigger an immediate catalogue refresh');
      assert.equal(await page.getByText('Loading latest dam readings…',{exact:true}).count(), 0);
      const missing = page.locator('[data-result="dam:nwk-stockton-dam"]');
      assert.equal(await missing.getByText('Unavailable',{exact:true}).count(),2);
      assert(await missing.getByText('Today’s generation schedule is unavailable.',{exact:true}).isVisible());
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
    console.log(`PASS ${label}: full reports, today’s timelines, hourly interaction, search, filters, history, entry URLs, sorts and layout`);
    await context.close();
  }
} catch (error) {
  console.error(log.slice(-5000));
  throw error;
} finally { await cleanup(); }
