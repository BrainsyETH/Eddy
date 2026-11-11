// Inbox (feedback + inbound email) journeys with local fixtures; no production writes.
// Run after workspace-smoke.mjs via `npm run test:admin-browser`.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const port = 3153;
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
const feedbackItem = (n, extra = {}) => ({
  id: uuid(n),
  feedbackType: 'inaccurate_data',
  userName: null,
  userEmail: `paddler${n}@example.com`,
  message: `Feedback message ${n}`,
  imageUrl: null,
  contextType: null,
  contextId: null,
  contextName: null,
  contextData: null,
  status: 'pending',
  adminNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-11-10T12:00:00Z',
  updatedAt: '2026-11-10T12:00:00Z',
  ...extra,
});
const emailItem = (n) => ({
  id: uuid(1000 + n),
  resendEmailId: `re_${n}`,
  messageId: null,
  fromAddress: `sender${n}@example.com`,
  toAddresses: ['hello@eddy.guide'],
  ccAddresses: [],
  receivedFor: ['hello@eddy.guide'],
  subject: `Email subject ${n}`,
  textBody: `Email body ${n}`,
  htmlBody: null,
  attachments: [],
  bodyFetched: true,
  status: 'unread',
  lastRepliedAt: null,
  resendCreatedAt: '2026-11-10T12:00:00Z',
  createdAt: '2026-11-10T12:00:00Z',
  updatedAt: '2026-11-10T12:00:00Z',
});

