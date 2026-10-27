import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { ANALYTICS_OPT_OUT_KEY, analyticsTrackingId, initializeAnalytics, trackEvent, trackPageView, trackNavigationClick } from './analytics';

const trackingId = 'G-TEST123';

test('only production builds with a valid GA4 ID enable website analytics', () => {
  const env = { NODE_ENV: 'production', NEXT_PUBLIC_GA_ID: trackingId };
  assert.equal(analyticsTrackingId(env), trackingId);
  assert.equal(analyticsTrackingId({ ...env, VERCEL_ENV: 'production' }), trackingId);
  for (const NODE_ENV of ['development', 'test', undefined]) {
    assert.equal(analyticsTrackingId({ ...env, NODE_ENV }), undefined);
  }
  for (const VERCEL_ENV of ['preview', 'development']) {
    assert.equal(analyticsTrackingId({ ...env, VERCEL_ENV }), undefined);
  }
  for (const NEXT_PUBLIC_GA_ID of ['', 'UA-123-1', 'G-test', "G-TEST');alert(1)//"]) {
    assert.equal(analyticsTrackingId({ ...env, NEXT_PUBLIC_GA_ID }), undefined);
  }
  assert.equal(analyticsTrackingId({ NODE_ENV: 'production', NEXT_PUBLIC_GA_MEASUREMENT_ID: trackingId }), trackingId);
});

