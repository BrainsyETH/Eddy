import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveAppStoreConfig, appStoreUrl, appLandingUrl, appLandingContext, campaignToken, smartBannerContent, DEFAULT_APP_STORE_URL } from './app-discovery';
import { DAM_APP_PROMOTIONS, damWidgetHeadline, getDamAppPromotion } from './dam-app-promotion';
import { appDevice } from './app-device';
import { appQrImage } from './app-qr';
import { getUsaceDam, hasPowerhouse } from './flow-providers/usace-registry';
import DamAppCTA from '../components/dam/DamAppCTA';
import { redirectSystemPath } from '../../../eddy-ios/app/+native-intent';
import { readAppCampaign } from '../components/AppLink';
import ReportAppCta from '../components/gauge/ReportAppCta';
import ContextAppLanding from '../components/ContextAppLanding';

test('reports offer one Read or widget invitation, and wait for the initial Read check', () => {
  for (const kind of ['river', 'gauge'] as const) {
    const destination = { kind, id: kind === 'river' ? 'current' : '07067000' };
    for (const loading of [false, true]) {
      const html = renderToStaticMarkup(createElement(ReportAppCta, { destination, hasRead: true, loading }));
      assert.match(html, new RegExp(`data-ga-label="${kind}_eddy_read"`));
      assert.match(html, /feature=read/);
      assert.doesNotMatch(html, /_widget/);
      assert.equal((html.match(/<a\s/g) ?? []).length, 1);
    }
    const fallback = renderToStaticMarkup(createElement(ReportAppCta, { destination, hasRead: false, loading: false }));
    assert.match(fallback, new RegExp(`data-app-cta="${kind}_widget"`));
    assert.doesNotMatch(fallback, /_eddy_read/);
    assert.equal(renderToStaticMarkup(createElement(ReportAppCta, { destination, hasRead: false, loading: true })), '');
  }
});

test('Read handoffs explain Premium while widget handoffs retain their own topic', () => {
  for (const kind of ['river', 'gauge'] as const) {
    const destination = { kind, id: kind === 'river' ? 'current' : '07067000' };
    const read = renderToStaticMarkup(createElement(ContextAppLanding, { destination: { ...destination, feature: 'read' }, campaign: 'partner_guide' }));
    assert.match(read, /Get Eddy’s full Read\./);
    assert.match(read, /with Eddy Premium in the iPhone app/);
    assert.match(read, /01-daily-river-report/);
    assert.match(read, /feature=read/);
    assert.doesNotMatch(read, /Home Screen widget/);
    const widget = renderToStaticMarkup(createElement(ContextAppLanding, { destination, campaign: null }));
    assert.match(widget, /Home Screen widget/);
    assert.match(widget, /08-your-rivers-at-a-glance/);
    assert.doesNotMatch(widget, /feature=read/);
  }
});

test('missing and invalid configuration always lead to the published app', () => {
  for (const env of [{}, { url: 'javascript:alert(1)', appId: 'bad' }, { url: 'https://apps.apple.com.evil.test/app/id1' }, { url: 'https://apps.apple.com/not-a-listing' }]) {
    const config = resolveAppStoreConfig(env);
    assert.equal(appStoreUrl(null, config), DEFAULT_APP_STORE_URL);
    assert.match(smartBannerContent('/reports', null, config), /app-id=6794933267/);
  }
});

test('URL overrides keep the banner ID aligned and reject another app’s campaign', () => {
  const config = resolveAppStoreConfig({ url: 'https://apps.apple.com/us/app/test/id1234', appId: '999', campaignUrl: 'https://apps.apple.com/app/id999?pt=123&ct=wrong_app' });
  assert.equal(config.appId, '1234');
  assert.equal(config.providerToken, null);
  assert.equal(appStoreUrl(null, config), 'https://apps.apple.com/us/app/test/id1234');
});

