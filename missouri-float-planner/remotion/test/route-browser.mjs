// Check actual browser bounds, including every frame of the reported Black
// River collision. Screenshots alone cannot detect a newly accepted overlap.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { bundle } from '@remotion/bundler';
import { enableTailwind } from '@remotion/tailwind';
import { ensureBrowser } from '@remotion/renderer';
import puppeteer from 'puppeteer';

const dir = await mkdtemp(resolve(tmpdir(), 'eddy-route-check-'));
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
  const cases = ['social-route-portrait', 'social-route-black-river', 'social-route-grassy-bee',
    'social-route-itinerary-portrait', 'social-route-long-names-portrait',
    'social-route-akers-pulltite', 'social-route-map-layout', 'social-route-summary-portrait',
    'black-river-photo-credit'];
  let checked = 0;
  for (const name of cases) {
    const credit = name === 'black-river-photo-credit';
    const id = credit ? 'social-route-black-river' : name;
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
    if (credit) {
      const props = JSON.parse(composition.serializedResolvedPropsWithCustomSchema);
      props.routePoints = props.routePoints.map(p => ({ ...p, photoUrl: '/public/test/route-photo-fixture.svg',
        photoCredit: 'Photo: Example public land agency / photographer. Attribution wraps to a second line.' }));
      composition.serializedResolvedPropsWithCustomSchema = JSON.stringify(props);
    }
    await page.evaluate(({ id, composition }) => window.remotion_setBundleMode({
      type: 'composition', compositionName: id,
      serializedResolvedPropsWithSchema: composition.serializedResolvedPropsWithCustomSchema,
      compositionDurationInFrames: composition.durationInFrames, compositionFps: composition.fps,
      compositionHeight: composition.height, compositionWidth: composition.width,
    }), { id, composition });
    await page.waitForSelector('[data-route-region="map"]');
    const duration = composition.durationInFrames;
    const frames = name === 'social-route-black-river'
      ? Array.from({ length: duration }, (_, i) => i)
      : [...new Set([0, 45, 55, 60, 65, 69, 70, 75, 90, 120, 150, 200, duration - 90, duration - 60, duration - 30, duration - 1])].filter(f => f >= 0 && f < duration);
    for (const frame of frames) {
      await page.evaluate(({ id, frame }) => window.remotion_setFrame(frame, id, 1), { id, frame });
      await page.waitForFunction(() => window.remotion_renderReady === true || window.remotion_cancelledError);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      const failures = await page.evaluate(({ frame, duration }) => {
        const problems = [];
        const element = name => document.querySelector(`[data-route-region="${name}"]`);
        const rect = name => element(name)?.getBoundingClientRect();
        const header = rect('header'), progress = rect('progress'), map = rect('map');
        const footer = rect('footer'), stats = rect('stats'), cta = rect('cta'), canoe = rect('canoe');
        const separated = (a, b) => a.bottom <= b.top + 0.5;
        for (const [a, b, title] of [[header, progress, 'header/mileage'], [progress, map, 'mileage/map'],
          [map, footer, 'map/footer'], [stats, cta, 'stats/CTA']]) {
          if (!separated(a, b)) problems.push(title);
        }
        if (map.height < 180) problems.push('map has no usable height');
        if (Math.abs(Number(element('map').dataset.routeTop) - map.top) > 0.5 ||
          Math.abs(Number(element('map').dataset.routeHeight) - map.height) > 0.5) problems.push('map measurement stale');
        if (canoe.left < map.left - 0.5 || canoe.right > map.right + 0.5 ||
          canoe.top < map.top - 0.5 || canoe.bottom > map.bottom + 0.5) problems.push('canoe outside map');
        const stop = rect('stop'), reveal = element('stop-reveal');
        if (stop && Number(reveal.dataset.presence) >= 0.999 && stop.bottom > stats.top - 8) problems.push('stop/stats');
        const labels = [...document.querySelectorAll('[data-route-label]')];
        for (const label of labels) {
          const b = label.getBoundingClientRect();
          if (b.top < map.top || b.bottom > map.bottom || b.left < map.left || b.right > map.right) problems.push('clipped endpoint');
          // The image includes transparent water below Eddy. Check the occupied
          // silhouette through ten pixels below the route point, including hat.
          const silhouetteBottom = canoe.top + 86;
          if (b.left < canoe.right + 7 && b.right > canoe.left - 7 &&
            b.top < silhouetteBottom + 7 && b.bottom > canoe.top - 7) problems.push('endpoint/Eddy');
        }
        if ((frame === 0 || frame === duration - 1) && labels.length !== 2) problems.push('missing overview endpoints');
        const attribution = rect('attribution');
        if (attribution && attribution.top < footer.bottom) problems.push('CTA/attribution');
        if (footer.bottom > 1530) problems.push('footer outside platform safe area');
        if (window.remotion_cancelledError) problems.push(window.remotion_cancelledError);
        return problems;
      }, { frame, duration });
      assert.deepEqual(failures, [], `${name} frame ${frame}: ${failures.join(', ')}`);
      checked++;
    }
    console.log(`${name}: ${frames.length} frames passed`);
  }
  assert.deepEqual(errors, [], 'browser errors');
  console.log(`${checked} browser layout checks passed`);
} finally {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
