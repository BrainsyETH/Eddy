// Verify the actual full-report scroll, fixed chrome and mascot in Chromium.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { bundle } from '@remotion/bundler';
import { enableTailwind } from '@remotion/tailwind';
import { ensureBrowser } from '@remotion/renderer';
import puppeteer from 'puppeteer';

const dir = await mkdtemp(resolve(tmpdir(), 'eddy-read-check-'));
let browser;
let server;
try {
  const root = await bundle({ entryPoint: resolve('src/index.ts'), publicDir: resolve('public'),
    outDir: resolve(dir, 'bundle'), webpackOverride: enableTailwind });
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav' };
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      const bytes = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const status = await ensureBrowser({ browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE });
  assert.ok('path' in status, 'a render browser must be installed');
  browser = await puppeteer.launch({ executablePath: status.path, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}`;
  const cases = ['social-eddy-read', 'social-eddy-read-long', 'social-eddy-read-current'];
  for (const id of cases) {
    await page.evaluateOnNewDocument(() => {
      window.remotion_inputProps = '{}';
      window.remotion_initialFrame = 0;
      window.remotion_attempt = 1;
      window.remotion_audioEnabled = false;
      window.remotion_videoEnabled = false;
      window.remotion_puppeteerTimeout = 30000;
      window.process = { env: { NODE_ENV: 'production' } };
    });
    await page.goto(url);
    await page.waitForFunction(() => typeof window.remotion_setBundleMode === 'function');
    await page.evaluate(() => window.remotion_setBundleMode({ type: 'evaluation' }));
    await page.waitForFunction(() => window.remotion_renderReady === true);
    const composition = await page.evaluate(id => window.remotion_calculateComposition(id), id);
    const props = JSON.parse(composition.serializedResolvedPropsWithCustomSchema);
    const duration = composition.durationInFrames;
    assert.ok(duration >= 360, 'full report receives a usable reading duration');
    const endingStart = duration - Math.max(90, (props.voiceover?.closing.durationFrames ?? 0) + 24);
    await page.evaluate(({ id, composition }) => window.remotion_setBundleMode({
      type: 'composition', compositionName: id,
      serializedResolvedPropsWithSchema: composition.serializedResolvedPropsWithCustomSchema,
      compositionDurationInFrames: composition.durationInFrames, compositionFps: composition.fps,
      compositionHeight: composition.height, compositionWidth: composition.width,
    }), { id, composition });
    await page.waitForSelector('[data-read-region="viewport"]');
    const frames = [...new Set([0, 1, ...Array.from({ length: Math.ceil(duration / 30) }, (_, i) => i * 30), endingStart - 1, endingStart, duration - 1])].sort((a, b) => a - b);
    let previous;
    for (const frame of frames) {
      await page.evaluate(({ id, frame }) => window.remotion_setFrame(frame, id, 1), { id, frame });
      await page.waitForFunction(() => window.remotion_renderReady === true || window.remotion_cancelledError);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      const snapshot = await page.evaluate(() => {
        const names = ['header', 'host', 'eddy', 'viewport', 'content', 'report', 'ending', 'closing-title', 'footer'];
        const rects = Object.fromEntries(names.map(name => {
          const el = document.querySelector(`[data-read-region="${name}"]`);
          const b = el.getBoundingClientRect();
          return [name, { left:b.left, top:b.top, right:b.right, bottom:b.bottom, height:b.height }];
        }));
        const img = document.querySelector('[data-read-region="eddy"] img');
        return { rects,
          text: [...document.querySelectorAll('[data-read-text]')].map(p=>p.textContent).join(' '),
          mascotLoaded: img.complete && img.naturalWidth > 0,
          closingEddyLoaded: document.querySelector('[data-read-region="closing-eddy"]').naturalWidth > 0,
          weather: document.querySelector('[data-read-region="weather"]')?.textContent ?? null,
          closingWeight: Number(getComputedStyle(document.querySelector('[data-read-region="closing-title"]')).fontWeight),
          error: window.remotion_cancelledError,
        };
      });
      assert.ok(!snapshot.error, snapshot.error);
      assert.equal(snapshot.text.replace(/\s+/g,' ').trim(), props.readingText.replace(/\s+/g,' ').trim(), 'every word retained');
      assert.ok(snapshot.mascotLoaded, 'Eddy is loaded on every frame');
      assert.ok(snapshot.closingEddyLoaded, 'the closing card includes Eddy');
      if (props.weather) {
        assert.ok(snapshot.weather.includes(`${props.weather.highF}°`), 'actual forecast high is present');
        assert.ok(snapshot.weather.includes(`${props.weather.precipChance}% rain`), 'report-day rain chance is present');
      } else assert.equal(snapshot.weather, null, 'no invented weather');
      const r = snapshot.rects;
      for (const name of ['header', 'host', 'viewport', 'footer']) {
        assert.ok(r[name].left >= 120 && r[name].right <= 810 && r[name].top >= 250 && r[name].bottom <= 1501, `${id}: ${name} outside safe area`);
      }
      for (const [a,b] of [['header','host'],['host','viewport'],['viewport','footer']]) {
        assert.ok(r[a].bottom < r[b].top, `${a} overlaps ${b}`);
      }
      assert.ok(r.viewport.height >= 500, 'text viewport remains usable');
      assert.ok(r.eddy.top >= r.host.top && r.eddy.bottom <= r.host.bottom, 'Eddy is not clipped');
      const visibleHeight = name => Math.max(0, Math.min(r[name].bottom, r.viewport.bottom) - Math.max(r[name].top, r.viewport.top));
      assert.ok(visibleHeight('report') + visibleHeight('ending') >= r.viewport.height - 100, `${id} @ ${frame}: no mostly-empty entrance or exit`);
      assert.ok(r.ending.top - r.report.bottom <= 36.1, 'closing card follows the last sentence');
      if (frame === 0) assert.ok(r.report.top <= r.viewport.top + 30, 'the report is already in view at the opening');
      if (previous && frame < endingStart) {
        assert.ok(r.content.top < previous.rects.content.top, 'text never stalls or jumps back down');
        assert.equal(r.viewport.top,previous.rects.viewport.top,'chrome stays fixed');
      }
      if (frame >= endingStart - 1) {
        assert.ok(r.report.bottom <= r.viewport.top + 6, 'all final words have crossed the viewport');
        assert.ok(r.ending.top >= r.viewport.top && r.ending.bottom <= r.viewport.bottom, 'the complete closing card fits during the hold');
        assert.ok(r['closing-title'].left >= r.ending.left && r['closing-title'].right <= r.ending.right, 'closing headline fits');
        assert.ok(snapshot.closingWeight >= 700, 'closing headline has a bold weight');
      }
      if (previous && frame >= endingStart) assert.equal(r.content.top, previous.rects.content.top, 'ending holds without a jump');
      previous = snapshot;
    }
    console.log(`${id}: all ${frames.length} frame checks passed (${duration / composition.fps}s)`);
  }
  assert.deepEqual(errors, [], 'browser errors');
} finally {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