test('partner campaigns keep the real provider token through the landing and store link', () => {
  const config = resolveAppStoreConfig({ campaignUrl: `${DEFAULT_APP_STORE_URL}?pt=123456&ct=website` });
  assert.equal(appLandingUrl('partner_foo'), '/app?ct=partner_foo');
  const url = new URL(appStoreUrl('partner_foo', config));
  assert.equal(url.searchParams.get('ct'), 'partner_foo');
  assert.equal(url.searchParams.get('pt'), '123456');
  assert.match(smartBannerContent('/reports', 'partner_foo', config), /affiliate-data=pt=123456&ct=partner_foo/);
  assert.equal(new URL(appStoreUrl(null, config)).searchParams.get('ct'), 'website');
});

test('campaign input cannot inject banner directives or personal free text', () => {
  for (const value of ['x,app-id=999', '<script>', 'a'.repeat(31), ['partner_foo'], 'person@example.com', '']) {
    assert.equal(campaignToken(value), null);
    assert.equal(appLandingUrl(value as string), '/app');
  }
});

test('campaigns survive browsing and storage denial never breaks the onward link', (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const stored = new Map<string, string>();
  const location = { search: '?ct=partner_foo' };
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location, sessionStorage: storage } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  assert.equal(readAppCampaign(), 'partner_foo');
  location.search = '';
  assert.equal(readAppCampaign(), 'partner_foo');
  location.search = '?ct=spring_search';
  assert.equal(readAppCampaign(), 'spring_search');
  location.search = '?ct=bad%2Capp-id%3D123';
  assert.equal(readAppCampaign(), 'spring_search');
  storage.getItem = () => { throw new Error('Storage denied'); };
  storage.setItem = () => { throw new Error('Storage denied'); };
  location.search = '?ct=partner_bar';
  assert.equal(appLandingUrl(readAppCampaign()), '/app?ct=partner_bar');
  location.search = '';
  assert.equal(appLandingUrl(readAppCampaign()), '/app');
});

test('every contextual banner opens an existing native destination, cold and warm', () => {
  const config = resolveAppStoreConfig({});
  assert.equal(JSON.parse(readFileSync('../eddy-ios/app.json', 'utf8')).expo.scheme, 'eddy');
  for (const path of ['/river/current', '/river/current/access/akers-ferry', '/gauge/07067000', '/dam/swl-table-rock-dam', '/float/abc123']) {
    const content = smartBannerContent(path, null, config);
    const argument = content.split(', ').find(p => p.startsWith('app-argument='))!.slice('app-argument='.length);
    assert.equal(redirectSystemPath({ path: argument, initial: false }), path);
    // A float belongs to the Floats tab; every other detail opens under Today.
    const owner = path.startsWith('/float/') ? 'floats' : 'today';
    assert.equal(redirectSystemPath({ path: argument, initial: true }), `/(tabs)/(${owner})${path}`);
  }
  assert.equal(redirectSystemPath({ path: 'eddy:///reports', initial: true }), '/reports');
});

test('each promoted dam keeps its identity from the CTA through the landing banner', () => {
  for (const id of ['swl-bull-shoals-dam', 'swl-table-rock-dam', 'swl-beaver-dam']) {
    const dam = getDamAppPromotion(id)!;
    const damName = getUsaceDam(id)?.name;
    assert.ok(damName, 'promoted dam exists in the catalog');
    const html = renderToStaticMarkup(createElement(DamAppCTA, { damId: id, damName }));
    assert.ok(html.includes(damWidgetHeadline(damName)));
    const href = html.match(/href="([^"]+)"/)![1].replaceAll('&amp;', '&');
    assert.equal(href, appLandingUrl(dam.campaign, id));
    assert.match(html, /Get Eddy for iPhone/);
    assert.equal((html.match(/<a\s/g) || []).length, 1, 'one clear action');
    assert.ok(html.includes(`data-ga-dam-id="${id}"`));
    assert.match(html, /data-ga-label="dam_schedule"/);
    const params = Object.fromEntries(new URL(href, 'https://eddy.guide').searchParams);
    const context = appLandingContext(params);
    assert.equal(context.dam?.id, id);
    assert.equal(context.campaign, dam.campaign);
    const argument = smartBannerContent(context.dam!.nativePath, context.campaign)
      .split(', ').find(p => p.startsWith('app-argument='))!.slice('app-argument='.length);
    assert.equal(redirectSystemPath({ path: argument, initial: false }), `/dam/${id}`);
    assert.equal(redirectSystemPath({ path: argument, initial: true }), `/(tabs)/(today)/dam/${id}`);
    assert.equal(new URL(appStoreUrl(context.campaign)).origin, 'https://apps.apple.com');
  }
});

