// Authenticated UI regression journeys with local fixtures; no production writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const origin = 'http://127.0.0.1:3152';
const out = process.env.ADMIN_SMOKE_OUTPUT || '/tmp/eddy-admin-smoke';
const secret = 'admin-smoke-local-only';
let log = '',
  browser;
const server = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    'dev',
    '--webpack',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3152',
  ],
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
server.stdout.on('data', (chunk) => {
  log += chunk;
  process.stdout.write(chunk);
});
server.stderr.on('data', (chunk) => {
  log += chunk;
  process.stderr.write(chunk);
});
try {
  await mkdir(out, { recursive: true });
  for (let i = 0; i < 90; i++) {
    try {
      if (
        (
          await fetch(origin + '/admin/blog', {
            signal: AbortSignal.timeout(10000),
          })
        ).status < 500
      )
        break;
    } catch {}
    if (i === 89) throw Error('Dev server did not become ready');
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  let signedIn = false,
    blogRequests = 0,
    failSave = false,
    expireSave = false,
    saveCount = 0;
  const id = '11111111-1111-4111-8111-111111111111';
  const post = {
    id,
    slug: 'test-draft',
    title: 'A quiet river morning',
    description: 'A useful report',
    content: '<p>Keep this article body.</p>',
    category: 'Guides',
    featuredImageUrl: null,
    ogImageUrl: null,
    metaKeywords: [],
    readTimeMinutes: 2,
    status: 'draft',
    publishedAt: null,
    createdAt: '2026-11-01T12:00:00Z',
    updatedAt: '2026-11-10T12:00:00Z',
  };
  const reports = [
    {
      id,
      riverName: 'Current River',
      type: 'water_level',
      description: 'Clear water',
      status: 'pending',
      coordinates: { lat: 37.1, lng: -91.2 },
      createdAt: '2026-11-10T12:00:00Z',
      updatedAt: '2026-11-10T12:00:00Z',
      userId: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      riverName: 'Buffalo River',
      type: 'hazard',
      description: 'Tree across the channel',
      status: 'pending',
      coordinates: null,
      createdAt: '2026-11-10T12:00:00Z',
      updatedAt: '2026-11-10T12:00:00Z',
      userId: null,
    },
  ];
  await context.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const reply = (data, status = 200, headers = {}) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
        headers,
      });
    if (path === '/api/admin/session')
      return reply(
        signedIn
          ? {
              authenticated: true,
              identity: {
                id: null,
                name: 'Owner recovery',
                role: 'owner',
                legacy: true,
              },
            }
          : { error: 'Unauthorized' },
        signedIn ? 200 : 401,
      );
    if (path === '/api/admin/login') {
      signedIn = true;
      const expiry = Date.now() + 4 * 3600000;
      const token = `${expiry}.${createHmac('sha256', secret).update(`admin:${expiry}`).digest('hex')}`;
      return reply(
        {
          identity: {
            id: null,
            name: 'Owner recovery',
            role: 'owner',
            legacy: true,
          },
        },
        200,
        {
          'Set-Cookie': `mfp_admin_session=${token}; Path=/; HttpOnly; SameSite=Strict`,
        },
      );
    }
    if (path === '/api/admin/stats')
      return reply({
        stats: {
          pendingFeedback: 2,
          unapprovedAccessPoints: 1,
          openCriticalFindings: 0,
        },
      });
    if (path === '/api/admin/blog') {
      blogRequests++;
      return reply({ posts: [post] });
    }
    if (path === `/api/admin/blog/${id}`) {
      if (request.method() === 'GET') return reply({ post });
      saveCount++;
      if (expireSave) {
        expireSave = false;
        signedIn = false;
        return reply({ error: 'Session expired' }, 401);
      }
      if (failSave)
        return reply(
          {
            error:
              'This post changed in another session. Your draft is kept here.',
          },
          409,
        );
      const body = request.postDataJSON();
      assert.equal(body.expectedUpdatedAt, post.updatedAt);
      assert.equal(
        body.content,
        undefined,
        'untouched article body must not be rewritten',
      );
      Object.assign(post, body);
      return reply({ post });
    }
    if (path === '/api/admin/reports') {
      const q = url.searchParams.get('q');
      const status = url.searchParams.get('status');
      return reply({
        reports: reports.filter(
          (r) =>
            (!q || r.riverName.includes(q)) &&
            (!status || status === 'all' || r.status === status),
        ),
        total: q ? 1 : 2,
      });
    }
    if (path === '/api/admin/lake-launches') return route.abort('failed');
    return reply({ error: 'Unmocked admin endpoint' }, 500);
  });
  await page.goto(origin + '/admin/blog');
  await page
    .getByRole('heading', { name: 'A little work. More river.' })
    .waitFor();
  assert.equal(blogRequests, 0, 'subpage must not request data before sign-in');
  await page.getByRole('button', { name: 'Use owner recovery access' }).click();
  await page.getByLabel('Password', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .getByRole('button', { name: 'Edit A quiet river morning' })
    .click();
  await page.getByLabel('Title *', { exact: true }).fill('Changed title');
  failSave = true;
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page
    .getByText('This post changed in another session. Your draft is kept here.')
    .waitFor();
  assert.equal(
    await page.getByLabel('Title *', { exact: true }).inputValue(),
    'Changed title',
  );
  // Discard dialog is keyboard-accessible and keeps the form on cancellation.
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Keep working' }).click();
  assert.equal(
    await page.getByLabel('Title *', { exact: true }).inputValue(),
    'Changed title',
  );
  // Expired sessions renew without unmounting the form; a 401 is retried once.
  failSave = false;
  expireSave = true;
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await page.getByLabel('Password', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Draft saved.', { exact: true }).waitFor();
  assert.equal(saveCount, 3);
  await page.screenshot({ path: out + '/blog-desktop.png', fullPage: true });
  // URL-driven filters and scoped moderation selection.
  await page.goto(origin + '/admin/reports');
  await page
    .getByRole('checkbox', { name: 'Select report for Current River' })
    .check();
  await page
    .getByRole('checkbox', { name: 'Select report for Buffalo River' })
    .check();
  await page.getByPlaceholder('Search...').fill('Buffalo');
  await page.waitForURL('**q=Buffalo');
  await page.getByText('1 matching reports · 1 on this page').waitFor();
  assert.equal(
    await page
      .getByRole('checkbox', { name: 'Select report for Buffalo River' })
      .isChecked(),
    false,
  );
  await page.getByRole('button', { name: /Hazard Buffalo River/ }).click();
  await page
    .getByRole('complementary', { name: 'Report details' })
    .getByText('Tree across the channel', { exact: true })
    .waitFor();
  await page.screenshot({ path: out + '/reports-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open admin navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Admin navigation' });
  await drawer
    .getByRole('link', { name: 'Team & access' })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + '/navigation-mobile.png' });
  await page.keyboard.press('Escape');
  assert.equal(
    await page
      .getByRole('button', { name: 'Open admin navigation' })
      .getAttribute('aria-expanded'),
    'false',
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    'mobile page should not overflow',
  );
  await page.goto(origin + '/admin/lakes');
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  assert.deepEqual(pageErrors, []);
  console.log(
    'PASS: direct subpage login, save conflict, discard, session renewal, global filters, scoped selections, detail panel, mobile drawer and network recovery.',
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await writeFile(out + '/server.log', log);
}
