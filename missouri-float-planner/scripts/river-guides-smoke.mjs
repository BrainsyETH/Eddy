// Real guide components and reviewed content, with captured public endpoint and
// geometry fixtures. No production credentials, water-provider calls or writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const port = 3143, origin = `http://127.0.0.1:${port}`;
const fixture = resolve('src/app/guides-layout-check');
const out = process.env.GUIDE_SMOKE_OUTPUT || '/tmp/eddy-guides-preview';
let server, browser, serverLog = '';
async function cleanup() {
  await browser?.close(); server?.kill('SIGTERM');
  await rm(fixture, { recursive: true, force: true });
  await rm(resolve('.next/dev/types/app/guides-layout-check'), { recursive: true, force: true });
  const validator = resolve('.next/dev/types/validator.ts');
  if (existsSync(validator) && (await readFile(validator, 'utf8')).includes('/guides-layout-check/')) await rm(validator);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(1)); });
assert(!existsSync(fixture), 'Refusing to overwrite an existing fixture');
try {
  await mkdir(fixture, { recursive: true }); await mkdir(out, { recursive: true });
  await writeFile(`${fixture}/page.tsx`, `import { notFound } from 'next/navigation';
import { reviewedRiverGuides } from '../../../scripts/content/river-guides/reviewed';
import accesses from '../../../scripts/fixtures/guide-accesses.json';
import lines from '../../../scripts/fixtures/guide-overview-current.json';
import { RiverGuideView } from '@/components/blog/RiverGuideLayout';
import GuideDirectory from '@/components/blog/GuideDirectory';
import { researchEntries } from '@/components/blog/ResearchEntries';
import { guideOverview } from '@/lib/guides/overview';
import ConditionDaysReport from '@/components/condition-days/ConditionDaysReport';
import { archiveFor, seasonFor } from '@/lib/condition-days/data';
import { DEFAULT_SITE, stations, summarize, seasonHistory } from '@/lib/condition-days/study';
import { resolveGuideHero } from '@/lib/photos/guides';
import { guideDam } from '@/lib/guides/dam';
export default async function Page({ searchParams }: { searchParams: Promise<{ river?: string; view?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_GUIDE_SMOKE !== '1') notFound();
  const params = await searchParams;
  if (params.view === 'season') {
    const station = stations.find(s => s.site === DEFAULT_SITE)!;
    const today = '2026-11-17';
    const [archive, season] = await Promise.all([archiveFor(station), seasonFor(station.site, null, today)]);
    return <main style={{maxWidth:1000,margin:'auto'}}><ConditionDaysReport station={station}
      thresholds={station.thresholds} summary={summarize(archive, station.thresholds, today)} season={season}
      history={seasonHistory(archive, station.thresholds, season)} today={today} archived compare={null}
      reading={{cfs:47.3,at:'2026-11-18T01:30:00Z',level:'too_low'}}/></main>;
  }
  if (params.view === 'directory') return <main className="mx-auto max-w-5xl p-4"><h1>River guides</h1><GuideDirectory research={researchEntries} entries={reviewedRiverGuides.map(seed => ({ slug: seed.slug, state: seed.slug.endsWith('arkansas') ? 'AR' : 'MO', search: seed.title + ' ' + seed.description, card: <article><a href={'/blog/' + seed.slug}>{seed.title}</a></article> }))} /></main>;
  const seed = reviewedRiverGuides.find(seed => seed.river_slug === (params.river || 'current'));
  if (!seed) notFound();
  const aps = new Map(accesses.filter(a => a.river_slug === seed.river_slug).map(a => [a.slug, { id: a.id, riverId: a.river_id, imageUrl: null, npsImageUrl: null, endpoint: a.is_float_endpoint !== false, mile: Number(a.river_mile_downstream) }]));
  const map = seed.river_slug === 'current' ? guideOverview(lines.map(line => { const s=seed.guide_data.sections.find(s=>s.id===line.id)!; return {...line, number:line.id, label:s.from+' → '+s.to,miles:s.miles}; })) : [];
  const post = { ...seed, id: 'fixture', category: 'River Guides', published_at: '2026-10-01T00:00:00Z', meta_keywords: null, og_image_url: seed.og_image_url ?? null, guide_data: { ...seed.guide_data, related_rivers: [], hero: resolveGuideHero(seed, seed.guide_data.hero) } };
  return <><p className="bg-secondary-100 px-4 py-2 text-sm">Preview: reviewed copy; captured route geometry. Live conditions are not loaded.</p><RiverGuideView post={post} aps={aps} riverMeta={{ state: seed.slug.endsWith('arkansas') ? 'AR' : 'MO', name: seed.guide_data.hero.title_top }} directory={null} overview={map} dam={guideDam(seed.river_slug)} /></>;
}
`);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, EDDY_GUIDE_SMOKE: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only', SUPABASE_SERVICE_ROLE_KEY: '', FLOAT_SEARCH_ENABLED: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', d => { serverLog += d; }); server.stderr.on('data', d => { serverLog += d; });
  console.log('Starting guide preview');
  let ready = false;
  for (const deadline = Date.now() + 240000; Date.now() < deadline;) {
    if (server.exitCode !== null) throw Error(serverLog.slice(-5000));
    try { if ((await fetch(`${origin}/guides-layout-check`, { signal: AbortSignal.timeout(30000) })).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  assert(ready, serverLog.slice(-5000));
  if (process.env.GUIDE_SMOKE_EXPORT_ONLY === '1') {
    for (const river of ['current','black','spring-river-mo','elk','gasconade']) {
      const html = await fetch(`${origin}/guides-layout-check?river=${river}`).then(r=>r.text());
      await writeFile(`${out}/${river}.html`,html);
      for (const path of [...html.matchAll(/(?:href|src)="(\/_next\/[^"?]+)(?:\?[^"]*)?"/g)].map(m=>m[1])) {
        if(!path.endsWith('.css'))continue;
        const css=await fetch(origin+path).then(r=>r.text());
        await writeFile(`${out}/styles.css`,css);
      }
    }
    console.log('Rendered HTML exported to '+out);
  } else {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  const errors = [];
  for (const [name, width, height] of [['desktop',1440,1000],['mobile',390,844],['small',320,720]]) {
    const page = await browser.newPage({ viewport:{width,height}, hasTouch:width<900, reducedMotion:'reduce' });
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/embed/**', route => route.fulfill({contentType:'text/html',body:'<p style="font:14px sans-serif;color:#555">Preview: live conditions not loaded.</p>'}));
    let estimates = 0, mode = 'current';
    await page.route('**/api/plan?**', route => {
      estimates++;
      if(mode==='error')return route.fulfill({status:503,body:'unavailable'});
      return route.fulfill({json:{plan:{floatTime:mode==='dangerous'?null:{formatted:'3–4 hours',basis:'trip'},vessel:{name:'Canoe'},condition:{availability:{readingStatus:mode==='stale'?'stale':'current'}},floatTimeWithheldReason:mode==='dangerous'?'dangerous':null}}});
    });
    await page.goto(`${origin}/guides-layout-check`, {waitUntil:'networkidle'});
    await page.screenshot({path:`${out}/current-${name}-hero.png`});
    assert.equal(await page.locator('h1').count(),1);
    // Two per route card, plus the plan button in the overview map for the selected float.
    assert.equal(await page.locator('a[href^="/plan?river=current&putIn="]').count(),13);
    assert.equal(await page.locator('[data-guide-map] a[data-ga-event="guide_planner_click"]').count(),1);
    assert.equal(estimates,0,'Reading a guide must not calculate routes');
    await page.getByRole('button',{name:'Show Cedar Grove → Akers Ferry',exact:true}).click();
    await page.getByRole('link',{name:'Read about Cedar Grove → Akers Ferry ↓'}).waitFor();
    assert.match(await page.locator('[data-guide-map] a[data-ga-event="guide_planner_click"]').textContent(),/Plan Cedar Grove → Akers Ferry/);
    const overview = page.getByRole('region',{name:'Current River featured route overview'});
    await overview.scrollIntoViewIfNeeded(); await overview.screenshot({path:`${out}/current-${name}-routes.png`});
    const estimate = page.getByRole('button',{name:'Today’s float time'}).first();
    await estimate.click(); await page.getByText('3–4 hours',{exact:true}).waitFor(); await page.getByText('Includes typical stops',{exact:true}).first().waitFor();
    await page.locator('[data-guide-section-card]').filter({has:page.getByText('3–4 hours',{exact:true})}).screenshot({path:`${out}/current-${name}-estimate.png`});
    mode='dangerous'; await page.getByRole('button',{name:'Check again'}).first().click();
    await page.getByText('The planner is withholding a time',{exact:false}).waitFor();
    mode='stale'; await page.getByRole('button',{name:'Check again'}).first().click();
    await page.getByText('Current water data is unavailable',{exact:false}).waitFor();
    mode='error'; await page.getByRole('button',{name:'Check again'}).first().click();
    await page.getByText('Couldn’t load the estimate',{exact:false}).waitFor();
    await page.locator('#guide-float-2').screenshot({path:`${out}/current-${name}-card.png`});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} Current overflow`);
    for (const river of ['black','spring-river-mo','elk','gasconade']) {
      await page.goto(`${origin}/guides-layout-check?river=${river}`,{waitUntil:'networkidle'});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} ${river} overflow`);
      if(['elk','spring-river-mo'].includes(river))assert.equal(await page.locator('[data-guide-section-card]').count(),0);
      assert.equal(await page.locator('#outfitters').count(),0);
      // Only the Black is below a dam here, and Clearwater has no schedule to embed.
      assert.equal(await page.locator('#dam').count(),river==='black'?1:0,`${river} dam section`);
      if(river==='black'){assert.equal(await page.locator('a[href="/dams/swl-clearwater-dam"]').count(),1);assert.equal(await page.locator('iframe[src^="/embed/dam/"]').count(),0);}
      assert.equal(await page.locator('a[href="#outfitters"]').count(),0);
      if(name==='mobile')await page.screenshot({path:`${out}/${river}-mobile.png`});
    }
    // A dam with a powerhouse draws its live schedule in the guide.
    await page.goto(`${origin}/guides-layout-check?river=white`,{waitUntil:'networkidle'});
    assert.equal(await page.locator('iframe[src^="/embed/dam/swl-bull-shoals-dam"]').count(),1);
    assert.equal(await page.locator('a[href="/dams/swl-bull-shoals-dam"]').count(),1);
    // The release leads on a hydro tailwater: above the route cards, not under the gauge.
    assert.equal(await page.evaluate(()=>Boolean(document.querySelector('#dam').compareDocumentPosition(document.querySelector('#different'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
    assert.equal(await page.getByText('does not rate it good, low or too high',{exact:false}).count(),1);
    // The dam card is the only reading at the top: no river card repeating the release as a gauge.
    assert.equal(await page.locator('#today').count(),0);
    assert.equal(await page.locator('iframe[src^="/embed/eddy-quote/"]').count(),0);
    assert.equal(await page.getByText('it tells you what left the dam',{exact:false}).count(),1);
    assert.equal(await page.locator('a[href="#today"]').count(),0);
    assert.equal(await page.getByRole('link',{name:'Put this schedule on your site →'}).count(),1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} white overflow`);
    if(name==='mobile')await page.screenshot({path:`${out}/white-mobile.png`,fullPage:true});
    await page.goto(`${origin}/guides-layout-check?view=directory`,{waitUntil:'networkidle'});
    assert.equal(await page.locator('article:visible').count(),28);
    await page.getByRole('searchbox').fill('Spring River');
    assert.equal(await page.locator('article:visible').count(),2);
    await page.getByRole('combobox').selectOption('AR');
    assert.equal(await page.locator('article:visible').count(),1);
    await page.getByRole('searchbox').fill('[');
    assert.equal(await page.locator('article:visible').count(),0);
    await page.getByRole('button',{name:'Clear search and filters'}).click();
    assert.equal(await page.locator('article:visible').count(),28);
    const research = page.getByRole('region', { name: 'Research', exact: true });
    assert.equal(await research.getByRole('link').count(), 2);
    await research.screenshot({path:`${out}/research-${name}.png`});
    await research.getByRole('link', {name: /River Conditions by Month/}).click();
    await page.getByRole('heading', {name: 'River Conditions by Month', exact: true}).waitFor();
    const monthPicker = page.getByRole('combobox', {name: 'Month', exact: true});
    assert.equal(await monthPicker.inputValue(), '5', 'Open on the historical peak at Alley Spring');
    await page.getByText('457 of 600 recorded days · 20 years').waitFor();
    await page.getByRole('combobox', {name: 'Compare stretches'}).selectOption('07066000');
    await page.getByText(/On 16 of 60 shared dates/).waitFor();
    await page.getByText('491 of 600 recorded days · 20 years').waitFor();
    await page.getByRole('button', {name: 'All levels', exact: true}).click();
    await page.getByRole('button', {name: 'Flood', exact: true}).first().click();
    await monthPicker.selectOption('10');
    await page.waitForURL(url => url.searchParams.get('month') === '11');
    await page.reload();
    await page.getByRole('heading', {name: 'Good or Flowing in November'}).waitFor();
    assert.equal(await monthPicker.inputValue(), '10');
    await page.getByText('Monthly counts · Alley Spring (upper river)', {exact:true}).click();
    await page.getByRole('table', {name:/Recorded days by month and condition at Alley Spring/}).waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), `${name} report overflow`);
    await page.screenshot({path:`${out}/report-${name}.png`});
    await page.getByRole('combobox', {name:'Weekend month'}).selectOption('5');
    await page.getByText('61 of 67 June weekends').waitFor();
    assert.equal(await monthPicker.inputValue(), '5');
    await monthPicker.selectOption('8');
    await page.getByText('5 of 11 September weekends').waitFor();
    await page.getByText('Flow ranges & days per year', {exact:true}).click();
    await page.getByRole('table', {name:'Eddy flow ranges and average days per year'}).waitFor();

    const gauge = page.getByRole('combobox', {name:'Gauge',exact:true});
    const river = page.getByRole('combobox', {name:'River',exact:true});
    await river.selectOption('current');
    await page.waitForURL(url => url.searchParams.get('site') === '07064533');
    assert.deepEqual(await gauge.locator('option').allTextContents(), ['Akers','Montauk State Park','Powder Mill','Van Buren','Doniphan']);
    assert.equal(await page.getByRole('combobox', {name:'Compare stretches'}).count(), 0);
    await page.route('**/api/gauges/*/history?**', route => {
      const readings = [0,1,2].map(i => ({timestamp:new Date(Date.now() - (2-i)*3600000).toISOString(),gaugeHeightFt:2+i/10,dischargeCfs:180+i}));
      return route.fulfill({json:{readings,forecast:[],typical:[],timeZone:'America/Chicago'}});
    });
    for (const [site, label, unit] of [['07066510','Powder Mill','Stage (ft)'],['07067000','Van Buren','Flow (cfs)'],['07064440','Montauk State Park','Stage (ft)'],['07068000','Doniphan','Flow (cfs)']]) {
      const response = page.waitForResponse(r => r.url().includes('/api/gauges/'+site+'/history?'));
      await gauge.selectOption(site);
      await page.getByRole('heading', {name:label,exact:true}).waitFor();
      await response;
      await page.getByText(unit,{exact:true}).first().waitFor();
      assert.equal(await page.getByRole('link',{name:'See '+label+' readings'}).getAttribute('href'),'/gauges/'+site);
      assert.equal(await page.getByRole('heading',{name:'When does it float well?'}).count(),0);
    }
    await page.reload();
    assert.equal(await gauge.inputValue(),'07068000');
    await river.selectOption('buffalo');
    await page.waitForURL(url => url.searchParams.get('site') === '07056000');
    assert.equal(await gauge.locator('optgroup[label="Seasonal study"] option').count(),4);
    await page.getByRole('combobox',{name:'Compare stretches'}).selectOption('07055660');
    await page.waitForURL(url => url.searchParams.get('compare') === '07055660');
    await page.goto(origin+'/guides-layout-check?view=season', {waitUntil:'networkidle'});
    const todayCard = page.getByRole('region',{name:'How does today compare?'});
    await todayCard.getByText('Median 80.5 cfs').waitFor();
    await todayCard.getByRole('combobox',{name:'Past year'}).selectOption('2007');
    await todayCard.getByText('47.5 cfs · Too Low').waitFor();
    const seasonCard = page.getByRole('region',{name:'How has 2026 shaped up?'});
    await seasonCard.getByText('134 typical by Nov 16').waitFor();
    await seasonCard.getByRole('combobox',{name:'Through'}).selectOption('4');
    await seasonCard.getByText('83 typical by May 31').waitFor();
    await seasonCard.getByText('May daily readings',{exact:true}).click();
    await seasonCard.getByText('May 31',{exact:true}).last().waitFor();
    await seasonCard.getByText('May daily readings',{exact:true}).click();
    await seasonCard.getByRole('combobox',{name:'Through'}).selectOption('10');
    const captureStyle = 'header.sticky,nextjs-portal{visibility:hidden!important}';
    await todayCard.screenshot({path:out+'/season-today-'+name+'.png',style:captureStyle});
    await seasonCard.screenshot({path:out+'/season-curve-'+name+'.png',style:captureStyle});
    await page.getByRole('region',{name:'Did good conditions last the weekend?'}).screenshot({path:out+'/season-weekend-'+name+'.png',style:captureStyle});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' research overflow');
    await page.close(); console.log(`${name}: layout, map, estimates, empty states and search passed`);
  }
  const context=await browser.newContext({javaScriptEnabled:false}); const page=await context.newPage();
  await page.goto(`${origin}/guides-layout-check?view=directory`);
  assert.equal(await page.locator('article a[href^="/blog/"]').count(),28,'Crawlable links without JavaScript');
  await context.close(); assert.deepEqual(errors,[]);
  await writeFile(`${out}/result.json`,JSON.stringify({passed:true,widths:[1440,390,320],browserErrors:errors,fixtures:'Reviewed copy; public endpoint/geometry snapshot; mocked live embeds and planner responses.'},null,2));
  console.log('Guide smoke passed; screenshots: '+out);
  }
} catch(error) { console.error(error); console.error(serverLog.slice(-5000)); process.exitCode=1; }
finally { await cleanup(); }
