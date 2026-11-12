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

  console.log('Places smoke passed');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