test('dam context does not replace partner attribution or accept arbitrary destinations', () => {
  const dam = 'swl-bull-shoals-dam';
  assert.equal(appLandingContext({ dam, ct: 'partner_foo' }).campaign, 'partner_foo');
  assert.equal(appLandingContext({ dam, ct: '<script>' }).campaign, 'dam_bull_shoals');
  for (const value of [undefined, '', ['swl-bull-shoals-dam'], '__proto__', 'constructor', '/dam/unknown', 'https://example.com', 'swl-norfork-dam']) {
    assert.equal(getDamAppPromotion(value), null);
    assert.equal(appLandingContext({ dam: value }).dam, null);
  }
  assert.equal(appLandingUrl('partner_foo', 'https://example.com'), '/app?ct=partner_foo');
  assert.equal(renderToStaticMarkup(createElement(DamAppCTA, { damId: 'swl-norfork-dam', damName: 'Norfork Dam' })), '');
  assert.deepEqual(appLandingContext({}), { dam: null, destination: null, campaign: null });
});

test('promotion copy follows the supplied catalog name without a second name registry', () => {
  const html = renderToStaticMarkup(createElement(DamAppCTA, { damId: 'swl-bull-shoals-dam', damName: 'Renamed Dam' }));
  assert.match(html, /Renamed generation on your Home Screen\./);
  assert.ok(!html.includes('Bull Shoals'));
});

test('device hints distinguish Android, iPhone, desktop-mode iPad and narrow desktop windows', () => {
  for (const [userAgent, platform, maxTouchPoints, expected] of [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5, 'ios'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'iPad', 5, 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 5, 'ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 0, 'other'],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'Linux armv8l', 5, 'android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 10, 'other'],
    ['', '', 0, 'other'],
  ] as const) assert.equal(appDevice({ userAgent, platform, maxTouchPoints }), expected);
});

test('QR handoff retains the dam and partner campaign on Eddy’s own app page', async () => {
  const { href, src } = await appQrImage('partner_guide', 'swl-bull-shoals-dam');
  assert.equal(href, 'https://eddy.guide/app?ct=partner_guide&dam=swl-bull-shoals-dam');
  assert.match(decodeURIComponent(src), /^data:image\/svg\+xml,<svg /);
  const rejected = await appQrImage('a,b', 'https://example.com');
  assert.equal(rejected.href, 'https://eddy.guide/app');
});

test('every promoted dam has a powerhouse, so the widget line can promise generation', () => {
  for (const id of Object.keys(DAM_APP_PROMOTIONS)) {
    const dam = getUsaceDam(id);
    assert.ok(dam && hasPowerhouse(dam), `${id} is promoted as "generation on your Home Screen" but has no powerhouse`);
  }
});

