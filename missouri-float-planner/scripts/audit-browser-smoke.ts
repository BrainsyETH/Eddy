// Browser regression for the live-audit wrapper. Production HTML is fulfilled
// from fixtures; a recording proxy refuses every outbound connection.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, type BrowserContext } from 'playwright';
import ts from 'typescript';
import { createAuditBrowser } from './lib/audit-browser';

async function main() {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'eddy-audit-check-'));
  const source = readFileSync('src/lib/analytics.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const fixture = `<!doctype html><head></head><body><script>
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  window.analytics = {};
  (function(exports) { ${compiled} })(window.analytics);
  window.optOutAtStartup = (() => { try { return sessionStorage.getItem('eddy_analytics_disabled'); } catch { return 'denied'; } })();
  window.analytics.initializeAnalytics('G-FIXTURE123');
  window.analytics.trackPageView();
  </script></body>`;
  const proxyAttempts: string[] = [];
  const proxy = createServer((request, response) => {
    proxyAttempts.push(request.url || '');
    response.writeHead(502).end();
  });
  proxy.on('connect', (request, socket) => {
    proxyAttempts.push(request.url || '');
    socket.on('error', () => {});
    socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const proxyAddress = proxy.address();
  assert(proxyAddress && typeof proxyAddress === 'object');
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    headless: true,
    proxy: { server: `http://127.0.0.1:${proxyAddress.port}` },
  }).catch(error => { proxy.close(); throw error; });
  const run = promisify(execFile);

  async function fixtures(context: BrowserContext) {
    await context.route('https://eddy.guide/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/fixture' || url.pathname === '/missing') {
        await route.fulfill({ status: url.pathname === '/missing' ? 404 : 200, contentType: 'text/html', body: fixture });
      } else if (url.pathname === '/favicon.ico') {
        await route.fulfill({ status: 204 });
      } else if (url.pathname === '/failed') {
        await route.abort();
      } else if (url.pathname === '/ordinary-api') {
        await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
      } else {
        // Let the earlier analytics blocker handle measurement requests.
        await route.fallback();
      }
    });
  }

  try {
    const audit = await createAuditBrowser(browser, { name: 'audit-regression', baseURL: 'https://eddy.guide', outputDir });
    const context = await audit.newContext({ userAgent: 'FixtureBrowser/1.0', serviceWorkers: 'allow' });
    await fixtures(context);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://eddy.guide/fixture?token=private-value#private-fragment');
    const readState = () => page.evaluate(() => ({
      optOut: (window as unknown as { optOutAtStartup: string }).optOutAtStartup,
      commands: (window as unknown as { dataLayer?: unknown[] }).dataLayer || [],
      webdriver: navigator.webdriver,
      ua: navigator.userAgent,
    }));
    const state = await readState();
    assert.equal(state.webdriver, false, 'still excluded when automation is concealed');
    assert.equal(state.optOut, '1', 'opt-out set before page scripts');
    assert.deepEqual(state.commands, []);
    assert(state.ua.startsWith('FixtureBrowser/1.0 EddyAudit/1.0'));
    assert(state.ua.includes(audit.runId));
    await page.reload();
    assert.equal((await readState()).optOut, '1');
    const tab = await context.newPage();
    await tab.goto('https://eddy.guide/fixture');
    assert.equal(await tab.evaluate(() => sessionStorage.getItem('eddy_analytics_disabled')), '1');
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.src = '/fixture';
      document.body.append(frame);
    });
    await page.frameLocator('iframe').locator('body').waitFor({ state: 'attached' });
    const frame = page.frames().find(frame => frame.parentFrame());
    assert(frame);
    await frame.waitForFunction(() => (window as unknown as { optOutAtStartup?: string }).optOutAtStartup !== undefined);
    assert.equal(await frame.evaluate(() => sessionStorage.getItem('eddy_analytics_disabled')), '1');
    await page.evaluate(() => history.pushState({}, '', '/another-page?token=private-value'));
    assert.equal(await page.evaluate(async () => (await fetch('/ordinary-api')).status), 200);

    const collectors = [
      'https://www.google-analytics.com/g/collect?secret=private-value',
      'https://region1.google-analytics.com/g/collect',
      'https://www.googletagmanager.com/gtag/js?id=G-FIXTURE123',
      'https://analytics.google.com/g/collect',
      'https://www.google.com/ccm/collect',
      'https://eddy.guide/api/embed/impression',
      'https://eddy.guide/_vercel/insights/view',
    ];
    const failures = collectors.map(url => page.waitForEvent('requestfailed', {
      predicate: request => request.url() === url, timeout: 5000,
    }));
    await page.evaluate(async urls => {
      await Promise.all(urls.map(url => fetch(url, { mode: 'no-cors' }).catch(() => {})));
    }, collectors);
    await Promise.all(failures);
    const blockedRows = readFileSync(audit.logPath, 'utf8').trim().split('\n').map(line => JSON.parse(line))
      .filter(row => row.event === 'measurement_blocked');
    assert.deepEqual(blockedRows.map(row => row.url).sort(), collectors.map(value => {
      const url = new URL(value); return url.origin + url.pathname;
    }).sort(), 'every collector was handled by the audit blocker');
    const beaconFailed = page.waitForEvent('requestfailed', request => request.url().includes('beacon=1'));
    await page.evaluate(() => navigator.sendBeacon('https://www.google-analytics.com/g/collect?beacon=1', 'fixture'));
    await beaconFailed;

    assert.equal((await page.goto('https://eddy.guide/missing'))?.status(), 404);
    await assert.rejects(page.goto('https://eddy.guide/failed'));
    assert.deepEqual(errors, []);
    await context.close();

    // Storage restrictions must not defeat the independent network guard.
    const denied = await audit.newContext();
    await denied.addInitScript(() => Object.defineProperty(window, 'sessionStorage', {
      get() { throw new Error('Storage denied'); },
    }));
    await fixtures(denied);
    const deniedPage = await denied.newPage();
    const deniedGoogle = deniedPage.waitForEvent('requestfailed', request => request.url().includes('googletagmanager.com'));
    await deniedPage.goto('https://eddy.guide/fixture');
    await deniedGoogle;
    const collectorHosts = new Set(collectors.map(value => new URL(value).hostname));
    assert.deepEqual(proxyAttempts.filter(target => collectorHosts.has(target.split(':')[0])), [],
      'measurement requests never reach the network proxy');
    // Prove this proxy would detect an unblocked request, without forwarding it.
    await deniedPage.evaluate(() => fetch('https://unblocked.example/', { mode: 'no-cors' }).catch(() => {}));
    assert(proxyAttempts.includes('unblocked.example:443'), 'network canary reaches the rejecting proxy');
    await denied.close();
    await browser.close();

    const rawLog = readFileSync(audit.logPath, 'utf8');
    const rows = rawLog.trim().split('\n').map(line => JSON.parse(line));
    assert(rows.every(row => row.runId === audit.runId && Number.isFinite(Date.parse(row.time))));
    assert(rows.some(row => row.event === 'response' && row.status === 404));
    assert(rows.some(row => row.event === 'request_failed' && row.url.endsWith('/failed')));
    assert(rows.some(row => row.event === 'navigation' && row.url.endsWith('/another-page')));
    assert.equal(rows.at(-1).event, 'browser_closed');
    assert(!rawLog.includes('private-value') && !rawLog.includes('private-fragment'));
    console.log('PASS audit exclusion, storage-denial backup, tabs, frames, redirects, failures, and redacted visit logs.');

    // Exercise the actual CLI: explicit URLs must not crawl linked pages, and
    // HTTP errors must fail the run while still closing the browser/log.
    const visited: { url: string; ua: string }[] = [];
    const server = createServer((req, res) => {
      visited.push({ url: req.url || '/', ua: req.headers['user-agent'] || '' });
      if (req.url === '/redirect') { res.writeHead(308, { location: '/ok' }); res.end(); return; }
      res.writeHead(req.url === '/missing' ? 404 : 200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><a href="/do-not-crawl">Extra page</a>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert(address && typeof address === 'object');
      const baseURL = `http://127.0.0.1:${address.port}`;
      const options = { env: { ...process.env, BASE_URL: baseURL, EDDY_AUDIT_OUTPUT: outputDir }, timeout: 30_000 };
      const command = ['node_modules/tsx/dist/cli.mjs', 'scripts/check-dead-links.ts'];
      await run(process.execPath, [...command, '/redirect'], options);
      assert(!visited.some(row => row.url === '/do-not-crawl'));
      assert(visited.filter(row => row.url === '/redirect' || row.url === '/ok').every(row => row.ua.includes('EddyAudit/1.0')));
      await assert.rejects(run(process.execPath, [...command, '/missing'], options), { code: 1 });
      const cliLogs = readdirSync(outputDir).filter(file => file.includes('-link-check-'));
      assert.equal(cliLogs.length, 2);
      assert(cliLogs.every(file => JSON.parse(readFileSync(path.join(outputDir, file), 'utf8').trim().split('\n').at(-1)!).event === 'browser_closed'));
      const cliRows = cliLogs.flatMap(file => readFileSync(path.join(outputDir, file), 'utf8').trim().split('\n').map(line => JSON.parse(line)));
      assert(cliRows.some(row => row.event === 'response' && row.status === 308));
      assert(cliRows.some(row => row.event === 'response' && row.status === 200 && row.url.endsWith('/ok')));
      console.log('PASS targeted audit CLI, redirect identity, bounded visits, and failure cleanup.');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  } finally {
    await browser.close();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
    rmSync(outputDir, { recursive: true, force: true });
  }

}

main().catch(error => { console.error(error); process.exitCode = 1; });
