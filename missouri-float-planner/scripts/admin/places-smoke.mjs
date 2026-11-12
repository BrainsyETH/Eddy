// Places & conditions journeys (gauges, hazards, access points, geography) with
// local fixtures; no production writes. Run by `npm run test:admin-browser`.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const port = 3154;
const origin = `http://127.0.0.1:${port}`;
const out = process.env.ADMIN_SMOKE_OUTPUT || '/tmp/eddy-admin-smoke';
const secret = 'admin-smoke-local-only';
let browser;
const server = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    env: {
      ...process.env,
      ADMIN_API_SECRET: secret,
      ADMIN_PASSWORD: 'test-only-password',
      NEXT_PUBLIC_SUPABASE_URL: 'https://admin-fixture.invalid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
server.stdout.on('data', (c) => process.stdout.write(c));
server.stderr.on('data', (c) => process.stderr.write(c));

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const json = (route, data, status = 200, headers = {}) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers });

/** Open a signed-in page. `handle(route, { path, url, request })` mocks /api/admin/** and returns json(...) when it answers. */
async function session(viewport, handle) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let signedIn = false;
  const identity = { id: null, name: 'Owner recovery', role: 'owner', legacy: true };
  await context.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/admin/session')
      return json(route, signedIn ? { authenticated: true, identity } : { error: 'Unauthorized' }, signedIn ? 200 : 401);
    if (path === '/api/admin/login') {
      signedIn = true;
      const expiry = Date.now() + 4 * 3600000;
      const token = `${expiry}.${createHmac('sha256', secret).update(`admin:${expiry}`).digest('hex')}`;
      return json(route, { identity }, 200, {
        'Set-Cookie': `mfp_admin_session=${token}; Path=/; HttpOnly; SameSite=Strict`,
      });
    }
    if (path === '/api/admin/stats')
      return json(route, { stats: { pendingFeedback: 0, unapprovedAccessPoints: 1, openCriticalFindings: 0 } });
    // A handler returns the fulfill() promise when it answers, nothing otherwise.
    const handled = handle(route, { path, url, request });
    if (handled === undefined) return json(route, { error: `Unmocked admin endpoint ${path}` }, 500);
    return handled;
  });
  const signIn = async (to) => {
    await page.goto(origin + to);
    await page.getByRole('button', { name: 'Use owner recovery access' }).click();
    await page.getByLabel('Password', { exact: true }).fill('test-only-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  };
  return { context, page, errors, signIn };
}

async function journey(name, viewports, run) {
  for (const [label, viewport] of Object.entries(viewports)) {
    const s = await session(viewport, run.mock(label));
    try {
      await run.steps({ ...s, label });
      assert.deepEqual(s.errors, [], `${name} ${label}: no page errors`);
    } catch (error) {
      await s.page.screenshot({ path: `${out}/places-${name}-${label}-failure.png`, fullPage: true }).catch(() => {});
      await writeFile(`${out}/places-${name}-${label}-failure.html`, await s.page.content()).catch(() => {});
      throw error;
    } finally {
      await s.context.close();
    }
  }
}
const BOTH = { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } };
/** Per-journey fixture state, reset by each mock(). */
const state = {};