try {
  await mkdir(out, { recursive: true });
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(origin + '/admin/feedback', { signal: AbortSignal.timeout(10000) })).status < 500) break;
    } catch {}
    if (i === 89) throw Error('Dev server did not become ready');
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const run = async (viewport, label) => {
    // Fresh fixtures per run. 51 pending items: a fixed 100-row cap used to
    // hide everything past it; the server holds more unread mail than shown.
    const photoReportId = '33333333-3333-4333-8333-333333333333';
    const photoReport = {
      id: photoReportId,
      riverName: 'Current River',
      type: 'river_visual',
      description: 'Gravel bar',
      status: 'verified',
      imageUrl: null,
      coordinates: null,
      createdAt: '2026-11-09T12:00:00Z',
      updatedAt: '2026-11-09T12:00:00Z',
      userId: null,
    };
    const reportWrites = [];
    // Older than every other item: before pinning it sat on the last page.
    const feedback = [
      ...Array.from({ length: 51 }, (_, i) => feedbackItem(i + 1)),
      feedbackItem(99, {
        feedbackType: 'objectionable_content',
        message: 'This photo shows a person',
        contextType: 'river',
        contextName: 'Current River',
        contextData: { visualId: photoReportId, imageUrl: null, accessPointName: 'Akers Ferry', description: 'Gravel bar' },
        createdAt: '2026-11-01T12:00:00Z',
      }),
    ];
    const feedbackPatches = [];
    const emails = [emailItem(1), emailItem(2)];
    let serverUnread = 7;
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let signedIn = false;
    const json = (route, data, status = 200, headers = {}) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers });
    await context.route('**/api/feedback**', async (route) => {
      const url = new URL(route.request().url());
      if (!signedIn) return json(route, { error: 'Unauthorized' }, 401);
      const status = url.searchParams.get('status');
      const limit = Number(url.searchParams.get('limit'));
      const offset = Number(url.searchParams.get('offset'));
      assert.ok(limit <= 100, 'feedback page size stays bounded');
      const type = url.searchParams.get('type');
      const pinnedPhotos = url.searchParams.get('pinned') === 'photos';
      const rows = feedback.filter(
        (f) =>
          (!status || f.status === status) &&
          (!type || f.feedbackType === type) &&
          !(pinnedPhotos && f.status === 'pending' && f.feedbackType === 'objectionable_content'),
      );
      return json(route, { feedback: rows.slice(offset, offset + limit), total: rows.length });
    });
    await context.route('**/api/admin/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (path === '/api/admin/session')
        return json(
          route,
          signedIn
            ? { authenticated: true, identity: { id: null, name: 'Owner recovery', role: 'owner', legacy: true } }
            : { error: 'Unauthorized' },
          signedIn ? 200 : 401,
        );
      if (path === '/api/admin/login') {
        signedIn = true;
        const expiry = Date.now() + 4 * 3600000;
        const token = `${expiry}.${createHmac('sha256', secret).update(`admin:${expiry}`).digest('hex')}`;
        return json(route, { identity: { id: null, name: 'Owner recovery', role: 'owner', legacy: true } }, 200, {
          'Set-Cookie': `mfp_admin_session=${token}; Path=/; HttpOnly; SameSite=Strict`,
        });
      }
      if (path === '/api/admin/stats')
        return json(route, { stats: { pendingFeedback: 51, unapprovedAccessPoints: 0, openCriticalFindings: 0 } });
      if (path.startsWith('/api/admin/feedback/')) {
        const id = path.split('/').pop();
        const body = request.postDataJSON();
        feedbackPatches.push(body);
        const row = feedback.find((f) => f.id === id);
        if (body.adminNotes !== undefined) row.adminNotes = body.adminNotes.trim() || null;
        if (body.status) Object.assign(row, { status: body.status, reviewedBy: 'Owner recovery' });
        return json(route, { success: true, feedback: row });
      }
      if (path === `/api/admin/reports/${photoReportId}`) {
        if (request.method() === 'PUT') {
          reportWrites.push(request.postDataJSON());
          photoReport.status = request.postDataJSON().status;
          return json(route, { success: true });
        }
        return json(route, { report: photoReport });
      }
      if (path === '/api/admin/reports') {
        assert.equal(url.searchParams.get('id'), photoReportId, 'Reports opens the linked report only');
        return json(route, { reports: [photoReport], total: 1 });
      }
      if (path === '/api/admin/inbound-emails') {
        const status = url.searchParams.get('status');
        const rows = emails.filter((e) => !status || e.status === status);
        return json(route, { emails: rows, total: rows.length, unread: serverUnread });
      }
      if (path.startsWith('/api/admin/inbound-emails/')) {
        const id = path.split('/').pop();
        const { status } = request.postDataJSON();
        const row = emails.find((e) => e.id === id);
        if (row.status === 'unread' && status !== 'unread') serverUnread--;
        row.status = status;
        return json(route, { email: row, unread: serverUnread });
      }
      return json(route, { error: 'Unmocked admin endpoint' }, 500);
    });

    try {
      await page.goto(origin + '/admin/feedback');
      await page.getByRole('button', { name: 'Use owner recovery access' }).click();
      await page.getByLabel('Password', { exact: true }).fill('test-only-password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByText('Feedback message 1', { exact: true }).waitFor();

      // Reported photos are pinned above the list and not repeated in it.
      const pinned = page.getByRole('region', { name: /Reported photos/ });
      await pinned.getByText('This photo shows a person').waitFor();
      assert.equal(await page.getByText('This photo shows a person').count(), 1);

      // Paging: the total is shown and the 51st item is reachable.
      await page.getByText('1–50 of 51 items').waitFor();
      assert.equal(await page.getByText('Feedback message 51', { exact: true }).count(), 0);
      await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next' }).click();
      await page.getByText('Feedback message 51', { exact: true }).waitFor();
      await page.getByText('51–51 of 51 items').waitFor();

      if (label === 'desktop') {
        // Notes: a note saves on its own and does not change the status.
        await page.getByText('Feedback message 51', { exact: true }).click();
        const notes = page.getByLabel('Notes', { exact: true });
        await notes.fill('Checked the gauge; reading is right.');
        await page.getByRole('button', { name: 'Save note' }).click();
        await page.getByRole('button', { name: 'Save note' }).waitFor({ state: 'detached' });
        assert.deepEqual(feedbackPatches.at(-1), { adminNotes: 'Checked the gauge; reading is right.' });
        assert.equal(feedback[50].status, 'pending');
        assert.equal(await notes.inputValue(), 'Checked the gauge; reading is right.');
      }
      await page.screenshot({ path: `${out}/inbox-feedback-${label}.png`, fullPage: true });

      // Hide the photo from the item itself; the flag is then resolved.
      await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Previous' }).click();
      await pinned.getByText('This photo shows a person').click();
      const panel = page.getByRole('region', { name: 'Reported photo' });
      await panel.getByText('Live in the app').waitFor();
      await panel.getByText('Akers Ferry · Current River').waitFor();
      await pinned.screenshot({ path: `${out}/inbox-photo-${label}.png` });
      await panel.getByRole('button', { name: 'Hide photo' }).click();
      await panel.getByText('Hidden — in review').waitFor();
      assert.deepEqual(reportWrites, [{ status: 'pending' }]);
      await pinned.getByText('Resolved', { exact: true }).first().waitFor();
      assert.deepEqual(feedbackPatches.at(-1), { status: 'resolved' });
      await panel.getByRole('link', { name: 'Open in Reports' }).click();
      await page.waitForURL(`**/admin/reports?id=${photoReportId}`);
      await page.getByText('Showing one linked report.').waitFor();
      await page.goto(origin + '/admin/feedback');
      await page.getByText('Feedback message 1', { exact: true }).waitFor();

      // Email badge follows the server's unread count, not the rows on screen.
      await page.getByRole('button', { name: /Inbound Email/ }).click();
      await page.getByText('Email subject 1', { exact: true }).waitFor();
      const tab = page.getByRole('button', { name: /Inbound Email/ });
      assert.equal(await tab.locator('span').innerText(), String(serverUnread));
      if (label === 'desktop') {
        await page.getByText('Email subject 1', { exact: true }).click();
        await page.getByRole('button', { name: 'Read', exact: true }).click();
        await page.getByText('Email subject 1', { exact: true }).waitFor({ state: 'detached' });
        assert.equal(serverUnread, 6);
        assert.equal(await tab.locator('span').innerText(), '6', 'badge shows the server count after triage');
        await page.getByText('1–1 of 1 messages').waitFor();
      }
      await page.screenshot({ path: `${out}/inbox-email-${label}.png`, fullPage: true });
      assert.deepEqual(errors, []);
    } catch (error) {
      await page.screenshot({ path: `${out}/inbox-${label}-failure.png`, fullPage: true }).catch(() => {});
      await writeFile(`${out}/inbox-${label}-failure.html`, await page.content()).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  };
  await run({ width: 1440, height: 1000 }, 'desktop');
  await run({ width: 390, height: 844 }, 'mobile');
  console.log('Inbox smoke passed');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
