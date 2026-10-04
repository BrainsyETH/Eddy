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
    assert.ok(duration <= 900, 'whole reel must stay within 30 seconds');
    await page.evaluate(({ id, composition }) => window.remotion_setBundleMode({
      type: 'composition', compositionName: id,
      serializedResolvedPropsWithSchema: composition.serializedResolvedPropsWithCustomSchema,
      compositionDurationInFrames: composition.durationInFrames, compositionFps: composition.fps,
      compositionHeight: composition.height, compositionWidth: composition.width,
    }), { id, composition });
    await page.waitForSelector('[data-read-region="viewport"]');
    const frames = [0, 1, 120, Math.floor((duration - 90) / 2), duration - 92, duration - 91, duration - 90, duration - 1];
    let previous;
    for (const frame of frames) {
      await page.evaluate(({ id, frame }) => window.remotion_setFrame(frame, id, 1), { id, frame });
      await page.waitForFunction(() => window.remotion_renderReady === true || window.remotion_cancelledError);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      const snapshot = await page.evaluate(() => {
        const names = ['header', 'host', 'eddy', 'viewport', 'content', 'footer'];
        const rects = Object.fromEntries(names.map(name => {
          const el = document.querySelector(`[data-read-region="${name}"]`);
          const b = el.getBoundingClientRect();
          return [name, { left:b.left, top:b.top, right:b.right, bottom:b.bottom, height:b.height }];
        }));
        const img = document.querySelector('[data-read-region="eddy"] img');
        return { rects,
          text: [...document.querySelectorAll('[data-read-text]')].map(p=>p.textContent).join(' '),
          mascotLoaded: img.complete && img.naturalWidth > 0,
          ending: !!document.querySelector('[data-read-region="ending"]'),
          error: window.remotion_cancelledError,
        };
      });
      assert.ok(!snapshot.error, snapshot.error);
      assert.equal(snapshot.text.replace(/\s+/g,' ').trim(), props.readingText.replace(/\s+/g,' ').trim(), 'every word retained');
      assert.ok(snapshot.mascotLoaded, 'Eddy is loaded on every frame');
      const r = snapshot.rects;
      for (const name of ['header', 'host', 'viewport', 'footer']) {
        assert.ok(r[name].left >= 120 && r[name].right <= 810 && r[name].top >= 250 && r[name].bottom <= 1501, `${id}: ${name} outside safe area`);
      }
      for (const [a,b] of [['header','host'],['host','viewport'],['viewport','footer']]) {
        assert.ok(r[a].bottom < r[b].top, `${a} overlaps ${b}`);
      }
      assert.ok(r.viewport.height >= 500, 'text viewport remains usable');
      assert.ok(r.eddy.top >= r.host.top && r.eddy.bottom <= r.host.bottom, 'Eddy is not clipped');
      if (previous && frame < duration - 90) {
        assert.ok(r.content.top < previous.rects.content.top, 'text never stalls or jumps back down');
        assert.equal(r.viewport.top,previous.rects.viewport.top,'chrome stays fixed');
      }
      if (frame === duration - 91) assert.ok(r.content.bottom <= r.viewport.top + 6, 'the final words clear before the ending');
      assert.equal(snapshot.ending, frame >= duration - 90);
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
