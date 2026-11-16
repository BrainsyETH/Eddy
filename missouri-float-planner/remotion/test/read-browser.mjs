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
  const cases = ['social-eddy-read', 'social-eddy-read-long', 'social-eddy-read-current', 'social-eddy-read-weekend'];
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
    await page.waitForSelector('[data-read-region="caption"]');
    const baselineFrames = {
      'social-eddy-read': [0,120,360], 'social-eddy-read-long': [0,540,1158],
      'social-eddy-read-current': [0,600,1742], 'social-eddy-read-weekend': [0,450,duration-1],
    }[id];
    const frames = [...new Set([0, ...Array.from({ length: Math.ceil(duration / 6) }, (_, i) => i * 6),
      ...baselineFrames, endingStart - 1, endingStart, duration - 1])].filter(f => f < duration).sort((a,b)=>a-b);
    const seen = new Map();
    const seenRivers = new Set();
    for (const frame of frames) {
      await page.evaluate(({ id, frame }) => window.remotion_setFrame(frame, id, 1), { id, frame });
      await page.waitForFunction(() => window.remotion_renderReady === true || window.remotion_cancelledError);
      await page.evaluate(async () => { await document.fonts.ready; });
      const snapshot = await page.evaluate(() => {
        const bounds = el => { const b=el.getBoundingClientRect(); return {left:b.left,top:b.top,right:b.right,bottom:b.bottom}; };
        const rects = Object.fromEntries(['header','title','scene','eddy','caption','footer','source'].map(name =>
          [name,bounds(document.querySelector(`[data-read-region="${name}"]`))]));
        const caption = document.querySelector('[data-read-text]');
        const img = document.querySelector('[data-read-region="eddy"]');
        return { rects, text:caption.textContent, cue:caption.dataset.readCue, textRect:bounds(caption),
          title:document.querySelector('[data-read-region="title"]').textContent,
          mascotLoaded:img.complete && img.naturalWidth>0, error:window.remotion_cancelledError };
      });
      assert.ok(!snapshot.error,snapshot.error);
      assert.ok(snapshot.mascotLoaded,`${id}@${frame}: Eddy loads`);
      assert.ok(snapshot.text.trim(),`${id}@${frame}: no blank caption`);
      if (frame < endingStart) { seen.set(snapshot.cue,snapshot.text); seenRivers.add(snapshot.title.trim()); }
      const r=snapshot.rects;
      for (const name of ['header','title','scene','eddy','caption','footer','source']) {
        assert.ok(r[name].left>=119 && r[name].right<=811 && r[name].top>=249 && r[name].bottom<=1501,`${id}@${frame}: ${name} outside safe area: ${JSON.stringify(r[name])}`);
      }
      assert.ok(r.title.bottom<=r.header.bottom,`${id}: title overflows header`);
      assert.ok(r.header.bottom<=r.scene.top && r.scene.bottom<=r.caption.top && r.caption.bottom<=r.footer.top,`${id}: regions overlap`);
      assert.ok(snapshot.textRect.bottom<=r.footer.top-6,`${id}@${frame}: caption collides with footer`);
      assert.ok(snapshot.textRect.right<=811,`${id}@${frame}: caption overflows`);
      if (process.env.READ_STILLS_DIR && baselineFrames.includes(frame)) {
        await mkdir(process.env.READ_STILLS_DIR,{recursive:true});
        await page.screenshot({path:resolve(process.env.READ_STILLS_DIR,`${id}@${frame}.png`)});
      }
    }
    assert.equal([...seen.values()].join(' ').replace(/\s+/g,' ').trim(),props.readingText.replace(/\s+/g,' ').trim(),'every word is shown in order, including qualifications');
    assert.deepEqual([...seenRivers],props.scenes?.map(scene=>scene.riverName) ?? [props.riverName],'the correct river stays identified');
    console.log(`${id}: ${frames.length} frames, ${seen.size} phrases, ${seenRivers.size} rivers checked`);
  }
  assert.deepEqual(errors, [], 'browser errors');
} finally {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
