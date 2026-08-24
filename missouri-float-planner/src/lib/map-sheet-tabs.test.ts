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

test('a gauge status earns no tab, because the reading is in the glance', () => {
  // The peek reserves a slot for the reading and fills it in place (peekSlot.ts),
  // and the peek is visible from every tab. What the Conditions tab added on top
  // was a trend, a timestamp and an "Open gauge" row duplicating the tap target
  // the reading block already was — two facts and a repeat, which is not a
  // destination. The two facts are on Overview.
  const tabs = accessTabs(point(), detail({ gaugeStatus: { level: 'good' } }));
  // Widened to string, because `key` is typed TabKey and 'conditions' has left
  // that union — a compile error there is a real signal, but it would also stop
  // this runtime assertion from ever running. Both halves matter: the union no
  // longer offers the key, and the builder no longer emits it.
  assert.ok(!tabs.some((t) => (t.key as string) === 'conditions'));
  assert.deepEqual(tabs.map((t) => t.key), ['overview']);
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
  // of them, so the tag used to be the only thing carrying them.
  const tabs = accessTabs(point({ type: 'campground', types: ['campground'] }), detail());
  assert.ok(tabs.some((t) => t.key === 'camping'));
});

test('live availability alone earns the Camping tab', () => {
  // THE THIRD LEG. A place with neither the tag nor an NPS record but with
  // real inventory Eddy can read is exactly the Missouri State Park case, and
  // it was unrepresentable while the server nested `availability` inside
  // npsCampground — such a site got the tab only when somebody had remembered
  // to tag it, while NPS sites looked fine the whole time.
  const tabs = accessTabs(
    point(),
    detail({
      accessPoint: {
        availability: { sitesOpen: 8, sitesReservable: 54, status: 'open' },
      },
    }),
  );
  assert.ok(tabs.some((t) => t.key === 'camping'));
});

test('the nested copy still earns it, for an app ahead of its deploy', () => {
  // A build cut today can be talking to a deploy that predates the sibling.
  const tabs = accessTabs(
    point(),
    detail({
      accessPoint: {
        npsCampground: { name: 'Alley Spring', availability: { sitesOpen: 8 } },
      },
    }),
  );
  assert.ok(tabs.some((t) => t.key === 'camping'));
});

test('an ordinary put-in gets no Camping tab', () => {
  const tabs = accessTabs(point(), detail());
  assert.ok(!tabs.some((t) => t.key === 'camping'));
});

test('there is no Place tab, however much there is to say about the place', () => {
  // Place merged into Overview. Its facts — road surface, parking, facilities,
  // outfitters, lodging, river notes — are all still drawn; they are drawn one
  // scroll below the description instead of one swipe sideways. See tabs.ts.
  const withEverything = detail({
    accessPoint: {
      roadSurface: ['gravel_maintained'],
      roadAccess: 'Gravel for the last two miles.',
      parkingInfo: 'Room for a dozen trailers.',
      facilities: 'Vault toilet.',
      localTips: '<p>Watch the second riffle.</p>',
      nearbyServices: [{ name: 'Akers Ferry Canoe Rental', type: 'outfitter' }],
    },
  });
  assert.deepEqual(accessTabs(point(), withEverything).map((t) => t.key), ['overview']);
});

test('the tab set is exactly overview, floats and camping', () => {
  // A guard on the union itself, so a fourth tab cannot reappear without this
  // failing and somebody rereading why the last two were removed.
  const tabs = accessTabs(
    point({ types: ['access', 'campground'] }),
    detail({
      gaugeStatus: { level: 'good' },
      nearbyAccessPoints: [{ id: 'b', direction: 'downstream' }],
      accessPoint: { roadSurface: ['gravel_maintained'] },
    }),
  );
  const keys = tabs.map((t) => t.key);
  assert.deepEqual(keys, ['overview', 'floats', 'camping']);
  assert.ok(!keys.includes('details' as never), 'the Place key is gone, not merely unlabelled');
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
    }),
  );
  assert.deepEqual(tabs.map((t) => t.key), ['overview', 'floats', 'camping']);
});

