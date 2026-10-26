import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveAppStoreConfig, appStoreUrl, appLandingUrl, appLandingContext, campaignToken, smartBannerContent, DEFAULT_APP_STORE_URL } from './app-discovery';
import { damWidgetHeadline, getDamAppPromotion } from './dam-app-promotion';
import { appDevice } from './app-device';
import { appQrImage } from './app-qr';
import { getUsaceDam } from './flow-providers/usace-registry';
import DamAppCTA from '../components/dam/DamAppCTA';
import { redirectSystemPath } from '../../../eddy-ios/app/+native-intent';
import { readAppCampaign } from '../components/AppLink';

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
  assert.deepEqual(appLandingContext({}), { dam: null, campaign: null });
});

test('promotion copy follows the supplied catalog name without a second name registry', () => {
  const html = renderToStaticMarkup(createElement(DamAppCTA, { damId: 'swl-bull-shoals-dam', damName: 'Renamed Dam' }));
  assert.match(html, /Renamed on your Home Screen\./);
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