test('plan, river, gauge and access handoffs retain context through landing, banner and QR', async () => {
  const { appDestination, nativeDestination } = await import('./app-destination');
  const { GET } = await import('../app/api/app/qr/route');
  for (const [params, path] of [
    [{ plan: 'abc123' }, '/float/abc123'],
    [{ river: 'current' }, '/river/current'],
    [{ gauge: '07067000' }, '/gauge/07067000'],
    [{ river: 'current', feature: 'read' }, '/river/current'],
    [{ gauge: '07067000', feature: 'read' }, '/gauge/07067000'],
    [{ river: 'current', access: 'akers-ferry' }, '/river/current/access/akers-ferry'],
  ] as const) {
    const destination = appDestination(params)!;
    assert.equal(nativeDestination(destination), path);
    const href = appLandingUrl('partner_guide', undefined, destination);
    const query = Object.fromEntries(new URL(href, 'https://eddy.guide').searchParams);
    const context = appLandingContext(query);
    assert.deepEqual(context.destination, destination);
    assert.equal(context.campaign, 'partner_guide');
    const content = smartBannerContent(nativeDestination(context.destination!), context.campaign);
    const argument = content.split(', ').find(part => part.startsWith('app-argument='))!.slice(13);
    assert.equal(redirectSystemPath({ path: argument, initial: false }), path);
    assert.match(redirectSystemPath({ path: argument, initial: true }), new RegExp(path + '$'));
    const qr = await GET(new Request(`https://eddy.guide/api/app/qr?${new URLSearchParams(query)}`));
    assert.equal(qr.status, 200);
    assert.equal(qr.headers.get('content-type'), 'image/svg+xml');
    // Compare the actual encoded SVG with the canonical same-context URL.
    const QRCode = (await import('qrcode')).default;
    assert.equal(await qr.text(), await QRCode.toString(`https://eddy.guide${href}`, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }));
  }
});

test('handoffs reject repeated, conflicting and arbitrary destinations', async () => {
  const { GET } = await import('../app/api/app/qr/route');
  for (const params of [
    { plan: ['abc123', 'other'] }, { plan: '../escape' }, { plan: 'a'.repeat(65) },
    { river: 'https://evil.example' }, { river: 'current', gauge: '07067000' },
    { access: 'akers' }, { river: 'current', access: '/app' },
    { dam: 'swl-bull-shoals-dam', plan: 'abc123' },
    { river: 'current', feature: ['read', 'read'] }, { river: 'current', feature: 'unknown' },
    { plan: 'abc123', feature: 'read' }, { river: 'current', access: 'akers', feature: 'read' },
  ]) {
    const context = appLandingContext(params);
    assert.equal(context.destination, null);
    assert.equal(context.dam, null);
  }
  for (const query of ['plan=abc&plan=def', 'river=current&feature=read&feature=read', 'river=current&feature=unknown', 'url=https://evil.example', 'plan=..%2Fescape', 'plan=' + 'a'.repeat(513)]) {
    assert.equal((await GET(new Request(`https://eddy.guide/api/app/qr?${query}`))).status, 400);
  }
});

test('saving for the app preserves vessel and endpoints and rejects failures without inventing a link', async t => {
  const { planAppSaveRequest, savePlanForApp } = await import('./plan-app-handoff');
  const plan = {
    river: { id: 'river-id' }, putIn: { id: 'put-in' }, takeOut: { id: 'take-out' }, vessel: { id: 'kayak' },
    distance: { miles: 8 }, floatTime: { minutes: 180, timeRange: { min: 140, max: 220 } },
    condition: { code: 'good', gaugeHeightFt: 2.1, dischargeCfs: 300, gaugeName: 'Akers' },
  } as import('@/types/api').FloatPlan;
  const body = planAppSaveRequest(plan);
  assert.equal(body.vesselTypeId, 'kayak');
  assert.equal(body.startId, 'put-in');
  assert.equal(body.endId, 'take-out');
  assert.deepEqual(body.snapshot?.floatTimeRange, { min: 140, max: 220 });
  let response = new Response(JSON.stringify({ shortCode: 'abc123', url: 'https://evil.example' }));
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/plan/save');
    assert.equal(init.signal, controller.signal);
    assert.deepEqual(JSON.parse(init.body as string), body);
    return response;
  });
  assert.equal(await savePlanForApp(plan, controller.signal), 'abc123');
  response = new Response('unavailable', { status: 503 });
  await assert.rejects(savePlanForApp(plan, controller.signal));
  response = new Response(JSON.stringify({ shortCode: '../../wrong' }));
  await assert.rejects(savePlanForApp(plan, controller.signal));
});
