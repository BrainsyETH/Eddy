// Check every phrase, river transition and safe-area bound in Chromium.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { bundle } from '@remotion/bundler';
import { enableTailwind } from '@remotion/tailwind';
import { ensureBrowser } from '@remotion/renderer';
import puppeteer from 'puppeteer';

const dir = await mkdtemp(resolve(tmpdir(), 'eddy-dam-check-'));
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
  const snapshot = { scheduleDate: '2026-11-09', checkedAt: '2026-11-09T16:00:00Z', minimumFlow: false, hours: Array.from({ length: 24 }, (_, h) => h >= 12 && h < 20) };
  const patterns = {
    noon: snapshot.hours,
    multiple: Array.from({ length: 24 }, (_, h) => h < 2 || h === 12 || h === 23),
    twelve: Array.from({ length: 24 }, (_, h) => h % 2 === 1),
    idle: Array(24).fill(false), all: Array(24).fill(true),
    long: Array.from({ length: 24 }, (_, h) => h >= 11),
  };
  await mkdir('out/dam-story', { recursive: true });
  for (const platform of ['instagram', 'tiktok']) for (const [name, hours] of Object.entries(patterns)) {
    const id = 'social-dam-schedule';
    const input = { platform, sample: true, snapshot: { ...snapshot, hours, minimumFlow: name === 'idle' } };
    await page.evaluateOnNewDocument(input => {
      window.remotion_inputProps = JSON.stringify(input);
      window.remotion_initialFrame = 0; window.remotion_attempt = 1;
      window.remotion_audioEnabled = false; window.remotion_videoEnabled = false;
      window.remotion_puppeteerTimeout = 30000;
      window.process = { env: { NODE_ENV: 'production' } };
    }, input);
    await page.goto(url);
    await page.waitForFunction(() => typeof window.remotion_setBundleMode === 'function');
    await page.evaluate(() => window.remotion_setBundleMode({ type: 'evaluation' }));
    await page.waitForFunction(() => window.remotion_renderReady === true);
    const composition = await page.evaluate(id => window.remotion_calculateComposition(id), id);
    assert.equal(composition.durationInFrames, 360);
    await page.evaluate(({ id, composition }) => window.remotion_setBundleMode({
      type: 'composition', compositionName: id,
      serializedResolvedPropsWithSchema: composition.serializedResolvedPropsWithCustomSchema,
      compositionDurationInFrames: composition.durationInFrames, compositionFps: composition.fps,
      compositionHeight: composition.height, compositionWidth: composition.width,
    }), { id, composition });
    await page.waitForSelector('[data-dam-safe]');
    let initialCopy;
    for (const frame of [0, 179, 359]) {
      await page.evaluate(({ id, frame }) => window.remotion_setFrame(frame, id, 1), { id, frame });
      await page.waitForFunction(() => window.remotion_renderReady === true || window.remotion_cancelledError);
      const result = await page.evaluate(async () => {
        await document.fonts.ready;
        const bounds = el => { const b=el.getBoundingClientRect(); return {left:b.left,top:b.top,right:b.right,bottom:b.bottom}; };
        return {
          error: window.remotion_cancelledError,
          regions: [...document.querySelectorAll('[data-dam-region]')].map(el => ({ name: el.dataset.damRegion, ...bounds(el) })),
          text: [...document.querySelectorAll('[data-dam-text]')].map(el => { const range=document.createRange(); range.selectNodeContents(el); return {text:el.textContent,...bounds(range),parent:bounds(el.closest('[data-dam-region]'))}; }),
          copy: document.querySelector('[data-dam-safe]').textContent,
          windows: document.querySelector('[data-dam-windows]').textContent,
          hourCount: document.querySelectorAll('[data-dam-hour]').length,
          imageLoaded: [...document.querySelectorAll('img')].every(el => el.complete && el.naturalWidth > 0),
        };
      });
      assert.ok(!result.error, result.error);
      assert.ok(result.imageLoaded, 'Eddy logo loads');
      assert.equal(result.hourCount, 24);
      assert.ok(result.text.length >= 12, 'layout assertions must inspect rendered copy');
      const safe = platform === 'instagram' ? { top:250, bottom:1620, left:60, right:1020 } : { top:180, bottom:1500, left:60, right:810 };
      for (const rect of [...result.regions, ...result.text]) {
        assert.ok(rect.left >= safe.left-1 && rect.right <= safe.right+1 && rect.top >= safe.top-1 && rect.bottom <= safe.bottom+1, `${platform}/${name}@${frame}: outside safe bounds: ${JSON.stringify(rect)}`);
      }
      for (const rect of result.text) assert.ok(rect.top >= rect.parent.top-1 && rect.bottom <= rect.parent.bottom+1 && rect.left >= rect.parent.left-1 && rect.right <= rect.parent.right+1, `${platform}/${name}: text overflows its region: ${JSON.stringify(rect)}`);
      for (let i=0; i<result.text.length; i++) for (let j=i+1; j<result.text.length; j++) {
        const a=result.text[i], b=result.text[j];
        const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left);
        const overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
        assert.ok(overlapX<1 || overlapY<1, `${platform}/${name}: text collision: ${a.text} / ${b.text}`);
      }
      for (let i=1; i<result.regions.length; i++) assert.ok(result.regions[i-1].bottom <= result.regions[i].top, `${platform}/${name}: regions overlap`);
      if (initialCopy === undefined) initialCopy = result.copy;
      assert.equal(result.copy, initialCopy, 'facts remain visible for the whole clip');
      assert.match(result.copy, /EXAMPLE TIMES/);
      if (name === 'noon') assert.equal(result.windows, '12–8 PM');
      if (frame === 179) await page.screenshot({ path:`out/dam-story/${platform}-${name}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log('Dam story: 12 fixtures × 3 frames; safe bounds, complete windows and static copy passed.');
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
  await rm(dir, { recursive:true, force:true });
}
