import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolveAppStoreConfig, appStoreUrl, appLandingUrl, campaignToken, smartBannerContent, DEFAULT_APP_STORE_URL } from './app-discovery';
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
    assert.equal(redirectSystemPath({ path: argument, initial: true }), `/(tabs)/(today)${path}`);
  }
  assert.equal(redirectSystemPath({ path: 'eddy:///reports', initial: true }), '/reports');
});
