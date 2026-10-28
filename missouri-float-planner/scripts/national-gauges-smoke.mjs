// Called by planner-map-smoke: exercises both real renderers with a complete national index.
import assert from 'node:assert/strict';

// waitForFunction treats a returned Promise as truthy in Playwright. Await the
// MapLibre worker's getData result on every poll so source assertions really wait.
export async function waitForMapData(page, predicate, argument) {
  const deadline = Date.now() + 30_000;
  do {
    if (await page.evaluate(predicate, argument)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.fail(`Map data did not satisfy ${predicate.toString()}`);
}

const stationNames = new Map();
const epoch = Math.floor(Date.now() / 1000);
export const nationalGaugeIndex = { v: 1, generatedAt: new Date().toISOString(), rows: [
  ['10000001', -91.3, 37.1, 321, 2.4, epoch, 0, 95],
  ['10000002', -91.7, 37.6, null, 1.5, epoch, 0, null],
  ['10000003', -91.1, 37.3, 123, 2, epoch - 48 * 3600, 0, 50],
  ['10000004', -105.5, 39.3, 84, 1.1, epoch, 0, 15],
  ['10000005', -99, 38, 34, 1.2, epoch, 0, 50],
  ['10000006', -99, 38, 35, 1.3, epoch, 0, 50],
  ...Array.from({ length: 14000 }, (_, i) => [String(20000000 + i), -124 + (i % 200) * .27, 25 + Math.floor(i / 200) * .31, i + 1, 2, epoch, 0, null]),
] };
export function addNearbyGaugeFixtures(accessPoints) {
  const rows = accessPoints.flatMap((point, index) => [[0, 0], [.008, .004], [-.012, .009], [.019, -.013]].map(([lng, lat], offset) => {
    const siteId = String(30000000 + index * 10 + offset);
    stationNames.set(siteId, `Current River near ${point.name} ${offset + 1}`);
    return [siteId, point.coordinates.lng + lng, point.coordinates.lat + lat, 70 + offset * 50, 2, epoch, 0, null];
  }));
  nationalGaugeIndex.rows.push(...rows);
  return { v: 1, rows };
}
export function gaugeViewportFixture(index, url) {
  const [w, s, e, n] = url.searchParams.get('bbox').split(',').map(Number);
  const rows = index.rows.filter(row => row[1] >= w && row[1] <= e && row[2] >= s && row[2] <= n);
  return { capped: rows.length > 1000, total: rows.length, gauges: rows.slice(0, 1000).map(row => nationalGaugeDetail(row[0])) };
}
export function nationalGaugeDetail(siteId) {
  const row = nationalGaugeIndex.rows.find(row => row[0] === siteId);
  if (!row) return null;
  return { id: siteId, siteId, name: stationNames.get(siteId) ?? `Test creek ${siteId}`, provider: 'usgs', curated: false,
    coordinates: { lng: row[1], lat: row[2] }, dischargeCfs: row[3], gaugeHeightFt: row[4],
    readingTimestamp: new Date(row[5] * 1000).toISOString(), readingAgeHours: 0, readingSuspect: false,
    flowPercentile: row[7], qualifierNote: null, thresholds: null, floodStages: null, publicUrl: null };
}

export async function runNationalGaugeChecks({ browser, origin, out, routeHandler, accessPoints }) {
  const total = nationalGaugeIndex.rows.length - 1;
  for (const width of process.env.GAUGE_TEST_WIDTHS?.split(',').map(Number) ?? [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.setDefaultTimeout(30_000);
    await page.route('**/*', routeHandler);
    let indexRequests = 0;
    page.on('request', request => { if (request.url().includes('/api/gauges/points')) indexRequests++; });
    await page.goto(`${origin}/planner-map-layout-check?river=current&putIn=p-0-0&takeOut=p-0-1`, { timeout: 120_000 });
    await waitForMapData(page, async total => {
      const source = window.plannerMap?.getSource('planner-reference-gauges');
      return source && (await source.getData()).features.filter(f => f.properties.key.startsWith('reference:')).length === total;
    }, total);
    console.log(`Planner ${width}: complete ${total}-station source`);
    assert(await page.evaluate(async () => !(await window.plannerMap.getSource('planner-places').getData()).features.some(f => f.properties.key.startsWith('reference:'))), 'Reference gauges never enter the access/POI cluster tree');
    const access = accessPoints[2];
    await page.waitForFunction(coordinates => {
      const map = window.plannerMap;
      if (!map || map.isMoving()) return false;
      if (map.getZoom() < 14 || Math.abs(map.getCenter().lng - coordinates.lng) > .001) {
        map.jumpTo({ center: [coordinates.lng, coordinates.lat], zoom: 15 }); return false;
      }
      return !!document.querySelector('[data-access-point-id="p-0-2"]');
    }, access.coordinates);
    const accessPin = page.locator('[data-access-point-id="p-0-2"]');
    assert.equal(await accessPin.getAttribute('data-cluster-count'), null, 'Nearby reference gauges cannot turn an access pin into a cluster');
    assert(await accessPin.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), 'Access pins are above a co-located USGS cluster');
    await accessPin.click();
    await page.getByRole('region', { name: 'Selected access point' }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Choose a place', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Close access details', exact: true }).click();
    const sourceCount = count => waitForMapData(page, async count => {
      const source = window.plannerMap?.getSource('planner-reference-gauges');
      return source && (await source.getData()).features.filter(f => f.properties.key.startsWith('reference:')).length === count;
    }, count);
    await page.waitForFunction(() => {
      const map = window.plannerMap;
      if (!map || map.isMoving()) return false;
      if (map.getZoom() < 14 || Math.abs(map.getCenter().lng + 91.3) > .01) {
        map.jumpTo({ center: [-91.3, 37.1], zoom: 15 }); return false;
      }
      return !!document.querySelector('[data-usgs-site-id="10000001"]');
    });
    const marker = page.locator('[data-usgs-site-id="10000001"]');
    await marker.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-usgs-site-id="10000001"]')?.getAttribute('aria-label')?.includes('Test creek 10000001'));
    await marker.focus(); await marker.press('Enter');
    await page.getByRole('heading', { name: 'Test creek 10000001' }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('putIn'), 'p-0-0');
    assert.equal(new URL(page.url()).searchParams.get('takeOut'), 'p-0-1');
    await page.getByText('Not Eddy-rated', { exact: true }).waitFor();
    await page.screenshot({ path: `${out}/national-planner-detail-${width}.png` });
    await page.getByRole('button', { name: 'Close gauge details', exact: true }).click();
    await page.getByRole('button', { name: 'Map filters', exact: true }).click();
    const filters = page.getByRole('region', { name: 'USGS gauge filters' });
    assert.equal(await filters.getByRole('button', { name: /^USGS gauges/ }).getAttribute('aria-pressed'), 'true');
    await filters.getByText('Filter other gauges', { exact: true }).click();
    await filters.getByRole('button', { name: 'Include historical', exact: true }).click();
    await sourceCount(total + 1);
    await filters.getByRole('button', { name: 'Clear gauge filters', exact: true }).click();
    await sourceCount(total);
    await filters.getByRole('button', { name: 'Reports flow', exact: true }).click();
    await sourceCount(total - 1);
    await filters.getByRole('button', { name: 'Much higher', exact: true }).click();
    await sourceCount(1);
    const ratedToggle = filters.getByRole('button', { name: /^Eddy-rated/ });
    await ratedToggle.scrollIntoViewIfNeeded();
    assert(await ratedToggle.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.left + 5, rect.top + rect.height / 2));
    }), 'Expanded filters stay above route tools and the phone sheet');
    await page.screenshot({ path: `${out}/national-planner-filters-${width}.png` });
    await filters.getByRole('button', { name: 'Clear gauge filters', exact: true }).click();
    await filters.getByRole('button', { name: /^Other USGS/ }).click();
    await sourceCount(0);
    await page.reload();
    await sourceCount(0);
    assert.equal(indexRequests, 1, 'Saved-off layer does not fetch on reload');
    await page.getByRole('button', { name: 'Map filters', exact: true }).click();
    await filters.getByRole('button', { name: /^Other USGS/ }).click();
    await sourceCount(total);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('eddy-web-gauge-layers-v1')).other === true);
    assert.deepEqual(errors, []);

    // The SVG map must show every station in the view, without the old phone cap.
    await page.goto(`${origin}/river-map`, { timeout: 120_000 });
    await page.locator('[data-national-gauges] [data-gauge-visible="true"]').first().waitFor();
    assert.equal(await page.locator('[data-usgs-site-id="10000003"]').count(), 0);
    if (width < 768) await page.getByRole('button', { name: /rivers floatable/ }).click();
    const liveFilters = page.getByRole('region', { name: 'USGS gauge filters' });
    await page.screenshot({ path: `${out}/national-live-overview-${width}.png` });
    await liveFilters.getByRole('button', { name: /^Other USGS/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-national-gauges] [data-gauge-visible="true"]').length === 0);
    await liveFilters.getByRole('button', { name: /^Other USGS/ }).click();
    await page.locator('[data-national-gauges] [data-gauge-visible="true"]').first().waitFor();
    await liveFilters.getByText('Filter other gauges', { exact: true }).click();
    await liveFilters.getByRole('button', { name: 'Much higher', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Close panel' }).click();
    const svgMarker = page.locator('[data-usgs-site-id="10000001"]');
    await svgMarker.waitFor(); await svgMarker.focus(); await svgMarker.press('Enter');
    await page.getByRole('heading', { name: 'Test creek 10000001' }).waitFor();
    await page.screenshot({ path: `${out}/national-live-detail-${width}.png` });
    await page.getByRole('button', { name: 'Close gauge details', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: /rivers floatable/ }).click();
    await liveFilters.getByRole('button', { name: 'Clear gauge filters', exact: true }).click();
    await liveFilters.getByRole('button', { name: 'Normal', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Close panel' }).click();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    const pair = page.locator('[data-gauge-cluster-count="2"]');
    await pair.waitFor(); await pair.focus(); await pair.press('Enter');
    const choices = page.getByRole('region', { name: 'Choose a USGS gauge' });
    // A low-zoom coincident group first zooms to the name-enrichment threshold.
    if (!(await choices.isVisible())) { await pair.focus(); await pair.press('Enter'); }
    await choices.getByRole('button', { name: 'Test creek 10000006', exact: true }).click();
    await page.getByRole('heading', { name: 'Test creek 10000006' }).waitFor();
    await page.getByRole('button', { name: 'Close gauge details', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Reset view', exact: true }).isEnabled(), true);
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-national-gauges] [data-gauge-visible="true"]').length === 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(`Both maps ${width}: default visibility, selection, filters, historical inclusion and persistence passed`);
    await page.close();
  }
  const legacy = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await legacy.route('**/*', routeHandler);
  await legacy.addInitScript(() => { if (!localStorage.getItem('eddy-web-gauge-layers-v1')) localStorage.setItem('eddy-plan-map-filters-v1', JSON.stringify({ showGauges: false })); });
  let requests = 0, failNames = true;
  legacy.on('request', request => { if (request.url().includes('/api/gauges/points')) requests++; });
  await legacy.route('**/api/gauges/map?**', route => failNames ? route.fulfill({ status: 503 })
    : route.fulfill({ json: { capped: true, total, gauges: [nationalGaugeDetail('10000001')] } }));
  await legacy.goto(`${origin}/planner-map-layout-check`, { timeout: 120_000 });
  await legacy.getByRole('button', { name: 'Map filters', exact: true }).click();
  await legacy.getByRole('button', { name: 'Other USGS · Off', exact: true }).waitFor();
  assert.equal(requests, 0, 'Legacy gauges-off choice prevents the national download');
  await legacy.getByRole('button', { name: /^Other USGS/ }).click();
  await waitForMapData(legacy, async total => (await window.plannerMap?.getSource('planner-reference-gauges')?.getData())?.features.length === total, total);
  await legacy.waitForFunction(() => { const map = window.plannerMap; if (!map || map.isMoving()) return false; map.jumpTo({ center: [-91.3, 37.1], zoom: 15 }); return true; });
  await legacy.getByRole('button', { name: 'Retry names', exact: true }).waitFor();
  assert.equal(await legacy.evaluate(async () => (await window.plannerMap.getSource('planner-reference-gauges').getData()).features.length), total, 'Failed name request keeps coverage');
  failNames = false;
  await legacy.getByRole('button', { name: 'Retry names', exact: true }).click();
  await legacy.waitForFunction(() => document.querySelector('[data-usgs-site-id="10000001"]')?.getAttribute('aria-label')?.includes('Test creek 10000001'));
  assert.equal(await legacy.evaluate(async () => (await window.plannerMap.getSource('planner-reference-gauges').getData()).features.length), total, 'Capped name response cannot drop index stations');
  // Keep mocked animation/timer APIs off the pages used for navigation and
  // screenshots. Test source stability last, in this disposable context.
  await legacy.clock.install();
  await legacy.evaluate(() => {
    const source = window.plannerMap.getSource('planner-reference-gauges');
    const original = source.setData.bind(source);
    window.referenceSourceUpdates = 0;
    source.setData = (...args) => { window.referenceSourceUpdates++; return original(...args); };
  });
  await legacy.clock.fastForward(61_000);
  assert.equal(await legacy.evaluate(() => window.referenceSourceUpdates), 0, 'A minute without freshness changes does not rebuild the national source');
  await legacy.close();
  console.log('Legacy migration, failed/capped viewport enrichment, and unchanged-minute source identity passed');
}
