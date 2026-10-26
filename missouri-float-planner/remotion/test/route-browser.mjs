// Check actual browser bounds, including every frame of the reported Black
// River collision. Screenshots alone cannot detect a newly accepted overlap.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { bundle } from '@remotion/bundler';
import { enableTailwind } from '@remotion/tailwind';
import { ensureBrowser } from '@remotion/renderer';
import puppeteer from 'puppeteer';

const reviewDir = process.env.ROUTE_REVIEW_DIR;
if (reviewDir) await mkdir(reviewDir, { recursive: true });
const dir = await mkdtemp(resolve(tmpdir(), 'eddy-route-check-'));
let browser;
let server;
let slowPhotoRequests = 0;
try {
  const root = await bundle({ entryPoint: resolve('src/index.ts'), publicDir: resolve('public'),
    outDir: resolve(dir, 'bundle'), webpackOverride: enableTailwind });
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav' };
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const slowPhoto = pathname === '/public/test/slow-photo.png';
      const file = resolve(root, '.' + (slowPhoto ? '/public/test/williams-landing.png' : pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      const bytes = await readFile(file);
      if (slowPhoto && slowPhotoRequests++ === 0) await new Promise(r => setTimeout(r, 6000));
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
    'black-river-photo-credit', 'photo-mixed', 'photo-itinerary', 'photo-late-failure', 'photo-tall-route', 'photo-slow-preflight'];
  let checked = 0;
  for (const name of cases.filter(name => !process.env.ROUTE_CASES || process.env.ROUTE_CASES.split(",").includes(name))) {
    const credit = name === 'black-river-photo-credit';
    const photoCase = name.startsWith('photo-');
    const id = credit ? 'social-route-black-river' : photoCase ? 'social-route-grassy-bee' : name;
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
    if (photoCase) {
      const fixture = JSON.parse(await readFile('src/fixtures/grassy-bee.json', 'utf8'));
      const poi = (id, progress, photoUrl) => ({ id, name: id, progress, photoUrl, kind: 'poi',
        riverMile: 40.59 + progress * 5.3, detail: 'Point of interest' });
      const input = { photoUrl: '/public/test/grassy-access.png', routePoints: [
        { ...fixture.routePoints[0], photoUrl: '/public/test/grassy-access.png' },
        { ...poi('Williams Landing', 0.2, '/public/test/williams-landing.png'),
          name: 'Devils Well and Cave Spring Overlook Trailhead Landing',
          photoCredit: 'Photo: Example public land agency / photographer. A longer attribution that wraps cleanly without covering the place name or becoming clipped.' },
        poi('Second photo stop', 0.201, '/public/test/bee-bluff.png'),
        poi('Small photo', 0.3, '/public/test/route-photo-fixture.svg'),
        poi('Backdrop duplicate', 0.7, '/public/test/grassy-access.png?w=900'),
        { ...fixture.routePoints[2], photoUrl: '/public/test/bee-bluff.png' },
      ], ...(name === 'photo-itinerary' ? { routeCoordinates: [], terrainMapUrl: null } : {}) };
      if (name === 'photo-slow-preflight') {
        slowPhotoRequests = 0;
        input.routePoints[1].photoUrl = '/public/test/slow-photo.png';
      }
      if (name === 'photo-tall-route') {
        const black = JSON.parse(await readFile('src/fixtures/black-river.json', 'utf8'));
        Object.assign(input, { ...black, photoUrl: input.photoUrl, routePoints: input.routePoints,
          terrainMapUrl: '/public/test/black-river-terrain.png' });
      }
      await page.evaluate(input => { window.remotion_inputProps = JSON.stringify(input); }, input);
    }
    const composition = await page.evaluate(id => window.remotion_calculateComposition(id), id);
    if (photoCase) {
      const props = JSON.parse(composition.serializedResolvedPropsWithCustomSchema);
      const slow = name === 'photo-slow-preflight';
      assert.equal(props.routePoints.filter(p => p.photoReveal).length, slow ? 1 : 2, 'metadata must resolve eligibility');
      // Pin the product timing independently of the implementation: intro +
      // rounded travel legs + two photo/compact pauses + two compact pauses + CTA.
      const expectedDuration = 60 + (42 + 1 + 21 + 84 + 63) + (slow ? 60 : 90) + 90 + 2 * 60 + 90;
      assert.equal(composition.durationInFrames, expectedDuration, 'exact rounded travel + mixed pauses + closing');
      if (slow) {
        assert.equal(props.routePoints[1].photoUrl, '/public/test/slow-photo.png', 'timeout keeps thumbnail URL');
        assert.ok(props.routePoints[1].photoCredit, 'timeout keeps attribution');
      }
      if (name === 'photo-late-failure') {
        props.routePoints = props.routePoints.map(p => p.photoReveal ? { ...p, photoUrl: '/public/test/gone-after-preflight.png' } : p);
        composition.serializedResolvedPropsWithCustomSchema = JSON.stringify(props);
      }
    }
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
    let initialMap;
    const frames = name === 'social-route-black-river' || name === 'photo-mixed'
      ? Array.from({ length: duration }, (_, i) => i)
      : [...new Set([0, 45, 55, 60, 65, 69, 70, 75, 90, 102, 111, 120, 150, 183, 192, 193, 202, 220, 274, 283, 330, 490, duration - 90, duration - 60, duration - 30, duration - 1])].filter(f => f >= 0 && f < duration);
    for (const frame of frames) {
      await page.evaluate(({ id, frame }) => window.remotion_setFrame(frame, id, 1), { id, frame });
      await page.waitForFunction(() => window.remotion_renderReady === true || window.remotion_cancelledError);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      const bounds = await page.$eval('[data-route-region="map"]', e => {
        const b = e.getBoundingClientRect(); return { top: b.top, height: b.height, width: b.width };
      });
      initialMap ??= bounds;
      assert.deepEqual(bounds, initialMap, `${name}: map reflow at frame ${frame}`);
      const failures = await page.evaluate(({ frame, duration, name }) => {
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
        const band = rect('overlay-band');
        if (band.height > 0 && canoe.bottom > band.top + 0.5) problems.push('canoe enters overlay band');
        for (const marker of document.querySelectorAll('[data-route-active-marker]')) {
          if (band.height > 0 && marker.getBoundingClientRect().bottom > band.top) problems.push('active marker enters overlay band');
        }
        const photo = rect('photo-card'), credit = rect('photo-credit');
        if (photo && (photo.top < band.top || photo.bottom > band.bottom || photo.right > band.right)) problems.push('photo outside band');
        if (credit && (credit.top < photo.top || credit.bottom > photo.bottom || credit.right > photo.right)) problems.push('credit clipped');
        if (credit && credit.height > rect('photo-image').height / 4) problems.push('credit covers too much photo');
        const title = rect('photo-title'), subtitle = rect('photo-subtitle');
        if (photo && (subtitle.bottom > photo.bottom - 10 || title.bottom > subtitle.top - 3)) problems.push('photo caption too tight');
        if (photo && element('photo-subtitle').scrollHeight > subtitle.height + 1) problems.push('photo subtitle wraps');
        if (photo && (frame === 0 || frame >= duration - 90)) problems.push('large endpoint photo');
        if (name === 'photo-late-failure' && frame >= 111 && frame < 183 && photo) problems.push('failed photo did not fall back');
        if (name === 'photo-slow-preflight' && frame === 120) {
          const thumbnail = element('stop')?.querySelector('img');
          if (photo || !thumbnail?.complete || thumbnail.naturalWidth === 0) problems.push('slow photo thumbnail did not recover');
        }
        const stop = rect('stop'), reveal = element('stop-reveal');
        if (stop && Number(reveal.dataset.presence) >= 0.999 && stop.top < band.top) problems.push('compact card outside band');
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
        // A long missing-geometry itinerary scrolls; it has no whole-route overview.
        if (name !== 'photo-itinerary' && (frame === 0 || frame === duration - 1) && labels.length !== 2) problems.push('missing overview endpoints');
        const attribution = rect('attribution');
        if (attribution && attribution.top < footer.bottom) problems.push('CTA/attribution');
        if (footer.bottom > 1530) problems.push('footer outside platform safe area');
        if (window.remotion_cancelledError) problems.push(window.remotion_cancelledError);
        return problems;
      }, { frame, duration, name });
      if (failures.length && reviewDir) {
        await page.screenshot({ path: resolve(reviewDir, `${name}-failure@${frame}.png`) });
        console.log(name, frame, bounds, await page.$eval('[data-route-region="overlay-band"]', e => ({ top: e.getBoundingClientRect().top, height: e.getBoundingClientRect().height })));
      }
      assert.deepEqual(failures, [], `${name} frame ${frame}: ${failures.join(', ')}`);
      if (reviewDir && [0, 120, 150, 220, 330, 490, duration - 1].includes(frame)) {
        await page.screenshot({ path: resolve(reviewDir, `${name}@${frame}.png`) });
      }
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