try {
  await mkdir(out, { recursive: true });
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(origin + '/admin/gauges', { signal: AbortSignal.timeout(10000) })).status < 500) break;
    } catch {}
    if (i === 89) throw Error('Dev server did not become ready');
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // ── Gauges: printed ranges follow the real classifier, live with edits ──
  await journey('gauges', BOTH, {
    mock: () => {
      const gauge = {
        id: uuid(1),
        usgsSiteId: '07067000',
        name: 'Current River at Van Buren',
        active: true,
        thresholdDescriptions: null,
        notes: null,
        latestReading: { gaugeHeightFt: 3.4, dischargeCfs: 1450, readingTimestamp: '2026-11-11T18:00:00Z' },
        riverAssociations: [
          {
            id: uuid(2), riverId: uuid(3), riverName: 'Current River', riverSlug: 'current', isPrimary: true,
            thresholdUnit: 'ft', levelTooLow: 1, levelLow: 2, levelOptimalMin: 3, levelOptimalMax: 4, levelHigh: 6,
            levelDangerous: 8, altLevelTooLow: null, altLevelLow: null, altLevelOptimalMin: null,
            altLevelOptimalMax: null, altLevelHigh: null, altLevelDangerous: null,
            distanceFromSectionMiles: null, accuracyWarningThresholdMiles: 0,
          },
        ],
      };
      return (route, { path }) => {
        if (path === '/api/admin/gauges') return json(route, { gauges: [gauge], rivers: [] });
      };
    },
    steps: async ({ page, signIn, label }) => {
      await signIn('/admin/gauges');
      await page.getByRole('heading', { name: 'Current River at Van Buren' }).click();
      // High is graded from just above Optimal Max (4), not from the High field (6).
      await page.getByText('> 4.00 to < 8.00 ft').waitFor();
      await page.getByText('3.00 to 4.00 ft').waitFor();
      await page.getByText('≥ 8.00 ft').waitFor();
      await page.getByText(/High is set to 6 ft here, but readings count as High from just above 4\s+ft\./).waitFor();
      await page.screenshot({ path: `${out}/places-gauges-${label}.png`, fullPage: true });
      // The ranges follow unsaved edits.
      await page.locator('label:text-is("Optimal Max (ft)") + input').fill('5');
      await page.getByText('> 5.00 to < 8.00 ft').waitFor();
      await page.getByText('3.00 to 5.00 ft').waitFor();
      // With Optimal Max blank the High field takes over, and the warning goes.
      await page.locator('label:text-is("Optimal Max (ft)") + input').fill('');
      await page.getByText('> 6.00 to < 8.00 ft').waitFor();
      assert.equal(await page.getByText(/High is set to/).count(), 0);
    },
  });

  // ── Hazards: edit, confirm, retire; no crash without a location ──
  await journey('hazards', BOTH, {
    mock: () => {
      const river = { id: uuid(3), name: 'Current River' };
      const hazard = (n, extra) => ({
        id: uuid(10 + n), riverId: river.id, riverName: river.name, name: `Hazard ${n}`, type: 'strainer',
        description: 'Tree across the channel', severity: 'caution', portageRequired: false, portageSide: null,
        active: true, seasonalNotes: null, minSafeLevel: null, maxSafeLevel: null, latitude: 37.1, longitude: -91.2,
        riverMileDownstream: 12.5, createdAt: '2026-01-05T12:00:00Z', updatedAt: '2026-11-11T12:00:00.000Z', ...extra,
      });
      state.hazards = [
        hazard(1, { name: 'Old dam', latitude: null, longitude: null, updatedAt: '2026-06-01T12:00:00.000Z' }),
        hazard(2, { name: 'Leaning sycamore', riverMileDownstream: null }),
      ];
      state.puts = [];
      state.lists = [];
      return (route, { path, url, request }) => {
        if (path === '/api/admin/hazards/mile-hint') {
          assert.equal(url.searchParams.get('river'), river.id);
          return json(route, {
            accessPoints: 2,
            estimate: {
              mile: 31.4, offLineMetres: 40,
              between: [
                { name: 'Akers Ferry', mile: 29.8, lat: 37, lng: -91 },
                { name: 'Pulltite', mile: 33.9, lat: 37.1, lng: -91 },
              ],
            },
          });
        }
        if (path === '/api/admin/hazards') {
          state.lists.push(Object.fromEntries(url.searchParams));
          const status = url.searchParams.get('status');
          const rows = state.hazards.filter((h) => status !== 'inactive' || !h.active);
          return json(route, { hazards: rows, total: rows.length, page: 1, limit: 50, rivers: [river] });
        }
        if (path.startsWith('/api/admin/hazards/') && request.method() === 'PUT') {
          const body = request.postDataJSON();
          const row = state.hazards.find((h) => h.id === path.split('/').pop());
          assert.equal(body.expectedUpdatedAt, row.updatedAt, 'the loaded version is sent with every write');
          state.puts.push(body);
          for (const key of ['active', 'severity', 'riverMileDownstream', 'name']) if (key in body) row[key] = body[key];
          row.updatedAt = new Date().toISOString();
          return json(route, { hazard: row });
        }
      };
    },
    steps: async ({ page, signIn, label }) => {
      await signIn('/admin/hazards');
      const oldDam = page.getByRole('button', { name: /Old dam/ });
      await oldDam.waitFor();
      // Stale and location-less: flagged on the row, and expanding it does not crash.
      await oldDam.getByText(/Checked \d+ months ago/).waitFor();
      await oldDam.click();
      await page.getByText('No location', { exact: true }).waitFor();
      await page.screenshot({ path: `${out}/places-hazards-${label}.png`, fullPage: true });
      if (label !== 'desktop') return;

      await page.getByRole('button', { name: 'Still there' }).click();
      await oldDam.getByText('Checked today').waitFor();
      assert.deepEqual(Object.keys(state.puts.at(-1)).sort(), ['confirmCurrent', 'expectedUpdatedAt']);
      await page.getByRole('button', { name: 'Retire', exact: true }).click();
      await oldDam.getByText('Retired', { exact: true }).waitFor();
      assert.equal(state.puts.at(-1).active, false);
      await page.getByRole('button', { name: 'Make active' }).waitFor();

      // Edit: estimate a river mile from access points, accept it, save.
      const sycamore = page.getByRole('button', { name: /Leaning sycamore/ });
      await sycamore.getByText('No river mile').waitFor();
      await sycamore.click();
      await page.getByText(/trip plans can’t warn about this hazard/).waitFor();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByLabel('Severity', { exact: true }).last().selectOption('danger');
      await page.getByRole('button', { name: 'Estimate from access points' }).click();
      await page.getByText(/About mile 31\.4, between Akers Ferry \(mile 29\.8\) and Pulltite \(mile 33\.9\)/).waitFor();
      await page.screenshot({ path: `${out}/places-hazards-edit-${label}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Use 31.4' }).click();
      await page.getByRole('button', { name: 'Save changes' }).click();
      await sycamore.getByText('Mile 31.4').waitFor();
      await sycamore.getByText('Danger', { exact: true }).waitFor();
      assert.equal(state.puts.at(-1).riverMileDownstream, 31.4);
      assert.equal(state.puts.at(-1).severity, 'danger');

      // A new hazard cannot be created without a river.
      await page.getByRole('button', { name: 'New hazard' }).click();
      await page.getByLabel('Name *').fill('Low bridge');
      await page.getByLabel('Latitude *').fill('37.2');
      await page.getByLabel('Longitude *').fill('-91.3');
      assert.equal(await page.getByRole('button', { name: 'Create hazard' }).isDisabled(), true);
      await page.getByLabel('River *').selectOption({ label: 'Current River' });
      assert.equal(await page.getByRole('button', { name: 'Create hazard' }).isDisabled(), false);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: 'Discard changes' }).click().catch(() => {});

      // Filters and search are applied by the server, not to the rows on screen.
      await page.getByLabel('Status', { exact: true }).selectOption('inactive');
      await page.getByText('1–1 of 1 hazards').waitFor();
      assert.equal(state.lists.at(-1).status, 'inactive');
      await page.getByLabel('Search hazards').fill('dam');
      await page.waitForFunction(() => true);
      await page.waitForTimeout(600);
      assert.equal(state.lists.at(-1).q, 'dam');
    },
  });

  // ── Access point editor: canonical public link; none while unapproved ──
  const accessPoint = (extra) => ({
    id: uuid(40), name: 'Akers Ferry', slug: 'akers-ferry', riverId: uuid(3), riverName: 'Current River',
    riverSlug: 'current', riverState: 'MO', riverMile: 29.8, type: 'access', types: ['access'], isPublic: true,
    ownership: null, description: null, parkingInfo: null, roadAccess: null, facilities: null, feeRequired: false,
    directionsOverride: null, drivingLat: null, drivingLng: null, imageUrls: [], googleMapsUrl: null, approved: true,
    roadSurface: [], parkingCapacity: null, managingAgency: null, officialSiteUrl: null, localTips: null,
    nearbyServices: [], updatedAt: '2026-11-11T12:00:00.000Z', ...extra,
  });
  await journey('access-point-link', { desktop: BOTH.desktop }, {
    mock: () => {
      state.point = accessPoint({});
      return (route, { path }) => {
        if (path === `/api/admin/access-points/${uuid(40)}`) return json(route, { accessPoint: state.point });
      };
    },
    steps: async ({ page, signIn }) => {
      await signIn(`/admin/access-points/${uuid(40)}`);
      const link = page.getByRole('link', { name: 'View public page' });
      await link.waitFor();
      assert.equal(await link.getAttribute('href'), '/rivers/missouri/current/access/akers-ferry');
      state.point = accessPoint({ approved: false });
      await page.reload();
      await page.getByText('Not approved yet, so it has no public page.').waitFor();
      assert.equal(await page.getByRole('link', { name: 'View public page' }).count(), 0);
    },
  });

  // ── Points of interest: the count is the matching total; no crash without coordinates ──
  await journey('pois', { desktop: BOTH.desktop }, {
    mock: () => (route, { path }) => {
      if (path === '/api/admin/pois')
        return json(route, {
          pois: [{ id: uuid(50), name: 'Blue Spring', slug: 'blue-spring', type: 'spring', description: null, active: false,
            latitude: null, longitude: null, riverId: null, riverName: null, riverMile: null, images: [], amenities: [], bodyText: null, source: 'manual', npsId: null, npsUrl: null,
            isOnWater: false, createdAt: '2026-01-05T12:00:00Z' }],
          rivers: [], total: 53, page: 1, limit: 50,
        });
    },
    steps: async ({ page, signIn }) => {
      await signIn('/admin/pois');
      await page.getByText('53 matching points of interest · 1 on this page').waitFor();
      await page.getByText('Blue Spring').click();
      await page.getByText('Not set').first().waitFor();
    },
  });

  console.log('Places smoke passed');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
