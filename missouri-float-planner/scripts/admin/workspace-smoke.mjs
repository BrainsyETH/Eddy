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
    executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
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
      if (request.postDataJSON().password === 'wrong-password')
        return reply({ error: 'Invalid password' }, 401);
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
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Invalid password', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Check connection again' }).count(),
    0,
  );
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
  const historyBeforeSearch = await page.evaluate(() => history.length);
  await page.getByPlaceholder('Search...').pressSequentially('Buffalo');
  assert.equal(await page.evaluate(() => history.length), historyBeforeSearch);
  await page.getByRole('combobox').first().selectOption('pending');
  assert.equal(
    await page.evaluate(() => history.length),
    historyBeforeSearch + 1,
  );
  await page.goBack();
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
  const reportButton = page.getByRole('button', {
    name: /Hazard Buffalo River/,
  });
  await reportButton.focus();
  await page.keyboard.press('Enter');
  assert.equal(await reportButton.getAttribute('aria-expanded'), 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await reportButton.click();
  await page.waitForFunction(
    () => document.activeElement?.id === 'report-detail',
  );
  assert.ok(
    await page
      .locator('#report-detail')
      .evaluate(
        (el) =>
          el.getBoundingClientRect().top >= 0 &&
          el.getBoundingClientRect().top < innerHeight,
      ),
  );
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
  await checkAccessChanges(browser, origin, post, reports);
  assert.deepEqual(pageErrors, []);
  console.log(
    'PASS: direct subpage login, save conflict, discard, session renewal, search history, scoped selections, responsive detail focus, mobile drawer, role changes, revocation, sign-out and network recovery.',
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await writeFile(out + '/server.log', log);
}

// Browser fixtures exercise the UI; real permission enforcement is also covered
// by workspace.test.ts/admin-auth.test.ts and still requires a staging role pass.
async function checkAccessChanges(browser, origin, post, reports) {
  for (const initialRole of ['owner', 'editor', 'moderator']) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let role = initialRole,
      revoked = false,
      signedOut = false,
      deletedImage = false;
    const identity = () => ({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Named administrator',
      role,
      legacy: false,
    });
    const imagePath = 'blog/1730000000-photo.jpg';
    await context.route('**/api/admin/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const reply = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      if (path === '/api/admin/session' && request.method() === 'DELETE') {
        signedOut = true;
        return reply(
          {
            error: 'This account no longer has admin access.',
            reason: 'access-revoked',
          },
          403,
        );
      }
      if (revoked)
        return reply(
          {
            error: 'This account no longer has admin access.',
            reason: 'access-revoked',
          },
          403,
        );
      if (signedOut) return reply({ error: 'Unauthorized' }, 401);
      if (path === '/api/admin/session') return reply({ identity: identity() });
      if (path === '/api/admin/stats') return reply({ stats: {} });
      if (path === '/api/admin/team' && request.method() === 'PUT') {
        role = request.postDataJSON().role;
        return reply({ auditRecorded: true });
      }
      if (path === '/api/admin/team')
        return reply({
          recoveryEnabled: false,
          members: [
            {
              user_id: identity().id,
              name: identity().name,
              email: 'owner@example.invalid',
              role,
              active: true,
              updated_at: '2026-11-10T12:00:00Z',
            },
          ],
        });
      if (path === '/api/admin/blog') {
        if (role === 'moderator')
          return reply(
            {
              error: 'Your role cannot perform this action.',
              reason: 'role-forbidden',
              identity: identity(),
            },
            403,
          );
        return reply({ posts: [post] });
      }
      if (path === `/api/admin/blog/${post.id}`) return reply({ post });
      if (path === '/api/admin/reports')
        return reply({ reports, total: reports.length });
      if (
        path === `/api/admin/images/${encodeURIComponent(imagePath)}` &&
        request.method() === 'DELETE'
      ) {
        assert.equal(role, 'editor');
        deletedImage = true;
        return reply({ success: true });
      }
      if (path === '/api/admin/images')
        return reply({
          bucketExists: true,
          images: deletedImage
            ? []
            : [
                {
                  id: imagePath,
                  name: 'River photo',
                  url: '/favicon.ico',
                  category: 'general',
                  isSystem: false,
                },
              ],
        });
      return reply({ error: 'Unmocked admin endpoint' }, 500);
    });
    try {
      if (initialRole === 'owner') {
        await page.goto(origin + '/admin/team');
        await page.getByRole('button', { name: 'Edit access' }).click();
        await page.getByLabel('Role', { exact: true }).selectOption('editor');
        await page.getByRole('button', { name: 'Save access' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByText(/You will lose owner controls/).waitFor();
        await dialog.getByRole('button', { name: 'Change my access' }).click();
        await page
          .getByRole('heading', {
            name: 'This page isn’t available to your role',
          })
          .waitFor();
        assert.equal(
          await page
            .getByRole('link', { name: 'Team & access', exact: true })
            .count(),
          0,
        );
        role = 'moderator';
      } else if (initialRole === 'editor') {
        await page.goto(origin + '/admin/images');
        const category = page.getByRole('button', {
          name: 'Rivers',
          exact: true,
        });
        await category.hover();
        // Wait for transition-colors to finish before measuring hover contrast.
        await page.waitForFunction(
          (el) => getComputedStyle(el).backgroundColor === 'rgb(229, 236, 234)',
          await category.elementHandle(),
        );
        assert.deepEqual(
          await category.evaluate((el) => ({
            background: getComputedStyle(el).backgroundColor,
            text: getComputedStyle(el).color,
          })),
          { background: 'rgb(229, 236, 234)', text: 'rgb(22, 63, 73)' },
        );
        await page.getByTitle('Delete', { exact: true }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Continue', exact: true })
          .click();
        await page.getByText('No images found in this category.').waitFor();
        assert.equal(deletedImage, true);
        // A different owner changes our role while this tab remains open.
        role = 'moderator';
        await page
          .getByRole('link', { name: 'Blog & river guides', exact: true })
          .click();
        await page
          .getByRole('heading', {
            name: 'This page isn’t available to your role',
          })
          .waitFor();
        assert.equal(
          await page
            .getByRole('link', { name: 'Blog & river guides', exact: true })
            .count(),
          0,
        );
      }
      await page.goto(origin + '/admin/reports');
      await page
        .getByRole('checkbox', { name: 'Select report for Current River' })
        .waitFor();
      await page.evaluate(() =>
        sessionStorage.setItem('eddy-admin-draft:test', 'private draft'),
      );
      revoked = true;
      await page.getByPlaceholder('Search...').fill('Current');
      await page
        .getByText('This account no longer has admin access.', { exact: true })
        .waitFor();
      assert.equal(await page.locator('.admin-workspace').count(), 0);
      assert.equal(
        await page.evaluate(() =>
          sessionStorage.getItem('eddy-admin-draft:test'),
        ),
        null,
      );
      assert.equal(
        await page
          .getByRole('button', { name: 'Check connection again' })
          .count(),
        0,
      );
      await page.reload();
      await page
        .getByText('This account no longer has admin access.', { exact: true })
        .waitFor();
      revoked = false;
      await page.reload();
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Sign out', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Sign in', exact: true })
        .waitFor();
      assert.equal(await page.getByText(/Sign-out did not finish/).count(), 0);
      assert.deepEqual(errors, []);
    } catch (error) {
      await page
        .screenshot({
          path: `${out}/access-${initialRole}-failure.png`,
          fullPage: true,
        })
        .catch(() => {});
      await writeFile(
        `${out}/access-${initialRole}-failure.html`,
        await page.content(),
      );
      throw error;
    } finally {
      await context.close();
    }
  }
}
