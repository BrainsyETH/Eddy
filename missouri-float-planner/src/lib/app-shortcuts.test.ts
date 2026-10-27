import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { shortcutCatalog, shortcutDestination, resolveShortcutRequest } from '../../../eddy-ios/src/lib/appShortcuts';
import { widgetGuideSteps } from '../../../eddy-ios/src/lib/widgetOnboarding';

const idle = { recorder: 'none', collectionsReady: true } as const;
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
  assert.equal(shortcutDestination(request('river'), stars, routes, idle, now), '/river/white-river');
  assert.equal(shortcutDestination(request('float'), [], [], idle, now), '/(tabs)/(floats)/float-home');
  const path = shortcutDestination(request('route', 'saved123'), stars, routes, idle, now)!;
  const url = new URL(path, 'https://eddy.guide');
  assert.equal(url.pathname, '/float-start');
  assert.deepEqual(Object.fromEntries(url.searchParams), { riverSlug: 'white-river', putInId: 'a', takeOutId: 'b', shortCode: 'saved123', step: 'summary' });
  assert.equal(shortcutDestination(request('route', 'saved123'), stars, [{ ...routes[0], putInId: undefined }], idle, now), '/float/saved123');
});
test('removed and other-account routes cannot be reopened using stale Siri choices', () => {
  assert.equal(shortcutDestination(request('route', 'saved123'), stars, [], idle, now), '/(tabs)/(floats)/floats');
  assert.equal(shortcutDestination(request('river', 'removed'), stars, routes, idle, now), '/(tabs)/(favorites)/favorites');
  assert.equal(shortcutDestination(request('route'), stars, routes, idle, now), '/(tabs)/(floats)/floats');
});
test('expired, future and malformed navigation requests are ignored', () => {
  for (const raw of ['bad', '{}', 'null', request('unknown'), request('float', undefined, now - 120001), request('float', undefined, now + 10000)]) {
    assert.equal(shortcutDestination(raw, stars, routes, idle, now), null);
  }
});
test('widgets advertise the Lock Screen path, station and explicit observation age', () => {
  assert.match(widgetGuideSteps('lock', 4)[1], /rectangular River level/);
  const swift = readFileSync(new URL('../../../eddy-ios/modules/eddy-live-activity/widget/EddyConditionsWidgets.swift', import.meta.url), 'utf8');
  assert.match(swift, /supportedFamilies\(\[\.systemSmall, \.accessoryRectangular\]\)/);
  assert.match(swift, /if display.current, let direction = display.series\?\.direction/);
  const lock = swift.slice(swift.indexOf('private struct LockScreenGauge'), swift.indexOf('struct EddyFavoritesWidget'));
  assert.match(lock, /Text\(choice.stationName\)/);
  assert.match(lock, /Text\(" ago"\)/);
  assert.match(lock, /accessibilityLabel\("Observed/);
});


test('both float shortcuts prioritize an active or unreadable recorder before account collections', () => {
  for (const recorder of ['active', 'unreadable'] as const) {
    for (const kind of ['float', 'route']) {
      assert.equal(shortcutDestination(request(kind, 'removed'), [], [], { recorder, collectionsReady: false }, now), '/float-mode');
    }
  }
  assert.equal(shortcutDestination(request('float'), [], [], { recorder: 'none', collectionsReady: false }, now), '/(tabs)/(floats)/float-home');
  assert.equal(shortcutDestination(request('route', 'saved123'), stars, routes, { recorder: 'loading', collectionsReady: true }, now), undefined);
  assert.equal(shortcutDestination(request('route', 'saved123'), stars, routes, { recorder: 'none', collectionsReady: false }, now), undefined);
});

test('cold route handoff waits for disk and re-reads the restored recorder', async () => {
  let release!: () => void;
  const disk = new Promise<void>(resolve => { release = resolve; });
  let restored = false; let reads = 0;
  const handoff = resolveShortcutRequest(request('route', 'saved123'), {
    restoreRecorder: async () => { await disk; restored = true; },
    read: () => { reads++; return { stars, routes, context: { recorder: restored ? 'active' : 'loading', collectionsReady: false } }; },
  }, () => now);
  await Promise.resolve(); assert.equal(reads, 0);
  release(); assert.equal(await handoff, '/float-mode');
});

test('account changes and expiry during restoration are checked before navigating', async () => {
  let currentRoutes = routes; let time = now;
  const source = {
    restoreRecorder: async () => { currentRoutes = []; },
    read: () => ({ stars, routes: currentRoutes, context: idle }),
  };
  assert.equal(await resolveShortcutRequest(request('route', 'saved123'), source, () => time), '/(tabs)/(floats)/floats');
  source.restoreRecorder = async () => { time += 120001; };
  assert.equal(await resolveShortcutRequest(request('float'), source, () => time), null);
});

test('river handoff does not read the recorder; named and default phrases both exist', async () => {
  let reads = 0;
  assert.equal(await resolveShortcutRequest(request('river', 'white'), {
    restoreRecorder: async () => { reads++; }, read: () => ({ stars, routes, context: idle }),
  }, () => now), '/river/white-river');
  assert.equal(reads, 0);
  const swift = readFileSync(new URL('../../../eddy-ios/modules/eddy-live-activity/shortcuts/EddyAppShortcuts.swift', import.meta.url), 'utf8');
  assert.ok(swift.includes('"Open my river in'));
  assert.ok(swift.includes(String.raw`"Open \(\.$river) in \(.applicationName)"`));
});
