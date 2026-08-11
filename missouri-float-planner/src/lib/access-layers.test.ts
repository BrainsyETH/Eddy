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
  accessOverlapNote,
  resolveAccessMarkers,
  COMPOSED_MARK_PRIORITY,
  markCues,
  ROLE_LAYER,
  SERVICE_MARK_PRIORITY,
  type PlaceRole,
  type ServiceMarkOwner,
} from '../../../eddy-ios/src/map/accessLayers';
import type { ServiceLayerKey } from '../../../eddy-ios/src/map/serviceLayers';

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
  assert.deepEqual(serviceMarkers.map((m) => m.service.id), ['far']);
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
  assert.deepEqual(serviceMarkers.map((m) => m.service.id), ['ok']);
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
  assert.deepEqual(serviceMarkers.map((m) => m.service.id), ['outfitter-with-sites']);
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

// ── What one pin says it is ────────────────────────────────────────────────

test('one pin names every LIVE row it is answering for', () => {
  // Cedargrove, as production actually holds it: one access_points row, four
  // types, no boat ramp. It is a river access AND a campground, it draws one
  // marker, and the caption is the only thing on the map that can say so.
  const cedargrove = {
    point: point({
      id: 'cedargrove',
      name: 'Cedargrove',
      types: ['access', 'campground', 'gravel_bar', 'bridge'],
    }),
    riverSlug: 'current-river',
  };
  assert.equal(placeRoles(cedargrove.point).has('boatRamp'), false);

  const marker = (layers: string[]) =>
    resolveAccessMarkers({ accessPoints: [cedargrove], services: [] }, activeRoles(layers))
      .markers[0];

  const both = marker(['access', 'campgrounds']);
  assert.equal(both.owner, 'campground');
  assert.deepEqual(markCues(both.roles), ['Camp', 'River access']);

  // Campgrounds alone: the Access row is OFF, so the pin must not advertise a
  // row the reader has switched off — and a place answering one row reads
  // exactly as it always has.
  assert.deepEqual(markCues(marker(['campgrounds']).roles), ['Camp']);
  assert.deepEqual(markCues(marker(['access']).roles), ['River access']);
});

test('a cue is only ever the roles the place actually holds', () => {
  const plain = { point: point({ id: 'plain', types: ['access'] }), riverSlug: 'x' };
  const all = resolveAccessMarkers(
    { accessPoints: [plain], services: [] },
    activeRoles(['access', 'campgrounds', 'boatRamps']),
  );
  assert.deepEqual(markCues(all.markers[0].roles), ['River access']);
});

test('the cue reads strongest-first, matching the mark the pin wears', () => {
  const everything = {
    point: point({ id: 'all', types: ['access', 'campground', 'boat_ramp'] }),
    riverSlug: 'x',
  };
  const { markers } = resolveAccessMarkers(
    { accessPoints: [everything], services: [] },
    activeRoles(['access', 'campgrounds', 'boatRamps']),
  );
  assert.equal(markers[0].owner, 'campground');
  assert.deepEqual(markCues(markers[0].roles), ['Camp', 'Ramp', 'River access']);
  // The cue's order is MARK_PRIORITY's, so the first word is always the mark.
  assert.equal(markCues(markers[0].roles)[0], 'Camp');
});

test('an absorbed service makes the pin say camp as well as river access', () => {
  // Absorption grants the campground ROLE (and only the role), so the caption
  // has to follow it — otherwise the place the directory knows camps draws a
  // tent that never mentions the put-in underneath it.
  const plain = {
    point: point({ id: 'plain', types: ['access'], coordinates: { lng: -91.2301, lat: 37.2789 } }),
    riverSlug: 'x',
  };
  const onTop = service({ id: 'dup', latitude: 37.2789, longitude: -91.2301 });
  const { markers } = resolveAccessMarkers(
    { accessPoints: [plain], services: [onTop] },
    activeRoles(['access', 'campgrounds']),
  );
  assert.deepEqual(markCues(markers[0].roles), ['Camp', 'River access']);
  // Still the role and nothing else: the source record is handed back untouched.
  assert.equal(markers[0].entry.point, plain.point);
});

// ── One service, one pin, across all three service layers ──────────────────
//
// 52 of the directory's 138 mapped rows are on the camping tier AND at least
// one other. Before ownership was resolved across the three together, every one
// of them drew twice: `camp-service:{id}` from the campgrounds branch and
// `service:{id}` from rentals or lodging, two id namespaces for one row.

