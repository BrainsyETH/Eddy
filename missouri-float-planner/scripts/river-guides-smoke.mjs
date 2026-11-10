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
import { guideOverview } from '@/lib/guides/overview';
import { resolveGuideHero } from '@/lib/photos/guides';
import { guideDam } from '@/lib/guides/dam';
export default async function Page({ searchParams }: { searchParams: Promise<{ river?: string; view?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_GUIDE_SMOKE !== '1') notFound();
  const params = await searchParams;
  if (params.view === 'directory') return <main className="mx-auto max-w-5xl p-4"><h1>River guides</h1><GuideDirectory entries={reviewedRiverGuides.map(seed => ({ slug: seed.slug, state: seed.slug.endsWith('arkansas') ? 'AR' : 'MO', search: seed.title + ' ' + seed.description, card: <article><a href={'/blog/' + seed.slug}>{seed.title}</a></article> }))} /></main>;
  const seed = reviewedRiverGuides.find(seed => seed.river_slug === (params.river || 'current'));
  if (!seed) notFound();
  const aps = new Map(accesses.filter(a => a.river_slug === seed.river_slug).map(a => [a.slug, { id: a.id, riverId: a.river_id, imageUrl: null, npsImageUrl: null, endpoint: a.is_float_endpoint !== false, mile: Number(a.river_mile_downstream) }]));
  const map = seed.river_slug === 'current' ? guideOverview(lines.map(line => { const s=seed.guide_data.sections.find(s=>s.id===line.id)!; return {...line, number:line.id, label:s.from+' → '+s.to,miles:s.miles}; })) : [];
  const post = { ...seed, id: 'fixture', category: 'River Guides', published_at: '2026-10-01T00:00:00Z', meta_keywords: null, og_image_url: seed.og_image_url ?? null, guide_data: { ...seed.guide_data, related_rivers: [], hero: resolveGuideHero(seed, seed.guide_data.hero) } };
  return <><p className="bg-secondary-100 px-4 py-2 text-sm">Preview: reviewed copy; captured route geometry. Live conditions are not loaded.</p><RiverGuideView post={post} aps={aps} riverMeta={{ state: seed.slug.endsWith('arkansas') ? 'AR' : 'MO', name: seed.guide_data.hero.title_top }} directory={null} overview={map} dam={guideDam(seed.river_slug)} /></>;
}
`);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, EDDY_GUIDE_SMOKE: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only', FLOAT_SEARCH_ENABLED: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
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
    const estimate = page.getByRole('button',{name:'Get a float time estimate'}).first();
    await estimate.click(); await page.getByText('3–4 hours · Canoe',{exact:false}).waitFor();
    mode='dangerous'; await page.getByRole('button',{name:'Refresh time estimate'}).first().click();
    await page.getByText('The planner is withholding a time',{exact:false}).waitFor();
    mode='stale'; await page.getByRole('button',{name:'Refresh time estimate'}).first().click();
    await page.getByText('Current water data is unavailable',{exact:false}).waitFor();
    mode='error'; await page.getByRole('button',{name:'Refresh time estimate'}).first().click();
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
    await page.close(); console.log(`${name}: layout, map, estimates, empty states and search passed`);
  }
  const context=await browser.newContext({javaScriptEnabled:false}); const page=await context.newPage();
  await page.goto(`${origin}/guides-layout-check?view=directory`);
  assert.equal(await page.locator('a[href^="/blog/"]').count(),28,'Crawlable links without JavaScript');
  await context.close(); assert.deepEqual(errors,[]);
  await writeFile(`${out}/result.json`,JSON.stringify({passed:true,widths:[1440,390,320],browserErrors:errors,fixtures:'Reviewed copy; public endpoint/geometry snapshot; mocked live embeds and planner responses.'},null,2));
  console.log('Guide smoke passed; screenshots: '+out);
  }
} catch(error) { console.error(error); console.error(serverLog.slice(-5000)); process.exitCode=1; }
finally { await cleanup(); }
