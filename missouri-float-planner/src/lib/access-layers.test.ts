import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapAccessPoint, RiverService } from '@eddy/types';
import {
  accessRoleForLayer,
  activeRoles,
  drawnAsAccessPoint,
  MARK_PRIORITY,
  placeRoles,
  PLACE_ROLES,
  resolveAccessMarkers,
  ROLE_LAYER,
  type PlaceRole,
} from '../../../eddy-ios/src/map/accessLayers';

// Covers eddy-ios/src/map/accessLayers.ts. The Expo app has no runner of its
// own, and this is the module that decides which of the access family's three
// overlapping layers claims a place — so a wrong answer here is two pins on one
// coordinate, or a put-in that vanishes from a map with its own layer switched
// on, or a count beside a switch that argues with what the map drew.
//
// The eight combinations are exhaustive on purpose. The resolver is pure and
// cheap, and the states that are awkward to reach with a thumb (the tier chips
// let Access be turned off while Boat ramps stays on) are exactly the ones a
// manual pass would skip.

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

function service(over: Partial<RiverService> = {}): RiverService {
  return {
    id: 'svc-1',
    name: 'Riverside Campground',
    type: 'campground',
    phone: null,
    website: null,
    city: 'Salem',
    state: 'MO',
    latitude: 37.5,
    longitude: -91.5,
    description: null,
    servicesOffered: [],
    ...over,
  } as RiverService;
}

/**
 * One of each shape the resolver has to tell apart.
 *
 * Miles apart on purpose. Four fixtures on one coordinate would make every
 * same-place test pass by accident, which is the trap the untagged-overlap case
 * below was hiding in.
 */
const PLAIN = point({
  id: 'plain',
  name: 'Cedar Grove',
  types: ['access'],
  coordinates: { lng: -91.23, lat: 37.27 },
});
const RAMP = point({
  id: 'ramp',
  name: 'Pulltite',
  types: ['access', 'boat_ramp'],
  coordinates: { lng: -91.33, lat: 37.37 },
});
const CAMP = point({
  id: 'camp',
  name: 'Round Spring',
  types: ['access', 'campground'],
  coordinates: { lng: -91.43, lat: 37.47 },
});
const BOTH = point({
  id: 'both',
  name: 'Red Bluff',
  types: ['access', 'campground', 'boat_ramp'],
  coordinates: { lng: -91.53, lat: 37.57 },
});

const ALL = [PLAIN, RAMP, CAMP, BOTH].map((p) => ({ point: p, riverSlug: 'current-river' }));

