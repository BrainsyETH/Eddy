// Check schedule copy, card fit, mascot placement and platform bounds in Chromium.
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
  const layoutErrors = new Set();
  const check = (condition, message) => { if (!condition) layoutErrors.add(message); };
  const patterns = {
    noon: snapshot.hours, forecast: [], release: [],
    multiple: Array.from({ length: 24 }, (_, h) => h < 2 || h === 12 || h === 23),
    twelve: Array.from({ length: 24 }, (_, h) => h % 2 === 1),
    idle: Array(24).fill(false), minimum: Array(24).fill(false), all: Array(24).fill(true),
    midnight: Array.from({ length: 24 }, (_, h) => h < 2),
    four: Array.from({ length: 24 }, (_, h) => [0, 6, 12, 23].includes(h)),
    mixedMinimum: snapshot.hours,
    long: Array.from({ length: 24 }, (_, h) => h >= 11),
  };
  await mkdir('out/dam-story', { recursive: true });
  for (const platform of ['instagram', 'tiktok']) for (const [name, hours] of Object.entries(patterns)) {
    const id = 'social-dam-schedule';
    const minimumFlow = name === 'minimum' || name === 'mixedMinimum';
    const hourlyMw = hours.map((on, i) => on ? [55, 115, 170, 230][i % 4] : minimumFlow ? 5 : 0);
    const input = { platform, sample: true, snapshot: { ...snapshot, hours, hourlyMw, capacityMw: 230, minimumFlow } };
    if (name === 'twelve') input.snapshot.dam = { id: 'swf-robert-s-kerr', name: 'Robert S. Kerr Lock & Dam' };
    if (name === 'forecast') input.snapshot = {
      kind: 'forecast', dam: { id: 'lrn-wolf-creek-dam', name: 'Wolf Creek Dam' },
      scheduleDate: snapshot.scheduleDate, checkedAt: snapshot.checkedAt,
      source: 'U.S. Army Corps of Engineers, Nashville District', generating: true,
      windows: ['midnight – 2 AM', '4 AM – 6 AM', '8 AM – 10 AM', '12 PM – 2 PM', '4 PM – 6 PM', '10 PM – midnight'],
    };
    if (name === 'release') input.snapshot = {
      kind: 'release', dam: { id: 'ameren-bagnell-dam', name: 'Bagnell Dam' },
      scheduleDate: snapshot.scheduleDate, checkedAt: snapshot.checkedAt,
      releaseCfs: 6000, hourlyCfs: Array.from({ length: 24 }, (_, i) => i === 4 ? null : 250 * (i + 1)),
    };
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
    for (const frame of [0, 45, 90, 135, 179, 359]) {
      await page.evaluate(({ id, frame }) => window.remotion_setFrame(frame, id, 1), { id, frame });
      await page.waitForFunction(() => window.remotion_renderReady === true || window.remotion_cancelledError);
      const result = await page.evaluate(async () => {
        await document.fonts.ready;
        const bounds = el => { const b=el.getBoundingClientRect(); return {left:b.left,top:b.top,right:b.right,bottom:b.bottom}; };
        const scene = document.querySelector('[data-dam-scene]');
        const point = (x, y) => { const p = new DOMPoint(x, y).matrixTransform(scene.getScreenCTM()); return { x:p.x, y:p.y }; };
        return {
          // Measure rendered hull/head paths, not the outer rig's clipped paddle
          // copies. An SVG group's bounds include geometry outside clip paths.
          ...(scene && { canoe: bounds(document.querySelector('[data-canoe-hull]')), head: bounds(document.querySelector('[data-canoe-head]')),
          lakeBounds: { left:point(100, 35), right:point(335, 132), surface:point(100, 114) },
          layeredCanoe: !!document.querySelector('[data-canoe-hull]') && !!document.querySelector('[data-canoe-paddle]') && !scene.querySelector('foreignObject, image, img') }),
          error: window.remotion_cancelledError,
          regions: [...document.querySelectorAll('[data-dam-region]')].map(el => ({ name: el.dataset.damRegion, ...bounds(el) })),
          text: [...document.querySelectorAll('[data-dam-text]')].map(el => { const range=document.createRange(); range.selectNodeContents(el); return {text:el.textContent,...bounds(range),parent:bounds(el.closest('[data-dam-region]'))}; }),
          copy: document.querySelector('[data-dam-safe]').textContent,
          windows: document.querySelector('[data-dam-windows]')?.textContent,
          bars: [...document.querySelectorAll('[data-dam-hour]')].map(el => ({ height: el.height.baseVal.value, y: el.y.baseVal.value })),
          imageLoaded: [...document.querySelectorAll('img')].every(el => el.complete && el.naturalWidth > 0),
        };
      });
      assert.ok(!result.error, result.error);
      assert.ok(result.imageLoaded, 'Eddy logo loads');
      if (name !== 'release') {
        assert.ok(result.layeredCanoe, 'Eddy and canoe are layered vector artwork, not an image overlay');
        check(result.canoe.left >= result.lakeBounds.left.x && result.canoe.right < result.lakeBounds.right.x && result.canoe.top > result.lakeBounds.left.y && result.canoe.bottom > result.lakeBounds.surface.y && result.canoe.bottom < result.lakeBounds.right.y, `${platform}/${name}@${frame}: hull stays on the lake surface: ${JSON.stringify(result.canoe)}`);
        check(result.head.top > result.lakeBounds.left.y && result.head.bottom < result.lakeBounds.surface.y && result.head.left > result.canoe.left && result.head.right < result.canoe.right, `${platform}/${name}@${frame}: Eddy sits above the hull: ${JSON.stringify(result.head)}`);
      }
      assert.equal(result.bars.length, name === 'release' || name === 'forecast' ? 0 : 24);
      for (const [i, bar] of result.bars.entries()) {
        const plotHeight = bar.y + bar.height;
        assert.ok(Math.abs(plotHeight - (result.bars[0].y + result.bars[0].height)) < 0.001, 'common baseline');
        if (hours[i]) assert.ok(Math.abs(bar.height / plotHeight - hourlyMw[i] / 230) < 0.001, 'hourly MW on the fixed capacity scale');
        else assert.ok(bar.height / plotHeight < 0.05, 'idle and minimum flow stay at the baseline');
      }
      assert.ok(result.text.length >= (name === 'release' || name === 'forecast' ? 8 : 12), 'layout assertions must inspect rendered copy');
      const safe = platform === 'instagram' ? { top:250, bottom:1620, left:60, right:1020 } : { top:180, bottom:1500, left:60, right:810 };
      for (const rect of [...result.regions, ...result.text]) {
        check(rect.left >= safe.left-1 && rect.right <= safe.right+1 && rect.top >= safe.top-1 && rect.bottom <= safe.bottom+1, `${platform}/${name}@${frame}: outside safe bounds: ${JSON.stringify(rect)}`);
      }
      for (const rect of result.text) check(rect.top >= rect.parent.top-1 && rect.bottom <= rect.parent.bottom+1 && rect.left >= rect.parent.left-1 && rect.right <= rect.parent.right+1, `${platform}/${name}: text overflows its region: ${JSON.stringify(rect)}`);
      for (let i=0; i<result.text.length; i++) for (let j=i+1; j<result.text.length; j++) {
        const a=result.text[i], b=result.text[j];
        const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left);
        const overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
        check(overlapX<1 || overlapY<1, `${platform}/${name}: text collision: ${a.text} / ${b.text}`);
      }
      for (let i=1; i<result.regions.length; i++) check(result.regions[i-1].bottom <= result.regions[i].top, `${platform}/${name}: regions overlap`);
      if (initialCopy === undefined) initialCopy = result.copy;
      assert.equal(result.copy, initialCopy, 'facts remain visible for the whole clip');
      assert.match(result.copy, /SAMPLE/);
      if (name === 'forecast') { assert.match(result.copy, /Wolf Creek Dam.*Generation forecast/); assert.doesNotMatch(result.copy, /SWPA|MW/); }
      else if (name === 'release') { assert.match(result.copy, /Bagnell Dam.*Measured release6,000 cfs/); assert.doesNotMatch(result.copy, /SWPA|MW/); }
      else assert.match(result.copy, /0–230 MW/);
      if (name === 'twelve') assert.match(result.copy, /Robert S. Kerr Lock & Dam/);
      assert.doesNotMatch(result.copy, /Illustration|not live|hours posted|At the dam|downstream water-level forecast|DESIGN PREVIEW/i);
      if (name === 'noon') {
        assert.equal(result.windows, 'Noon–8 PM');
        assert.match(result.copy, /8 hours scheduled/);
        const card = result.regions.find(region => region.name === 'schedule');
        check(card.bottom-card.top < 260, `${platform}: single-window card stays compact`);
      }
      if (name === 'midnight') assert.equal(result.windows, 'Midnight–2 AM');
      if (name === 'minimum') { assert.equal(result.windows, 'Only minimum flow scheduled'); assert.doesNotMatch(result.copy, /No generation scheduled|0 hours/); }
      if (name === 'idle') { assert.equal(result.windows, 'No generation scheduled'); assert.doesNotMatch(result.copy, /0 hours/); }
      const footer = result.regions.find(region => region.name === 'footer');
      check(Math.abs(footer.bottom - safe.bottom) < 1, `${platform}: footer uses the safe area's full height`);
      if (frame === 179) await page.screenshot({ path:`out/dam-story/${platform}-${name}.png` });
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual([...layoutErrors], []);
  console.log('Dam story: 24 fixtures × 6 frames; safe bounds, layered canoe, complete windows and static copy passed.');
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
  await rm(dir, { recursive:true, force:true });
}
