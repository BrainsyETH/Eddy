import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccessPointDetailResponse, MapAccessPoint } from '@eddy/types';
import {
  accessTabs,
  initialTabIndex,
} from '../../../eddy-ios/src/components/map-sheet/tabs';

// Covers eddy-ios/src/components/map-sheet/tabs.ts. The Expo app has no runner
// of its own, and this is the file that decides whether a campground gets a
// Camping tab — the case that would otherwise fail silently for every site the
// National Park Service does not run.

function point(over: Partial<MapAccessPoint> = {}): MapAccessPoint {
  return {
    id: 'ap-1',
    name: 'Akers Ferry',
    riverMile: 22.4,
    type: 'access',
    isPublic: true,
    coordinates: { lng: -91.2301, lat: 37.2789 },
    ...over,
  } as MapAccessPoint;
}

function detail(over: Record<string, unknown> = {}): AccessPointDetailResponse {
  return {
    accessPoint: {
      id: 'ap-1',
      name: 'Akers Ferry',
      npsCampground: null,
      roadSurface: [],
      amenities: [],
      nearbyServices: [],
      ...(over.accessPoint as object),
    },
    nearbyAccessPoints: [],
    gaugeStatus: null,
    ...over,
  } as unknown as AccessPointDetailResponse;
}

const pin = (layer: string) => ({ layer, id: 'access:ap-1' }) as never;

test('before the request lands there is only Overview', () => {
  // The sheet opens instantly on data the map already holds; everything else
  // qualifies later. A tab bar over one page is why this matters.
  const tabs = accessTabs(point(), null);
  assert.deepEqual(tabs.map((t) => t.key), ['overview']);
});

test('a gauge status earns the Conditions tab', () => {
  const tabs = accessTabs(point(), detail({ gaugeStatus: { level: 'good' } }));
  assert.ok(tabs.some((t) => t.key === 'conditions'));
});

test('no gauge means no Conditions tab at all', () => {
  // Absent, not present-and-empty: many put-ins genuinely have no gauge, and a
  // tab leading to "no reading" costs a swipe to learn nothing.
  const tabs = accessTabs(point(), detail());
  assert.ok(!tabs.some((t) => t.key === 'conditions'));
});

test('neighbours earn the Float trips tab', () => {
  const tabs = accessTabs(
    point(),
    detail({ nearbyAccessPoints: [{ id: 'b', direction: 'downstream' }] }),
  );
  assert.ok(tabs.some((t) => t.key === 'floats'));
});

test('a type-tagged campground earns the Camping tab', () => {
  const tabs = accessTabs(point({ types: ['access', 'campground'] }), detail());
  assert.ok(tabs.some((t) => t.key === 'camping'));
});

test('an NPS campground earns it even when the type tags do not say so', () => {
  // The leg isCampground() alone would miss. NPS sites are usually tagged, so
  // this is the failure that would have looked fine in testing.
  const tabs = accessTabs(point(), detail({ accessPoint: { npsCampground: { name: 'Pulltite' } } }));
  assert.ok(tabs.some((t) => t.key === 'camping'));
});

test('a state park campground earns it from its type tag alone', () => {
  // Meramec, Onondaga Cave, Washington: no nps_campgrounds row exists for any
  // of them, so the tag is the only thing carrying them today.
  const tabs = accessTabs(point({ type: 'campground', types: ['campground'] }), detail());
  assert.ok(tabs.some((t) => t.key === 'camping'));
});

test('an ordinary put-in gets no Camping tab', () => {
  const tabs = accessTabs(point(), detail());
  assert.ok(!tabs.some((t) => t.key === 'camping'));
});

test('Details appears only when there is something to detail', () => {
  assert.ok(!accessTabs(point(), detail()).some((t) => t.key === 'details'));
  const withRoad = detail({ accessPoint: { roadSurface: ['gravel_maintained'] } });
  assert.ok(accessTabs(point(), withRoad).some((t) => t.key === 'details'));
});

test('tab order is fixed regardless of what qualifies', () => {
  // Muscle memory across pins: Camping is inserted at its place, never
  // promoted, because position 2 meaning two different things across two taps
  // is worse than an extra swipe.
  const tabs = accessTabs(
    point({ types: ['access', 'campground'] }),
    detail({
      gaugeStatus: { level: 'good' },
      nearbyAccessPoints: [{ id: 'b', direction: 'downstream' }],
      accessPoint: { roadSurface: ['gravel_maintained'] },
    }),
  );
  assert.deepEqual(tabs.map((t) => t.key), [
    'overview',
    'conditions',
    'floats',
    'camping',
    'details',
  ]);
});

test('a late tab INSERTS rather than appending, which is why index is unsafe', () => {
  // The sheet is already open when the detail request lands, and the order is
  // fixed — so Conditions arrives to the LEFT of Camping and shifts it right.
  // A reader parked on Camping at index 1 would be handed Conditions.
  //
  // This is the reason PinSheet holds the active tab by key. If this assertion
  // ever starts failing because tabs genuinely only append, that constraint can
  // be revisited; until then it must not be.
  const before = accessTabs(point({ types: ['access', 'campground'] }), null);
  const after = accessTabs(
    point({ types: ['access', 'campground'] }),
    detail({ gaugeStatus: { level: 'good' } }),
  );
  assert.deepEqual(before.map((t) => t.key), ['overview', 'camping']);
  assert.deepEqual(after.map((t) => t.key), ['overview', 'conditions', 'camping']);

  // Camping moved. Tracking by index would have silently changed tab.
  const cameFrom = before.findIndex((t) => t.key === 'camping');
  const wentTo = after.findIndex((t) => t.key === 'camping');
  assert.notEqual(cameFrom, wentTo);
  // Tracking by key still resolves to the tab the reader was actually on.
  assert.equal(after[wentTo].key, before[cameFrom].key);
});

test('tapping a tent lands on Camping, tapping a put-in lands on Overview', () => {
  // The same access point, presented through two layers. RiverMap keeps the
  // canonical access:{id} identity either way, so the layer is the only record
  // of which icon the finger hit.
  const tabs = accessTabs(point({ types: ['access', 'campground'] }), detail());
  assert.equal(tabs[initialTabIndex(tabs, pin('campgrounds'))].key, 'camping');
  assert.equal(tabs[initialTabIndex(tabs, pin('access'))].key, 'overview');
});

test('a tent pin whose Camping tab has not qualified yet lands on Overview', () => {
  // The window before the request settles. Must not index past the end.
  const tabs = accessTabs(point(), null);
  assert.equal(initialTabIndex(tabs, pin('campgrounds')), 0);
});