function browserFixture(t: TestContext, options: {
  hostname?: string;
  framed?: boolean;
  webdriver?: boolean;
  optOut?: boolean;
  storageDenied?: boolean;
} = {}) {
  const scripts: { id?: string; async?: boolean; src?: string }[] = [];
  const storage = new Map(options.optOut ? [[ANALYTICS_OPT_OUT_KEY, '1']] : []);
  const browser = {
    location: new URL(`https://${options.hostname ?? 'eddy.guide'}/dams/bull-shoals`),
    navigator: { webdriver: options.webdriver ?? false, platform: 'Linux x86_64' },
    sessionStorage: { getItem: (key: string) => {
      if (options.storageDenied) throw new Error('Storage denied');
      return storage.get(key) ?? null;
    } },
    self: {}, top: {},
    dataLayer: [] as IArguments[],
    gtag: undefined as ((...args: unknown[]) => void) | undefined,
  };
  browser.top = options.framed ? {} : browser.self;
  for (const [key, value] of Object.entries({ window: browser, document: {
    title: 'Eddy report', referrer: 'https://www.google.com/',
    createElement: (tag: string) => { assert.equal(tag, 'script'); return {}; },
    head: { appendChild: (script: (typeof scripts)[number]) => scripts.push(script) },
  } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return { browser, scripts, storage, commands: () => browser.dataLayer.map(args => Array.from(args)) };
}

test('SSR calls do not require browser globals', () => {
  assert.equal(typeof window, 'undefined');
  assert.doesNotThrow(() => initializeAnalytics(trackingId));
  assert.doesNotThrow(() => trackEvent('app_store_click'));
  assert.doesNotThrow(() => trackPageView());
  assert.doesNotThrow(() => trackNavigationClick(null));
});

for (const options of [
  { hostname: 'localhost' }, { hostname: '127.0.0.1' },
  { hostname: 'eddy-preview.vercel.app' }, { hostname: 'eddy.guide.example.com' },
  { framed: true }, { webdriver: true }, { optOut: true },
]) {
  test(`excluded context sends no analytics: ${JSON.stringify(options)}`, t => {
    const fixture = browserFixture(t, options);
    initializeAnalytics(trackingId);
    trackEvent('app_store_click', { label: 'dam' });
    trackPageView();
    assert.deepEqual(fixture.scripts, []);
    assert.deepEqual(fixture.commands(), []);
    assert.equal(fixture.browser.gtag, undefined);
  });
}

test('missing or invalid IDs never load the Google script', t => {
  const fixture = browserFixture(t);
  for (const id of [undefined, '', 'UA-123-1', 'G-invalid']) initializeAnalytics(id);
  trackEvent('app_store_click');
  trackPageView();
  assert.deepEqual(fixture.scripts, []);
  assert.deepEqual(fixture.commands(), []);
});

for (const options of [{}, { hostname: 'www.eddy.guide' }, { storageDenied: true }]) {
  test(`ordinary visitors initialize once and retain event parameters: ${JSON.stringify(options)}`, t => {
    const fixture = browserFixture(t, options);
    initializeAnalytics(trackingId);
    initializeAnalytics(trackingId); // Strict Mode/remount
    fixture.browser.location.pathname = '/app';
    initializeAnalytics(trackingId); // navigation/campaign change must not reconfigure GA
    const params = { label: 'dam_cta', page_path: '/app', app_campaign: 'website_download', transport_type: 'beacon' };
    trackEvent('app_store_click', params);
    trackEvent('plan_shared');
    const commands = fixture.commands();
    assert.equal(commands.length, 4);
    assert.equal(commands[0][0], 'js');
    assert.ok(commands[0][1] instanceof Date);
    assert.deepEqual(commands.slice(1), [
      ['config', trackingId, { send_page_view: false }],
      ['event', 'app_store_click', params],
      ['event', 'plan_shared', {}],
    ]);
    assert.deepEqual(fixture.scripts, [{ id: 'eddy-google-analytics', async: true, src: `https://www.googletagmanager.com/gtag/js?id=${trackingId}` }]);
    fixture.storage.set(ANALYTICS_OPT_OUT_KEY, '1');
    if (!options.storageDenied) {
      trackEvent('app_store_click');
      assert.deepEqual(fixture.commands(), commands, 'new custom events respect QA opt-out immediately; auto events require a reload');
    }
  });
}

test('page views count paths once, ignore state changes, and retain campaign and referrer', t => {
  const fixture = browserFixture(t);
  const views = () => fixture.commands().filter(command => command[0] === 'event' && command[1] === 'page_view');
  fixture.browser.location.href = 'https://eddy.guide/rivers?utm_source=partner&utm_medium=referral';
  initializeAnalytics(trackingId);
  trackPageView();
  initializeAnalytics(trackingId);
  trackPageView(); // remount
  for (const query of ['?q=b', '?q=bu', '?q=bull', '?kind=dams', '?kind=dams#reports']) {
    fixture.browser.location.href = 'https://eddy.guide/rivers' + query;
    trackPageView();
  }
  assert.equal(views().length, 1);
  assert.deepEqual(views()[0][2], {
    page_path: '/rivers',
    page_location: 'https://eddy.guide/rivers?utm_source=partner&utm_medium=referral',
    page_title: 'Eddy report',
    page_referrer: 'https://www.google.com/',
  });
  fixture.browser.location.href = 'https://eddy.guide/plan?river=current';
  trackPageView();
  for (const query of ['?river=current&lat=36&lng=-93&z=7', '?river=current&putIn=one&takeOut=two']) {
    fixture.browser.location.href = 'https://eddy.guide/plan' + query;
    trackPageView();
  }
  assert.equal(views().length, 2);
  assert.equal((views()[1][2] as Record<string, unknown>).page_referrer, 'https://eddy.guide/rivers?utm_source=partner&utm_medium=referral');
  fixture.browser.location.href = 'https://eddy.guide/rivers?kind=dams';
  trackPageView(); // Back to another path counts.
  fixture.browser.location.href = 'https://eddy.guide/plan?river=current';
  trackPageView(); // Forward counts.
  assert.deepEqual(views().map(command => (command[2] as Record<string, unknown>).page_path), ['/rivers', '/plan', '/rivers', '/plan']);
  assert.equal((views()[3][2] as Record<string, unknown>).page_referrer, 'https://eddy.guide/rivers?kind=dams');
});

test('a skipped page view does not advance the last measured page', t => {
  const fixture = browserFixture(t);
  trackPageView(); // not initialized yet
  initializeAnalytics(trackingId);
  trackPageView();
  fixture.browser.location.href = 'https://eddy.guide/app?ct=partner';
  fixture.storage.set(ANALYTICS_OPT_OUT_KEY, '1');
  const before = fixture.commands();
  trackPageView();
  assert.deepEqual(fixture.commands(), before);
  fixture.storage.delete(ANALYTICS_OPT_OUT_KEY);
  trackPageView();
  const last = fixture.commands().at(-1)!;
  assert.equal(last[1], 'page_view');
  assert.equal((last[2] as Record<string, unknown>).page_path, '/app');
  assert.equal((last[2] as Record<string, unknown>).page_referrer, 'https://eddy.guide/dams/bull-shoals');
});