/** Every on/off combination of the three SERVICE layers. */
const SERVICE_COMBINATIONS: ServiceLayerKey[][] = (() => {
  const keys: ServiceLayerKey[] = ['campgrounds', 'outfitters', 'lodging'];
  const out: ServiceLayerKey[][] = [];
  for (let mask = 0; mask < 8; mask += 1) {
    out.push(keys.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return out;
})();

function resolveServices(services: RiverService[], layers: ServiceLayerKey[]) {
  return resolveAccessMarkers(
    { accessPoints: [], services },
    activeRoles(layers),
    new Set(layers),
  );
}

/** A campground that also rents canoes — the shape 40 directory rows have. */
const CAMP_AND_RENTALS = service({
  id: 'camp-rentals',
  name: 'Twin Bridges Canoe & Campground',
  type: 'campground',
  servicesOffered: ['canoe_rental'],
  latitude: 38.9,
  longitude: -90.1,
});

/** A campground with cabins — 35 rows. */
const CAMP_AND_CABINS = service({
  id: 'camp-cabins',
  name: 'Huzzah Valley Resort',
  type: 'campground',
  servicesOffered: ['cabins'],
  latitude: 38.8,
  longitude: -90.2,
});

test('a service on two tiers draws ONE marker, in every combination', () => {
  for (const layers of SERVICE_COMBINATIONS) {
    const { serviceMarkers } = resolveServices([CAMP_AND_RENTALS, CAMP_AND_CABINS], layers);
    const ids = serviceMarkers.map((m) => m.service.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate service marker with [${layers}]`);
  }
});

test('the campground mark wins a service, then rentals, then lodging', () => {
  const all = service({
    id: 'everything',
    type: 'campground',
    servicesOffered: ['canoe_rental', 'cabins'],
    latitude: 38.9,
    longitude: -90.1,
  });
  const owner = (layers: ServiceLayerKey[]) =>
    resolveServices([all], layers).serviceMarkers[0]?.owner;

  assert.equal(owner(['campgrounds', 'outfitters', 'lodging']), 'campground');
  assert.equal(owner(['outfitters', 'lodging']), 'rentals');
  assert.equal(owner(['lodging']), 'lodging');
  assert.equal(owner([]), undefined);
  // Declared, not an accident of loop order — and rentals-before-lodging is
  // exactly what lodgingPins' hand-written complement used to do.
  assert.deepEqual([...SERVICE_MARK_PRIORITY], ['campground', 'rentals', 'lodging']);
});

test('a service absorbed by an access point draws on NO layer', () => {
  // Akers Ferry Canoe Rental, absorbed into Akers Ferry and then drawn again by
  // rentals anyway — fourteen rows were in this state. Absorption used to
  // remove a row from the campgrounds layer alone.
  const akers = {
    point: point({ id: 'akers', types: ['access'], coordinates: { lng: -91.2301, lat: 37.2789 } }),
    riverSlug: 'current-river',
  };
  const onTop = service({
    id: 'akers-canoe',
    type: 'campground',
    servicesOffered: ['canoe_rental'],
    latitude: 37.2789,
    longitude: -91.2301,
  });
  for (const layers of SERVICE_COMBINATIONS) {
    const { markers, serviceMarkers } = resolveAccessMarkers(
      { accessPoints: [akers], services: [onTop] },
      activeRoles(['access', ...layers]),
      new Set(layers),
    );
    assert.equal(serviceMarkers.length, 0, `absorbed row still drew with [${layers}]`);
    assert.ok(markers.length <= 1);
  }
});

test('a service row count does not move when a neighbouring row is toggled', () => {
  // The disease the access family was cured of, arriving in the service family
  // the moment Campgrounds could own a rentals row's marker. A pin count would
  // have dropped by every camping-and-rentals row.
  const services = [CAMP_AND_RENTALS, CAMP_AND_CABINS, service({
    id: 'rentals-only',
    type: 'outfitter',
    latitude: 38.7,
    longitude: -90.3,
  })];
  const expected: Record<ServiceMarkOwner, number> = { campground: 2, rentals: 2, lodging: 1 };
  for (const layers of SERVICE_COMBINATIONS) {
    const { statsByServiceOwner } = resolveServices(services, layers);
    for (const owner of SERVICE_MARK_PRIORITY) {
      assert.equal(
        statsByServiceOwner[owner].totalMatches,
        expected[owner],
        `${owner} total moved with [${layers}]`,
      );
    }
  }
});

test('the four buckets balance for services too, in every combination', () => {
  const services = [CAMP_AND_RENTALS, CAMP_AND_CABINS];
  for (const layers of SERVICE_COMBINATIONS) {
    const { statsByServiceOwner } = resolveServices(services, layers);
    for (const owner of SERVICE_MARK_PRIORITY) {
      const s = statsByServiceOwner[owner];
      assert.equal(
        s.ownedMarkers + s.representedElsewhere + s.notShown,
        s.totalMatches,
        `${owner} does not balance with [${layers}]`,
      );
    }
  }
});

test('the overlap note names the service row a place went to', () => {
  // "River services · 84" holding still is only honest if the sheet says where
  // those places went — otherwise the reader counts canoes and finds forty
  // fewer.
  const { statsByServiceOwner } = resolveServices(
    [CAMP_AND_RENTALS, service({ id: 'rentals-only', type: 'outfitter', latitude: 38.7, longitude: -90.3 })],
    ['campgrounds', 'outfitters'],
  );
  assert.equal(
    accessOverlapNote('rentals', statsByServiceOwner.rentals),
    '1 drawn as rentals & shuttles · 1 as campgrounds',
  );
  // And with nothing to explain, no sentence at all.
  const clean = resolveServices([CAMP_AND_RENTALS], ['campgrounds']);
  assert.equal(accessOverlapNote('campground', clean.statsByServiceOwner.campground), null);
});

test('the Campgrounds row still counts access points and services together', () => {
  // The row's population is both halves, and a camping row drawn as a rental is
  // represented elsewhere rather than missing.
  const camp = { point: point({ id: 'camp', types: ['access', 'campground'] }), riverSlug: 'x' };
  const { statsByRole } = resolveAccessMarkers(
    { accessPoints: [camp], services: [CAMP_AND_RENTALS] },
    activeRoles(['access', 'outfitters']),
    new Set<ServiceLayerKey>(['outfitters']),
  );
  assert.equal(statsByRole.campground.totalMatches, 2, 'one access point + one service');
  assert.equal(statsByRole.campground.ownedMarkers, 0, 'Campgrounds is off');
  assert.equal(statsByRole.campground.representedElsewhere, 2);
  assert.deepEqual(statsByRole.campground.representedBy, { access: 1, rentals: 1 });
});

test('a service on no layer Eddy draws is not a marker and not a count', () => {
  const { serviceMarkers, statsByServiceOwner } = resolveServices(
    [service({ id: 'nowhere', latitude: null, longitude: null })],
    ['campgrounds', 'outfitters', 'lodging'],
  );
  assert.equal(serviceMarkers.length, 0);
  for (const owner of SERVICE_MARK_PRIORITY) {
    assert.equal(statsByServiceOwner[owner].totalMatches, 0, owner);
  }
});

test('every service matching an active layer is represented somewhere', () => {
  // The service family's half of the visibility matrix, and the assertion that
  // fails the day ownership DROPS a row rather than reassigning it. "One marker
  // per place" is only half a contract; this is the other half, and without it
  // a resolver that quietly lost every camping-and-cabins row under one
  // combination would still have passed every test in this file.
  const cases: { svc: RiverService; held: ServiceMarkOwner[] }[] = [
    { svc: CAMP_AND_RENTALS, held: ['campground', 'rentals'] },
    { svc: CAMP_AND_CABINS, held: ['campground', 'lodging'] },
    {
      svc: service({ id: 'rentals-only', type: 'outfitter', latitude: 38.7, longitude: -90.3 }),
      held: ['rentals'],
    },
    {
      svc: service({ id: 'cabins-only', type: 'cabin_lodge', latitude: 38.6, longitude: -90.4 }),
      held: ['lodging'],
    },
  ];
  const services = cases.map((c) => c.svc);

  for (const layers of SERVICE_COMBINATIONS) {
    const active = new Set<ServiceMarkOwner>(
      layers.map((l) => (l === 'campgrounds' ? 'campground' : l === 'outfitters' ? 'rentals' : 'lodging')),
    );
    const { serviceMarkers } = resolveServices(services, layers);
    const drawn = new Set(serviceMarkers.map((m) => m.service.id));
    for (const { svc, held } of cases) {
      const matches = held.some((owner) => active.has(owner));
      assert.equal(drawn.has(svc.id), matches, `${svc.id} with [${layers}]`);
    }
  }
});

test('a service pin names the rows its mark is hiding', () => {
  // Resolving ownership stopped the double pin and, on its own, would have made
  // a camping-and-cabins row draw a tent while the cabins vanished — the same
  // defect the access family's caption was fixed for.
  const cues = (layers: ServiceLayerKey[]) => {
    const marker = resolveServices([CAMP_AND_CABINS], layers).serviceMarkers[0];
    return { all: markCues(marker.layers), hidden: markCues(marker.layers, marker.owner) };
  };

  // Both rows on: the tent owns it, and the caption still says cabins.
  assert.deepEqual(cues(['campgrounds', 'lodging']).all, ['Camp', 'Cabins']);
  assert.deepEqual(cues(['campgrounds', 'lodging']).hidden, ['Cabins']);

  // One row on: nothing is hidden, and the pin reads as it always has.
  assert.deepEqual(cues(['campgrounds']).all, ['Camp']);
  assert.deepEqual(cues(['campgrounds']).hidden, []);
  assert.deepEqual(cues(['lodging']).all, ['Cabins']);
  assert.deepEqual(cues(['lodging']).hidden, []);
});

test('a cue never names a row the reader switched off', () => {
  // Live layers, not held ones — advertising a row that is off would be the
  // mirror of hiding one that is on.
  const marker = resolveServices([CAMP_AND_RENTALS], ['campgrounds']).serviceMarkers[0];
  assert.deepEqual(markCues(marker.layers), ['Camp']);
  assert.equal(markCues(marker.layers).includes('Rentals'), false);
});

test('the hidden set is always the tail of the priority order', () => {
  // A consequence of ownership following SERVICE_MARK_PRIORITY, asserted because
  // the subtitle's shape depends on it: a lodging-owned pin can hide nothing, so
  // no caller has to handle a cue landing before its own type label.
  const all = service({
    id: 'all-three',
    type: 'campground',
    servicesOffered: ['canoe_rental', 'cabins'],
    latitude: 38.9,
    longitude: -90.1,
  });
  for (const layers of SERVICE_COMBINATIONS) {
    const marker = resolveServices([all], layers).serviceMarkers[0];
    if (!marker) continue;
    const ownerIndex = SERVICE_MARK_PRIORITY.indexOf(marker.owner);
    for (const other of marker.layers) {
      assert.ok(
        SERVICE_MARK_PRIORITY.indexOf(other) >= ownerIndex,
        `${other} outranks the owner ${marker.owner} with [${layers}]`,
      );
    }
  }
});

// ── A composed place: one access record plus what it absorbed ──────────────
//
// The gap the previous matrix could not see. It called the resolver with
// `accessPoints: []`, so absorption was unreachable from every case in it, and
// the one absorption test asserted `serviceMarkers.length === 0` and
// `markers.length <= 1` — both of which are satisfied when the place vanishes
// entirely. The bug lived exactly where the tests could not look.

/** Akers Ferry, and the canoe rental that sits on it. One place, two records. */
const AKERS = {
  point: point({
    id: 'akers',
    name: 'Akers Ferry',
    types: ['access'],
    coordinates: { lng: -91.2301, lat: 37.2789 },
  }),
  riverSlug: 'current-river',
};
const AKERS_CANOE = service({
  id: 'akers-canoe',
  name: 'Akers Ferry Canoe Rental',
  type: 'campground',
  servicesOffered: ['canoe_rental', 'camping_primitive'],
  latitude: 37.2789 + 0.001,
  longitude: -91.2301,
});

/** Every on/off combination of Access, Campgrounds and Rentals. */
const PLACE_COMBINATIONS: string[][] = (() => {
  const keys = ['access', 'campgrounds', 'outfitters'];
  const out: string[][] = [];
  for (let mask = 0; mask < 8; mask += 1) {
    out.push(keys.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return out;
})();

function resolveComposed(layers: string[]) {
  return resolveAccessMarkers(
    { accessPoints: [AKERS], services: [AKERS_CANOE] },
    activeRoles(layers),
    new Set(layers.filter((l) => l !== 'access') as ServiceLayerKey[]),
  );
}

test('a composed place draws exactly one marker whenever any of its rows is live', () => {
  // The assertion the old pair could not make. Akers holds `access` from its own
  // row and `campground` + `rentals` from the business it absorbed, so every one
  // of the three switches should reach it — and never more than once.
  for (const layers of PLACE_COMBINATIONS) {
    const { markers, serviceMarkers } = resolveComposed(layers);
    const drawn = markers.length + serviceMarkers.length;
    assert.equal(drawn, layers.length === 0 ? 0 : 1, `drew ${drawn} with [${layers}]`);
  }
});

test('rentals alone still finds the rental that sits on a put-in', () => {
  // The regression in the flesh. This drew NOTHING before: the service was
  // absorbed and dropped, and the access point had no rentals mark to be found
  // by, so asking the map for canoe rental hid the one at the put-in.
  const { markers, serviceMarkers } = resolveComposed(['outfitters']);
  assert.equal(serviceMarkers.length, 0, 'the business is not a second pin');
  assert.equal(markers.length, 1, 'the place must be somewhere');
  assert.equal(markers[0].owner, 'rentals');
  assert.deepEqual(markCues(markers[0].roles), ['Rentals']);
});

test('a composed place keeps every membership it holds, in both records', () => {
  // Counts are membership, so all three totals stand whatever is switched on —
  // and each is counted ONCE, by the place, never twice by the two records that
  // make it up.
  for (const layers of PLACE_COMBINATIONS) {
    const { statsByRole, statsByServiceOwner } = resolveComposed(layers);
    assert.equal(statsByRole.access.totalMatches, 1, `access with [${layers}]`);
    assert.equal(statsByRole.campground.totalMatches, 1, `campground with [${layers}]`);
    assert.equal(statsByServiceOwner.rentals.totalMatches, 1, `rentals with [${layers}]`);
    assert.equal(statsByRole.boatRamp.totalMatches, 0);
    // One place, so the campground row must not count the access record and the
    // absorbed business separately.
    assert.equal(statsByServiceOwner.campground.totalMatches, 0, 'absorbed, not standalone');
  }
});

test('the four buckets balance across both families for a composed place', () => {
  for (const layers of PLACE_COMBINATIONS) {
    const { statsByRole, statsByServiceOwner } = resolveComposed(layers);
    for (const s of [...Object.values(statsByRole), ...Object.values(statsByServiceOwner)]) {
      assert.equal(
        s.ownedMarkers + s.representedElsewhere + s.notShown,
        s.totalMatches,
        `does not balance with [${layers}]`,
      );
    }
  }
});

test('the mark a composed place wears follows one declared order', () => {
  const owner = (layers: string[]) => resolveComposed(layers).markers[0]?.owner;
  assert.equal(owner(['access', 'campgrounds', 'outfitters']), 'campground');
  assert.equal(owner(['access', 'outfitters']), 'rentals');
  assert.equal(owner(['access']), 'access');
  // Both original orders survive inside it, so nothing that held before flips.
  const order = [...COMPOSED_MARK_PRIORITY];
  const isSubsequence = (sub: readonly string[]) => {
    let i = 0;
    for (const mark of order) if (mark === sub[i]) i += 1;
    return i === sub.length;
  };
  assert.ok(isSubsequence(MARK_PRIORITY), 'MARK_PRIORITY must survive');
  assert.ok(isSubsequence(SERVICE_MARK_PRIORITY), 'SERVICE_MARK_PRIORITY must survive');
});

test('the caption names every live row the composed place answers', () => {
  const cues = (layers: string[]) => markCues(resolveComposed(layers).markers[0].roles);
  assert.deepEqual(cues(['access', 'campgrounds', 'outfitters']), ['Camp', 'Rentals', 'River access']);
  assert.deepEqual(cues(['access', 'outfitters']), ['Rentals', 'River access']);
  assert.deepEqual(cues(['campgrounds']), ['Camp']);
});

test('absorption still carries marks and never content', () => {
  // The half of ADR 0008 that does not move. A phone number attached to the
  // wrong campground is worse than no phone number, and ~200 m is evidence
  // rather than proof — so the access point's own record comes back untouched.
  const { markers } = resolveComposed(['access', 'campgrounds', 'outfitters']);
  assert.equal(markers[0].entry.point, AKERS.point);
  assert.equal(placeRoles(AKERS.point).has('campground'), false);
});