/** Every on/off combination of the three access-family layers. */
const COMBINATIONS: string[][] = (() => {
  const keys = ['access', 'campgrounds', 'boatRamps'];
  const out: string[][] = [];
  for (let mask = 0; mask < 8; mask += 1) {
    out.push(keys.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return out;
})();

function resolve(layers: string[], services: RiverService[] | null = []) {
  return resolveAccessMarkers({ accessPoints: ALL, services }, activeRoles(layers));
}

test('every access point holds the access role, whatever else it is', () => {
  // The row is called "Access points" and its population is the access points.
  // A ramp is one; a campground you can put in at is one. Dropping them would
  // make the count "the ones with no other tag", which nobody asked to see.
  for (const p of [PLAIN, RAMP, CAMP, BOTH]) {
    assert.ok(placeRoles(p).has('access'), `${p.id} should hold access`);
  }
  assert.deepEqual([...placeRoles(PLAIN)], ['access']);
  assert.deepEqual([...placeRoles(RAMP)].sort(), ['access', 'boatRamp']);
  assert.deepEqual([...placeRoles(CAMP)].sort(), ['access', 'campground']);
  assert.deepEqual([...placeRoles(BOTH)].sort(), ['access', 'boatRamp', 'campground']);
});

test('a type Eddy has not learnt does not invent a role', () => {
  assert.deepEqual([...placeRoles(point({ types: ['access', 'canoe_launch'] }))], ['access']);
});

test('the layer keys and the roles map both ways', () => {
  for (const role of PLACE_ROLES) {
    assert.equal(accessRoleForLayer(ROLE_LAYER[role]), role);
  }
  // Every other layer is emphatically not an access-family layer — the peek's
  // reserved fact and the Directions row both read `null` as "not one of ours".
  for (const other of ['gauges', 'allGauges', 'hazards', 'dams', 'outfitters', 'lodging']) {
    assert.equal(accessRoleForLayer(other), null, other);
  }
});

test('at most one marker per place, in every combination', () => {
  for (const layers of COMBINATIONS) {
    const { markers } = resolve(layers);
    const ids = markers.map((m) => m.entry.point.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate marker with [${layers}]`);
  }
});

test('the count beside a row does not move when another row is toggled', () => {
  // The whole reason the counts are membership. The Access row used to drop by
  // the number of campgrounds the moment Campgrounds came on, for a reason the
  // sheet never stated and that had nothing to do with access points.
  const expected: Record<PlaceRole, number> = { access: 4, campground: 2, boatRamp: 2 };
  for (const layers of COMBINATIONS) {
    const { statsByRole } = resolve(layers);
    for (const role of PLACE_ROLES) {
      assert.equal(
        statsByRole[role].totalMatches,
        expected[role],
        `${role} total moved with [${layers}]`,
      );
    }
  }
});

test('the four buckets add up, in every combination', () => {
  // The assertion worth writing: this is the one that fails if a filter ever
  // silently drops a place. `notShown` is what makes it hold under a toggle
  // that HIDES things.
  for (const layers of COMBINATIONS) {
    const { statsByRole } = resolve(layers);
    for (const role of PLACE_ROLES) {
      const s = statsByRole[role];
      assert.equal(
        s.ownedMarkers + s.representedElsewhere + s.notShown,
        s.totalMatches,
        `${role} does not balance with [${layers}]`,
      );
    }
  }
});

test('every place matching an active role is represented somewhere', () => {
  for (const layers of COMBINATIONS) {
    const roles = activeRoles(layers);
    const { markers } = resolve(layers);
    const drawn = new Set(markers.map((m) => m.entry.point.id));
    for (const entry of ALL) {
      const matches = [...placeRoles(entry.point)].some((role) => roles.has(role));
      assert.equal(
        drawn.has(entry.point.id),
        matches,
        `${entry.point.id} with [${layers}]`,
      );
    }
  }
});

test('the campground mark wins when both layers are on', () => {
  const { markers } = resolve(['access', 'campgrounds', 'boatRamps']);
  const owner = (id: string) => markers.find((m) => m.entry.point.id === id)?.owner;
  assert.equal(owner('both'), 'campground');
  assert.equal(owner('ramp'), 'boatRamp');
  assert.equal(owner('camp'), 'campground');
  assert.equal(owner('plain'), 'access');
  // Not an accident of the loop order — the precedence is declared.
  assert.deepEqual([...MARK_PRIORITY], ['campground', 'boatRamp', 'access']);
});

test('a ramp that is also a campground wears the ramp mark once camping is off', () => {
  const { markers, statsByRole } = resolve(['access', 'boatRamps']);
  assert.equal(markers.find((m) => m.entry.point.id === 'both')?.owner, 'boatRamp');
  // And the campground row still knows it exists, and where it went.
  assert.equal(statsByRole.campground.totalMatches, 2);
  assert.equal(statsByRole.campground.ownedMarkers, 0);
  assert.equal(statsByRole.campground.representedElsewhere, 2);
  assert.deepEqual(statsByRole.campground.representedBy, { boatRamp: 1, access: 1 });
});

test('boat ramps alone draws only the ramps, and says the rest are not shown', () => {
  // Reachable: turning a row off clears its tiers, but the tier CHIPS toggle
  // independently, so Access can be off while Boat ramps is on.
  const { markers, statsByRole } = resolve(['boatRamps']);
  assert.deepEqual(
    markers.map((m) => m.entry.point.id).sort(),
    ['both', 'ramp'],
  );
  assert.ok(markers.every((m) => m.owner === 'boatRamp'));
  assert.equal(statsByRole.access.totalMatches, 4);
  assert.equal(statsByRole.access.ownedMarkers, 0);
  assert.equal(statsByRole.access.representedElsewhere, 2);
  assert.equal(statsByRole.access.notShown, 2);
});

test('nothing on draws nothing, and every place counts as not shown', () => {
  const { markers, statsByRole } = resolve([]);
  assert.equal(markers.length, 0);
  for (const role of PLACE_ROLES) {
    assert.equal(statsByRole[role].notShown, statsByRole[role].totalMatches, role);
  }
});

test('a service campground on top of an access point is one marker, not two', () => {
  // ~200 m: the two records were geocoded independently and a campground is an
  // area, so a service pinned at the entrance and a put-in pinned at the ramp
  // are one place. This is a PRESENTATION decision — neither record is merged.
  const onTop = service({ id: 'dup', latitude: 37.2789 + 0.001, longitude: -91.2301 });
  const camp = { point: point({ id: 'camp', types: ['access', 'campground'] }), riverSlug: 'x' };
  const { markers, serviceMarkers, statsByRole } = resolveAccessMarkers(
    { accessPoints: [camp], services: [onTop] },
    activeRoles(['campgrounds']),
  );
  assert.equal(markers.length, 1);
  assert.equal(serviceMarkers.length, 0);
  // And it is not counted as a second campground represented elsewhere: it is
  // the same place seeded twice, and counting it would make one campground two.
  assert.equal(statsByRole.campground.totalMatches, 1);
});

test('two services on one access point still make one place', () => {
  const camp = { point: point({ id: 'camp', types: ['access', 'campground'] }), riverSlug: 'x' };
  const { markers, statsByRole } = resolveAccessMarkers(
    {
      accessPoints: [camp],
      services: [
        service({ id: 'a', latitude: 37.2789, longitude: -91.2301 }),
        service({ id: 'b', latitude: 37.2789 + 0.0005, longitude: -91.2301 }),
      ],
    },
    activeRoles(['campgrounds']),
  );
  assert.equal(markers.length, 1);
  assert.equal(statsByRole.campground.totalMatches, 1);
});

test('an UNTAGGED access point absorbs the campground service on top of it', () => {
  // The case the tagged fixture above sidesteps, and the one that matters:
  // the directory says this place is a campground and the access-point row is
  // tagged only `access`. Deduping against tagged points alone made the tag a
  // precondition for noticing the duplicate, so with both layers on this drew
  // twice — two markers a hundred metres apart for one physical place.
  const plain = { point: point({ id: 'plain', types: ['access'] }), riverSlug: 'x' };
  const onTop = service({ id: 'dup', latitude: 37.2789 + 0.001, longitude: -91.2301 });
  const resolved = (layers: string[]) =>
    resolveAccessMarkers({ accessPoints: [plain], services: [onTop] }, activeRoles(layers));

  const both = resolved(['access', 'campgrounds']);
  assert.equal(both.markers.length, 1, 'one place, one marker');
  assert.equal(both.serviceMarkers.length, 0);
  // And the marker is the TENT, because the place camps — dropping the service
  // without carrying the role would have deleted it from the campgrounds layer
  // altogether, which is worse than the duplicate it was fixing.
  assert.equal(both.markers[0].owner, 'campground');
  // Counted once by each row that legitimately holds it, never twice by either.
  assert.equal(both.statsByRole.campground.totalMatches, 1);
  assert.equal(both.statsByRole.access.totalMatches, 1);

  // With camping off it is a put-in again, and the campground row still knows.
  const accessOnly = resolved(['access']);
  assert.equal(accessOnly.markers.length, 1);
  assert.equal(accessOnly.markers[0].owner, 'access');
  assert.equal(accessOnly.statsByRole.campground.representedElsewhere, 1);
  assert.equal(accessOnly.statsByRole.campground.notShown, 0);
});

test('absorption carries the role and nothing else', () => {
  // ~200 m is evidence, not proof (ADR 0008). It may decide which marker draws;
  // it may never attach a business's phone number to an access point.
  const plain = { point: point({ id: 'plain', types: ['access'] }), riverSlug: 'x' };
  const onTop = service({
    id: 'dup',
    phone: '573-555-0100',
    website: 'https://example.com',
    latitude: 37.2789,
    longitude: -91.2301,
  });
  const { markers } = resolveAccessMarkers(
    { accessPoints: [plain], services: [onTop] },
    activeRoles(['campgrounds']),
  );
  // The access point's own record is handed back untouched — the same object,
  // so there is nowhere for a phone number or a booking link to have landed.
  assert.equal(markers[0].entry.point, plain.point);
  // And the source row is not mutated on the way through: the role lives in the
  // resolver's own pass, never written back onto the record. `isCampground`
  // reads the tags, and the tags are still what the database said.
  assert.equal(placeRoles(plain.point).has('campground'), false);
});

test('a service campground somewhere else is its own marker', () => {
  const elsewhere = service({ id: 'far', latitude: 38.9, longitude: -90.1 });
  const { serviceMarkers, statsByRole } = resolveAccessMarkers(
    { accessPoints: ALL, services: [elsewhere] },
    activeRoles(['campgrounds']),
  );
  assert.deepEqual(serviceMarkers.map((s) => s.id), ['far']);
  assert.equal(statsByRole.campground.totalMatches, 3);
  assert.equal(statsByRole.campground.ownedMarkers, 3);
});

test('a service campground counts even while its layer is off, and is not drawn', () => {
  const elsewhere = service({ id: 'far', latitude: 38.9, longitude: -90.1 });
  const { serviceMarkers, statsByRole } = resolveAccessMarkers(
    { accessPoints: ALL, services: [elsewhere] },
    activeRoles(['access']),
  );
  assert.equal(serviceMarkers.length, 0);
  assert.equal(statsByRole.campground.totalMatches, 3);
  assert.equal(statsByRole.campground.notShown, 1);
  // The two access-point campgrounds are drawn, as access points.
  assert.equal(statsByRole.campground.representedElsewhere, 2);
});

test('the same three tests the map applies, asked once', () => {
  // Closed, unlocatable, and on no camping tier. Each of these used to be asked
  // by some consumers and not others — the drift guardrail 4 names.
  const services = [
    service({ id: 'closed', status: 'permanently_closed', latitude: 38.9, longitude: -90.1 }),
    service({ id: 'nowhere', latitude: null, longitude: null }),
    service({ id: 'rentals', type: 'outfitter', latitude: 38.8, longitude: -90.2 }),
    service({ id: 'ok', latitude: 38.7, longitude: -90.3 }),
  ];
  const { serviceMarkers, statsByRole } = resolveAccessMarkers(
    { accessPoints: [], services },
    activeRoles(['campgrounds']),
  );
  assert.deepEqual(serviceMarkers.map((s) => s.id), ['ok']);
  assert.equal(statsByRole.campground.totalMatches, 1);
});

test('an outfitter that records camping is a campground, by tier not by type', () => {
  const camping = service({
    id: 'outfitter-with-sites',
    type: 'outfitter',
    servicesOffered: ['camping_primitive'],
    latitude: 38.7,
    longitude: -90.3,
  });
  const { serviceMarkers } = resolveAccessMarkers(
    { accessPoints: [], services: [camping] },
    activeRoles(['campgrounds']),
  );
  assert.deepEqual(serviceMarkers.map((s) => s.id), ['outfitter-with-sites']);
});

test('a directory that has not landed is not an empty directory', () => {
  // The campground total is half access points and half services, so the sheet
  // must not print it until both halves are in — `servicesKnown` is what lets
  // the caller honour that.
  assert.equal(resolve(['campgrounds'], null).servicesKnown, false);
  assert.equal(resolve(['campgrounds'], []).servicesKnown, true);
});

test('the same-place box is square on the ground, not in degrees', () => {
  // At 37°N a degree of longitude is about four fifths of a degree of latitude,
  // so an unscaled comparison would quietly make the box wider than it is tall.
  const at = (lat: number, lng: number) => ({ coordinates: { lng, lat } });
  // 0.0024° of longitude at 37°N is inside the 200 m box; the same figure of
  // latitude is outside it.
  assert.equal(
    drawnAsAccessPoint({ latitude: 37, longitude: -91 + 0.0024 }, [at(37, -91)]),
    true,
  );
  assert.equal(
    drawnAsAccessPoint({ latitude: 37 + 0.0024, longitude: -91 }, [at(37, -91)]),
    false,
  );
});

test('a service with no geocode is never the same place as anything', () => {
  assert.equal(
    drawnAsAccessPoint({ latitude: null, longitude: null }, [
      { coordinates: { lng: -91, lat: 37 } },
    ]),
    false,
  );
});
