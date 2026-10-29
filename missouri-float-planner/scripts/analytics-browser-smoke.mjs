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
        ['config', 'G-FIXTURE123', { send_page_view: false }],
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

  // Replay the URL changes used by search and maps. This deliberately calls
  // the public page-view function after every change, a stronger dedupe check
  // than the listener's pathname-only effect. No Google request is sent.
  {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    await context.route('**/*', async route => {
      if (route.request().isNavigationRequest()) {
        await route.fulfill({ contentType: 'text/html', body: fixture });
      } else {
        await route.fulfill({ contentType: 'application/javascript', body: '// Google collection disabled in fixture' });
      }
    });
    try {
      const page = await context.newPage();
      await page.goto('https://eddy.guide/fixture', { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        history.replaceState({}, '', '/rivers?utm_source=partner');
        document.title = 'Conditions';
        window.analytics.trackPageView();
        window.analytics.trackPageView();
        for (const q of ['b', 'bu', 'bul', 'bull']) {
          history.replaceState({}, '', '/rivers?q=' + q);
          window.analytics.trackPageView();
        }
        history.pushState({}, '', '/rivers?kind=dams');
        window.analytics.trackPageView();
        history.pushState({}, '', '/plan?river=current');
        document.title = 'Plan a float';
        window.analytics.trackPageView();
        history.replaceState({}, '', '/plan?river=current&lat=36.3&lng=-93&z=7');
        window.analytics.trackPageView();
        history.replaceState({}, '', '/plan?river=current&putIn=one&takeOut=two');
        window.analytics.trackPageView();
        window.addEventListener('popstate', () => window.analytics.trackPageView());
      });
      await page.goBack();
      await page.waitForFunction(() => location.pathname === '/rivers');
      await page.goForward();
      await page.waitForFunction(() => location.pathname === '/plan');
      const views = await page.evaluate(() => window.dataLayer.map(args => Array.from(args)).filter(command => command[1] === 'page_view').map(command => command[2]));
      assert.deepEqual(views.map(view => view.page_path), ['/rivers', '/plan', '/rivers', '/plan']);
      assert.equal(views[0].page_location, 'https://eddy.guide/rivers?utm_source=partner');
      assert.equal(views[1].page_referrer, views[0].page_location);
      assert.equal(views[2].page_referrer, views[1].page_location);

      await page.evaluate(() => {
        document.body.innerHTML = '<nav data-ga-navigation="header_desktop"><a href="/rivers?kind=dams"><span>Conditions</span></a><a data-ga-event="app_landing_click" href="/app">Get the App</a></nav><nav data-ga-navigation="header_mobile"><a href="/plan?river=current"><span>Map</span></a></nav><nav data-ga-navigation="section"><a href="/find-float">Find a float</a></nav><footer data-ga-navigation="footer"><a href="/dams">Lakes &amp; Dams</a><a href="https://outside.example">Social</a></footer><a href="/privacy">Outside menu</a><button>Open menu</button>';
        document.addEventListener('click', event => {
          event.preventDefault();
          window.analytics.trackNavigationClick(event.target);
        }, true);
      });
      await page.getByText('Conditions', { exact: true }).click();
      await page.getByText('Map', { exact: true }).click();
      await page.getByText('Find a float', { exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.getByText('Lakes & Dams', { exact: true }).click();
      await page.getByText('Get the App', { exact: true }).click();
      await page.getByText('Social', { exact: true }).click();
      await page.getByText('Outside menu', { exact: true }).click();
      await page.getByRole('button', { name: 'Open menu' }).click();
      const navigation = await page.evaluate(() => window.dataLayer.map(args => Array.from(args)).filter(command => command[1] === 'navigation_click').map(command => command[2]));
      assert.deepEqual(navigation, [
        { label: 'Conditions', placement: 'header_desktop', destination_path: '/rivers', page_path: '/plan' },
        { label: 'Map', placement: 'header_mobile', destination_path: '/plan', page_path: '/plan' },
        { label: 'Find a float', placement: 'section', destination_path: '/find-float', page_path: '/plan' },
        { label: 'Lakes & Dams', placement: 'footer', destination_path: '/dams', page_path: '/plan' },
      ]);
      console.log('PASS page views ignore search/filter/camera/endpoint changes; Back/Forward and scoped navigation clicks work.');
    } finally {
      await context.close();
    }
  }

  console.log('PASS real browser frame/host/automation guards and single initialization. GA4 automatic history tracking must be disabled before rollout.');
} finally {
  await browser.close();
}
