import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { shortcutCatalog, shortcutDestination } from '../../../eddy-ios/src/lib/appShortcuts';
import { coldDetailPath, DETAIL_TITLES } from '../../../eddy-ios/src/lib/tabRoutes';
import { widgetGuideSteps } from '../../../eddy-ios/src/lib/widgetOnboarding';

const now = Date.parse('2026-10-25T16:00:00Z');
const stars = [{ kind: 'river', entityId: 'white', slug: 'white-river', name: 'White River', starredAt: '2026-10-25' },
  { kind: 'gauge', entityId: 'gauge', slug: '', name: 'Gauge', starredAt: '2026-10-25' }];
const routes = [{ shortCode: 'saved123', riverSlug: 'white-river', riverName: 'White River', putInName: 'Landing', takeOutName: 'Ramp', putInId: 'a', takeOutId: 'b', savedAt: '2026-10-25', logistics: { secret: 'not exported' } }];
const request = (kind: string, entityId?: string, createdAt = now) => JSON.stringify({ version: 1, kind, entityId, createdAt });

test('shortcut catalog exports only names and identifiers for current choices', () => {
  assert.deepEqual(shortcutCatalog(stars, routes), { version: 1, rivers: [{ id: 'white', name: 'White River', subtitle: '' }], routes: [{ id: 'saved123', name: 'White River', subtitle: 'Landing → Ramp' }] });
  assert.deepEqual(shortcutCatalog([], []).routes, []);
});
test('shortcuts reuse real routes, without triggering tracking or a download', () => {
  assert.equal(shortcutDestination(request('river'), stars, routes, now), '/river/white-river');
  assert.equal(shortcutDestination(request('float'), [], [], now), '/float-mode');
  const path = shortcutDestination(request('route', 'saved123'), stars, routes, now)!;
  const url = new URL(path, 'https://eddy.guide');
  assert.equal(url.pathname, '/float-start');
  assert.deepEqual(Object.fromEntries(url.searchParams), { riverSlug: 'white-river', putInId: 'a', takeOutId: 'b', shortCode: 'saved123', step: 'summary' });
  assert.equal(shortcutDestination(request('route', 'saved123'), stars, [{ ...routes[0], putInId: undefined }], now), '/float/saved123');
});
test('removed and other-account routes cannot be reopened using stale Siri choices', () => {
  assert.equal(shortcutDestination(request('route', 'saved123'), stars, [], now), '/(tabs)/(floats)/floats');
  assert.equal(shortcutDestination(request('river', 'removed'), stars, routes, now), '/(tabs)/(favorites)/favorites');
  assert.equal(shortcutDestination(request('route'), stars, routes, now), '/(tabs)/(floats)/floats');
});
test('expired, future and malformed navigation requests are ignored', () => {
  for (const raw of ['bad', '{}', 'null', request('unknown'), request('float', undefined, now - 120001), request('float', undefined, now + 10000)]) {
    assert.equal(shortcutDestination(raw, stars, routes, now), null);
  }
});
test('saved place has a cold Favorites owner and widgets advertise the Lock Screen path', () => {
  assert.equal(DETAIL_TITLES['saved-place'], 'Saved place');
  assert.equal(coldDetailPath('/saved-place?id=access'), '/(tabs)/(favorites)/saved-place?id=access');
  assert.match(widgetGuideSteps('lock', 4)[1].detail, /rectangular River level/);
  const swift = readFileSync(new URL('../../../eddy-ios/modules/eddy-live-activity/widget/EddyConditionsWidgets.swift', import.meta.url), 'utf8');
  assert.match(swift, /supportedFamilies\(\[\.systemSmall, \.accessoryRectangular\]\)/);
  assert.match(swift, /if display.current, let direction = display.series\?\.direction/);
});
