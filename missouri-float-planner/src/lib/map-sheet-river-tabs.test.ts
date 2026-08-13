import assert from 'node:assert/strict';
import test from 'node:test';
import type { Hazard, MapAccessPoint, RiverService } from '@eddy/types';
import {
  riverTabs,
  serviceSections,
  type RiverSheetData,
} from '../../../eddy-ios/src/components/map-sheet/riverTabs';

// Covers the river sheet's tab rules. Tapping a river produced no UI at all
// before this, so every one of these is new behaviour rather than a regression
// guard — and the empty-river cases are the ones most likely to be met in the
// wild, because the statewide network carries rivers Eddy has not mapped
// access points for yet.

function access(id: string, riverMile: number, over: Partial<MapAccessPoint> = {}): MapAccessPoint {
  return {
    id,
    name: `Access ${id}`,
    riverMile,
    type: 'access',
    isPublic: true,
    coordinates: { lng: -91, lat: 37 },
    ...over,
  } as MapAccessPoint;
}

function hazard(id: string): Hazard {
  return {
    id,
    riverId: 'r1',
    name: 'Low-water bridge',
    type: 'low_water_dam',
    riverMile: 10,
    description: null,
    severity: 'warning',
    portageRequired: true,
    portageSide: 'left',
    seasonalNotes: null,
    coordinates: { lng: -91, lat: 37 },
  } as Hazard;
}

function gauge(siteId: string, isPrimary = false): RiverSheetData['gauges'][number] {
  return { siteId, name: `Gauge ${siteId}`, code: 'good', reading: '385 cfs', isPrimary };
}

function service(id: string, over: Partial<RiverService> = {}): RiverService {
  return {
    id,
    name: `Service ${id}`,
    type: 'outfitter',
    phone: null,
    website: null,
    city: null,
    state: 'MO',
    latitude: null,
    longitude: null,
    description: null,
    servicesOffered: [],
    ...over,
  } as RiverService;
}

function river(over: Partial<RiverSheetData> = {}): RiverSheetData {
  return {
    slug: 'current',
    name: 'Current River',
    region: 'Ozarks',
    code: 'good',
    gauges: [],
    accesses: [],
    hazards: [],
    services: [],
    ...over,
  };
}

const keys = (r: RiverSheetData) => riverTabs(r).map((t) => t.key);

test('a river Eddy knows nothing about has no tabs at all', () => {
  // NEWLY REACHABLE, and not a bug. Conditions used to be unconditional, so the
  // set could never be empty; it is gated on more than one gauge now because the
  // glance carries the verdict and the primary station's reading.
  //
  // RiverSheetPanel renders a glance-only sheet for this — MapSheet reads absent
  // children as glanceOnly — which is the honest outcome: everything such a
  // river has to say already fits above the fold.
  assert.deepEqual(keys(river()), []);
});

test('one gauge needs no Conditions tab', () => {
  // The mirror of gaugeTabs' "ONE river needs no list". The glance shows this
  // station's reading, so a page holding the same single row is a wasted swipe.
  assert.ok(!keys(river({ gauges: [gauge('07064533', true)] })).includes('conditions'));
});

test('two gauges earn Conditions, because they can disagree', () => {
  // The thing one row cannot show, and the only reason the tab still exists: a
  // long river can be Good at one station and High at another.
  const r = river({ gauges: [gauge('07064533', true), gauge('07067000')] });
  assert.ok(keys(r).includes('conditions'));
});

test('any access point earns the Accesses tab', () => {
  const r = river({ accesses: [access('a', 0)] });
  assert.ok(keys(r).includes('accesses'));
});

test('hazards earn their tab only when there are some', () => {
  assert.ok(!keys(river()).includes('hazards'));
  assert.ok(keys(river({ hazards: [hazard('h1')] })).includes('hazards'));
});

test('order is fixed', () => {
  const r = river({
    gauges: [gauge('07064533', true), gauge('07067000')],
    accesses: [access('a', 0), access('b', 8)],
    hazards: [hazard('h1')],
    services: [service('s1')],
  });
  assert.deepEqual(keys(r), ['conditions', 'services', 'accesses', 'hazards']);
});

test('a single-gauge river with places to go still has tabs', () => {
  // The empty case is specifically "one gauge AND nothing else". Losing
  // Conditions must not cost a river its Accesses or its Hazards.
  const r = river({
    gauges: [gauge('07064533', true)],
    accesses: [access('a', 0), access('b', 8)],
    hazards: [hazard('h1')],
  });
  assert.deepEqual(keys(r), ['accesses', 'hazards']);
});

/* ── Camping & outfitters ───────────────────────────────────────────────── */

test('no services, no tab', () => {
  assert.ok(!keys(river()).includes('services'));
});

test('one outfitter earns the tab', () => {
  assert.ok(keys(river({ services: [service('s1')] })).includes('services'));
});

test('a river whose only services are closed does NOT earn the tab', () => {
  // The reason the gate asks serviceSections rather than counting rows: a tab
  // that opens onto three absent sections is the "present and empty" promise
  // the registry exists to prevent.
  const r = river({
    services: [
      service('s1', { status: 'permanently_closed' }),
      service('s2', { status: 'temporarily_closed' }),
    ],
  });
  assert.deepEqual(serviceSections(r.services), []);
  assert.ok(!keys(r).includes('services'));
});

test('unverified is drawn — it means nobody re-checked, not that it is gone', () => {
  const r = river({ services: [service('s1', { status: 'unverified' })] });
  assert.ok(keys(r).includes('services'));
});

test('sections are Campgrounds, Rentals & shuttles, Cabins & lodges in that order', () => {
  const sections = serviceSections([
    service('camp', { type: 'campground' }),
    service('rent', { type: 'outfitter' }),
    service('cabin', { type: 'cabin_lodge' }),
  ]);
  assert.deepEqual(
    sections.map((s) => s.title),
    ['Campgrounds', 'Rentals & shuttles', 'Cabins & lodges'],
  );
});

test('an empty section is dropped, not drawn as a heading over nothing', () => {
  const sections = serviceSections([service('camp', { type: 'campground' })]);
  assert.deepEqual(
    sections.map((s) => s.title),
    ['Campgrounds'],
  );
});

test('one business can appear in two sections, because it answers two questions', () => {
  // serviceTiers is a SET and 42% of the directory is in more than one tier. A
  // list is not a map: the duplicate-pin rule that makes the lodging LAYER drop
  // what rentals draws has no equivalent here, and de-duplicating would hide a
  // real answer to one of the two questions.
  const outfitterWithCabins = service('s1', {
    type: 'outfitter',
    servicesOffered: ['canoe_rental', 'cabins'],
  });
  const sections = serviceSections([outfitterWithCabins]);
  assert.deepEqual(
    sections.map((s) => s.title),
    ['Rentals & shuttles', 'Cabins & lodges'],
  );
});

test('a service with no coordinates is still listed', () => {
  // The whole reason mappableService is not applied here: most of the directory
  // has no confirmed location, and a list is where those stay reachable.
  const sections = serviceSections([
    service('s1', { type: 'campground', latitude: null, longitude: null }),
  ]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].rows.length, 1);
});
