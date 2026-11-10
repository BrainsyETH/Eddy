// Actual widget/preview components with fixture data; no production data or posting.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const route = resolve('src/app/embed/report-check');
const output = process.env.REPORT_SMOKE_OUTPUT || '/tmp/eddy-daily-report';
const origin = 'http://127.0.0.1:3152';
assert(!existsSync(route), 'Refusing to overwrite a fixture route');
let server, browser;
try {
  await mkdir(route, { recursive: true });
  await mkdir(output, { recursive: true });
  await writeFile(`${route}/page.tsx`, `import { notFound } from 'next/navigation';
import DailyReportSlide from '@/components/admin/social/DailyReportSlide';
import CarouselPreview from '@/components/admin/social/CarouselPreview';
import { reportFixture } from '../../../../scripts/fixtures/daily-report';
export default async function Page({ searchParams }: { searchParams: Promise<{ index?: string; long?: string }> }) {
  if (process.env.NODE_ENV !== 'development' || process.env.EDDY_REPORT_SMOKE !== '1') notFound();
  const p = await searchParams;
  if (p.index === 'preview') return <div style={{maxWidth: 540, padding: 16, background: '#163f4a'}}><CarouselPreview urls={['/icons/eddy-wave.png','/icons/eddy-release.png']} /></div>;
  const report = structuredClone(reportFixture);
  if (p.long && report.slides[0].kind === 'river') { report.slides[0].data.river.name = 'Eleven Point River'; report.slides[0].data.primary!.name = 'Eleven Point River near Bardley, Missouri'; }
  return <DailyReportSlide report={report} index={Number(p.index ?? 0)} />;
}`);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3152'], {
    env: { ...process.env, EDDY_REPORT_SMOKE: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_GA_ID: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', b => { log += b; appendFileSync('/tmp/eddy-report-next.log', b); }); server.stderr.on('data', b => { log += b; appendFileSync('/tmp/eddy-report-next.log', b); });
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(log.slice(-5000));
    try { if ((await fetch(`${origin}/embed/report-check`, { signal: AbortSignal.timeout(2000) })).ok) break; } catch {}
    if (i === 119) throw new Error(log.slice(-5000));
    await new Promise(r => setTimeout(r, 1000));
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 675 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const [index, long, name] of [[0, false, 'river'], [1, false, 'dam'], [0, true, 'long-name']]) {
    await page.goto(`${origin}/embed/report-check?index=${index}${long ? '&long=1' : ''}`, { waitUntil: 'networkidle', timeout: 90_000 });
    const slide = page.locator('[data-report-slide]');
    await slide.waitFor();
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('[data-report-slide] img')].map(img => img.decode())); });
    const bounds = await slide.evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight, width: el.clientWidth,
      overflow: [...el.querySelectorAll('*')].filter(c => { const r = c.getBoundingClientRect(), b = el.getBoundingClientRect(); return r.width && (r.right > b.right + 1 || r.left < b.left - 1 || r.bottom > b.bottom + 1); }).map(c => c.className) }));
    assert.equal(bounds.width, 540);
    assert.equal(bounds.height, 675);
    assert.equal(bounds.scroll, bounds.height, `${name}: vertical clipping`);
    assert.deepEqual(bounds.overflow, [], `${name}: ${JSON.stringify(bounds.overflow)}`);
    assert.match(await slide.innerText(), /Captured Nov 10, 2026, 9:30 AM CT/);
    assert.equal(await slide.locator('.ew-credit, .ew-about').count(), 0, 'static export has no dead controls');
    assert.equal(await slide.locator(index ? '.ew-sched' : 'svg[role="img"]').count(), 1, 'one actual widget chart');
    if (index) assert.equal(await slide.locator('.ew-dam-detail').count(), 3, 'dam measurements stay together');
    await slide.screenshot({ path: `${output}/${name}.png` });
    console.log(`PASS ${name}: actual widget fits 1080 × 1350 export`);
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${origin}/embed/report-check?index=preview`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Next' }).click();
    assert.match(await page.locator('[aria-live]').innerText(), /Slide 2 of 2/);
    assert.equal(await page.getByRole('button', { name: 'Next' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Previous' }).focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('[aria-live]').innerText(), /Slide 1 of 2/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  assert.deepEqual(errors, []);
  console.log('PASS mobile carousel review, keyboard navigation, and no browser errors');
} finally {
  server?.kill('SIGTERM');
  await browser?.close();
  await rm(route, { recursive: true, force: true });
}