test('a late tab INSERTS rather than appending, which is why index is unsafe', () => {
  // The sheet is already open when the detail request lands, and the order is
  // fixed — so Float trips arrives to the LEFT of Camping and shifts it right.
  // A reader parked on Camping at index 1 would be handed Float trips.
  //
  // This is the reason PinSheet holds the active tab by key. Losing the
  // Conditions tab did NOT retire the hazard: any tab that qualifies late and
  // sorts before another still displaces it. If this assertion ever starts
  // failing because tabs genuinely only append, that constraint can be
  // revisited; until then it must not be.
  const before = accessTabs(point({ types: ['access', 'campground'] }), null);
  const after = accessTabs(
    point({ types: ['access', 'campground'] }),
    detail({ nearbyAccessPoints: [{ id: 'b', direction: 'downstream' }] }),
  );
  assert.deepEqual(before.map((t) => t.key), ['overview', 'camping']);
  assert.deepEqual(after.map((t) => t.key), ['overview', 'floats', 'camping']);

  // Camping moved. Tracking by index would have silently changed tab.
  const cameFrom = before.findIndex((t) => t.key === 'camping');
  const wentTo = after.findIndex((t) => t.key === 'camping');
  assert.notEqual(cameFrom, wentTo);
  // Tracking by key still resolves to the tab the reader was actually on.
  assert.equal(after[wentTo].key, before[cameFrom].key);
});

test('a place that is ONLY a tent lands on Camping', () => {
  // A state park or campground with no ramp: somewhere you sleep, not somewhere
  // you launch. Tapping its tent and being shown road surface and parking is
  // answering a question nobody asked.
  const campgroundOnly = point({ types: ['campground'], isFloatEndpoint: false });
  const tabs = accessTabs(campgroundOnly, detail());
  assert.equal(tabs[initialTabIndex(tabs, pin('campgrounds'), campgroundOnly)].key, 'camping');
});

test('a put-in that also camps lands on Overview even when tapped as a tent', () => {
  // ── THE BUG THIS PINS ─────────────────────────────────────────────────
  // Campgrounds ships ON and MARK_PRIORITY puts campground first, so the
  // campgrounds layer claims every access point that also camps — Akers,
  // Cedargrove, Red Bluff. Their pins carry layer 'campgrounds' through no
  // choice of the reader's, and the sheet read that as a tent tap. Out of the
  // box, tapping the put-in you float from opened the campsite list.
  const putInThatCamps = point({ types: ['access', 'campground'], isFloatEndpoint: true });
  const tabs = accessTabs(putInThatCamps, detail());
  // Camping is PRESENT and still not chosen — otherwise this test would pass
  // for the wrong reason the day the tab stopped qualifying.
  assert.ok(tabs.some((t) => t.key === 'camping'), 'the Camping tab should still exist here');
  assert.equal(tabs[initialTabIndex(tabs, pin('campgrounds'), putInThatCamps)].key, 'overview');
  assert.equal(tabs[initialTabIndex(tabs, pin('access'), putInThatCamps)].key, 'overview');
});

test('an older payload with no isFloatEndpoint lands on Overview', () => {
  // ABSENT MEANS ELIGIBLE everywhere else in the app, so absent must mean "this
  // may be a put-in" here too. Reading undefined as campground-only would send
  // every cached pin from a build predating the field to Camping.
  const legacy = point({ types: ['access', 'campground'] });
  assert.equal(legacy.isFloatEndpoint, undefined);
  const tabs = accessTabs(legacy, detail());
  assert.ok(tabs.some((t) => t.key === 'camping'), 'the Camping tab should still exist here');
  assert.equal(tabs[initialTabIndex(tabs, pin('campgrounds'), legacy)].key, 'overview');
});

test('a boat ramp lands on Overview, and so does a pin with no access point', () => {
  const ramp = point({ types: ['access', 'boat_ramp'] });
  const tabs = accessTabs(ramp, detail());
  assert.equal(tabs[initialTabIndex(tabs, pin('boatRamps'), ramp)].key, 'overview');
  // No access point in hand at all — the gauge path, and the frame before a
  // detail request lands. Must not throw or index past the end.
  assert.equal(initialTabIndex(tabs, pin('campgrounds'), null), 0);
});

test('a tent pin whose Camping tab has not qualified yet lands on Overview', () => {
  // The window before the request settles. Must not index past the end.
  const bare = point({ isFloatEndpoint: false });
  const tabs = accessTabs(bare, null);
  assert.equal(initialTabIndex(tabs, pin('campgrounds'), bare), 0);
});

/* ── Service facts no longer move the tab set ────────────────────────────── */

test('services of every tier leave the tab set alone', () => {
  // These used to decide whether Place existed, with a carve-out excluding
  // campground-tier services because Place did not draw them. Overview draws all
  // three tiers now, so no service qualifies a tab — and a campground service in
  // particular must not, or an ordinary put-in beside a resort would sprout a
  // Camping tab about somebody else's campground.
  for (const type of ['campground', 'outfitter', 'canoe_rental', 'shuttle', 'lodging']) {
    const tabs = accessTabs(
      point(),
      detail({ accessPoint: { nearbyServices: [{ name: 'Bass River Resort', type }] } }),
    );
    assert.deepEqual(tabs.map((t) => t.key), ['overview'], type);
  }
});
