// Run from the web folder: npm run test:analytics-browser
// Exercises the actual analytics module in real browser contexts. Every network
// request is intercepted; no production page or Google collection is contacted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import ts from 'typescript';

const source = await readFile('src/lib/analytics.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const fixture = `<!doctype html><head></head><body><script>
window.analytics = {};
(function(exports) { ${compiled} })(window.analytics);
window.analytics.initializeAnalytics('G-FIXTURE123');
window.ready = true;
</script></body>`;
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
  headless: true,
});

try {
  async function check({ origin = 'https://eddy.guide', parent, automated = false, optOut = false }) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const googleRequests = [];
    const errors = [];
    // Playwright normally identifies as WebDriver. Override only in this fully
    // intercepted fixture to exercise the ordinary-visitor path too.
    await context.addInitScript(({ automated, optOut }) => {
      if (!automated) Object.defineProperty(navigator, 'webdriver', { get: () => false });
      if (optOut) sessionStorage.setItem('eddy_analytics_disabled', '1');
    }, { automated, optOut });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'www.googletagmanager.com') {
        googleRequests.push(url.href);
        await route.fulfill({ contentType: 'application/javascript', body: '// collection deliberately stubbed' });
      } else if (url.pathname === '/fixture') {
        await route.fulfill({ contentType: 'text/html', body: fixture });
      } else if (url.pathname === '/parent') {
        await route.fulfill({ contentType: 'text/html', body: `<iframe src="${origin}/fixture"></iframe>` });
      } else {
        throw new Error(`Unexpected fixture request: ${url}`);
      }
    });
    try {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${parent || origin}/${parent ? 'parent' : 'fixture'}`, { waitUntil: 'networkidle' });
      const frame = parent ? page.frames().find(frame => frame.parentFrame()) : page.mainFrame();
      assert(frame, 'embedded document loaded');
      await frame.waitForFunction(() => window.ready);
      const commands = await frame.evaluate(() => {
        history.pushState({}, '', '/app');
        window.analytics.initializeAnalytics('G-FIXTURE123');
        window.analytics.initializeAnalytics('G-FIXTURE123');
        window.analytics.trackEvent('app_store_click', { page_path: location.pathname, label: 'dam_cta' });
        return (window.dataLayer || []).map(args => Array.from(args));
      });
      const allowed = !parent && !automated && !optOut && ['https://eddy.guide', 'https://www.eddy.guide'].includes(origin);
      assert.equal(googleRequests.length, allowed ? 1 : 0);
      assert.deepEqual(commands.slice(1), allowed ? [
        ['config', 'G-FIXTURE123'],
        ['event', 'app_store_click', { page_path: '/app', label: 'dam_cta' }],
      ] : []);
      assert.equal(commands.length, allowed ? 3 : 0);
      assert.deepEqual(errors, []);
      console.log(`PASS ${JSON.stringify({ origin, parent, automated, optOut })}`);
    } finally {
      await context.close();
    }
  }

  for (const options of [
    {}, { origin: 'https://www.eddy.guide' },
    { parent: 'https://eddy.guide' }, { parent: 'https://partner.example' },
    { automated: true }, { optOut: true },
    { origin: 'http://localhost:3000' }, { origin: 'https://eddy-preview.vercel.app' },
  ]) await check(options);
  console.log('PASS real browser frame/host/automation guards and single initialization. Live GA4 history tracking is a deployment check.');
} finally {
  await browser.close();
}
