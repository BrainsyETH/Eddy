// src/lib/plan-support.test.ts
// Who the plan strip shows, and — the harder half — who it shows only once.
//
// Covers eddy-ios/src/lib/planSupport.ts. The ranking in here was inherited from
// PlanNearby, where it lived in a useMemo inside a .tsx and was therefore
// untestable: the web suite is the only runner the Expo app has, and it cannot
// load a file that imports react-native. Moving it out is what made these
// assertions possible, and the dedup rule below is the reason they were worth
// making — it is the one part of this strip that can be confidently wrong.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { NearbyService, RiverService } from '@eddy/types';
import {
  groupEndpointServices,
  normalizeServiceName,
  rankNearbyShuttles,
  sameService,
  serviceContactUrl,
} from '../../../eddy-ios/src/lib/planSupport';

/** Straight-line miles is irrelevant to these rules; ordering by it is not. */
const flatDistance = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => Math.hypot(a.lat - b.lat, a.lng - b.lng) * 69;

const AKERS = { lat: 37.3767, lng: -91.5561 };

function embedded(over: Partial<NearbyService> = {}): NearbyService {
  return { name: 'Akers Ferry Canoe Rental', type: 'outfitter', ...over } as NearbyService;
}

function detail(services: NearbyService[]) {
  return { accessPoint: { nearbyServices: services } };
}

function directory(over: Partial<RiverService> = {}): RiverService {
  return {
    id: over.id ?? 'svc-1',
    name: 'Akers Ferry Canoe Rental',
    type: 'outfitter',
    phone: '573-858-3224',
    website: null,
    latitude: 37.38,
    longitude: -91.55,
    servicesOffered: ['shuttle'],
    ...over,
  } as RiverService;
}

/* ── Identity ────────────────────────────────────────────────────────────── */

test('a name is reduced to the part that identifies the business', () => {
  assert.equal(normalizeServiceName('Akers Ferry Canoe Rental, LLC'), 'akers ferry canoe rental');
  assert.equal(normalizeServiceName('The Landing'), 'landing');
  assert.equal(normalizeServiceName('  Bass   River  Resort '), 'bass river resort');
});

test('a shared phone number is the same business, whatever it is called', () => {
  // The two sources were seeded years apart and disagree about names constantly.
  // A phone number is the hard signal.
  assert.ok(
    sameService(
      { name: 'Red Bluff Campground', phone: '(573) 555-0100' },
      { name: 'Red Bluff Recreation Area', phone: '573-555-0100' },
    ),
  );
  // Country code stripped, or "1-573-…" and "573-…" would read as two numbers.
  assert.ok(sameService({ name: 'A', phone: '15735550100' }, { name: 'B', phone: '5735550100' }));
});

test('a shared domain is the same business, deep link or home page', () => {
  assert.ok(
    sameService(
      { name: 'Akers Ferry', website: 'https://www.akersferry.com/shuttles?ref=eddy' },
      { name: 'Akers Ferry Canoe Rental', website: 'akersferry.com' },
    ),
  );
});

test('a shared name alone is enough only when nothing contradicts it', () => {
  // The common cross-source case: one row has a phone, the other has a website,
  // so there is nothing hard to compare and the name has to carry it.
  assert.ok(
    sameService(
      { name: 'Akers Ferry Canoe Rental', phone: '573-858-3224' },
      { name: 'Akers Ferry Canoe Rental, LLC', website: 'akersferry.com' },
    ),
  );
});

test('a shared name with two different phone numbers is TWO businesses', () => {
  // The failure name-only matching produces, and the reason this function is not
  // one line. Merging these hides a business and attaches the survivor's number
  // to a place that does not answer it.
  assert.ok(
    !sameService(
      { name: 'Riverside Campground', phone: '573-555-0100' },
      { name: 'Riverside Campground', phone: '417-555-0999' },
    ),
  );
  assert.ok(
    !sameService(
      { name: 'Riverside Campground', website: 'riverside-mo.com' },
      { name: 'Riverside Campground', website: 'riversidecampground.net' },
    ),
  );
});

test('different businesses stay different', () => {
  assert.ok(!sameService({ name: 'Akers Ferry' }, { name: 'Jadwin Canoe Rental' }));
  assert.ok(!sameService({ name: '' }, { name: '' }), 'two blanks are not one business');
});

/* ── Endpoint groups ─────────────────────────────────────────────────────── */

test('services are split by what they do, at the end they belong to', () => {
  const groups = groupEndpointServices(
    detail([
      embedded({ name: 'Akers Ferry Canoe Rental', type: 'outfitter' }),
      embedded({ name: 'Round Spring Campground', type: 'campground' }),
    ]),
    detail([embedded({ name: 'Jadwin Canoe Rental', type: 'canoe_rental' })]),
  );

  assert.deepEqual(groups.putIn.rentals.map((s) => s.name), ['Akers Ferry Canoe Rental']);
  assert.deepEqual(groups.putIn.camping.map((s) => s.name), ['Round Spring Campground']);
  assert.deepEqual(groups.takeOut.rentals.map((s) => s.name), ['Jadwin Canoe Rental']);
});

test('a business listed at BOTH ends is shown once, at the put-in', () => {
  // Common: one outfitter serves a whole stretch and is recorded against every
  // landing on it. Two headings naming the same business reads as two options.
  const groups = groupEndpointServices(
    detail([embedded({ name: 'Akers Ferry Canoe Rental' })]),
    detail([embedded({ name: 'Akers Ferry Canoe Rental, LLC' })]),
  );
  assert.equal(groups.putIn.rentals.length, 1);
  assert.equal(groups.takeOut.rentals.length, 0);
});

test('a business listed twice at ONE end is shown once', () => {
  const groups = groupEndpointServices(
    detail([
      embedded({ name: 'Akers Ferry Canoe Rental', phone: '573-858-3224' }),
      embedded({ name: 'Akers Ferry', phone: '(573) 858-3224' }),
    ]),
    null,
  );
  assert.equal(groups.putIn.rentals.length, 1);
});

test('a missing endpoint leaves the other one intact', () => {
  // Null means the request failed, the plan carried no slug (shared floats often
  // do not), or the landing lists nothing. A plan with one group is still a plan
  // — this is the assertion the async coordinator's failure path resolves to.
  const groups = groupEndpointServices(null, detail([embedded({ name: 'Jadwin Canoe Rental' })]));
  assert.deepEqual(groups.putIn.rentals, []);
  assert.deepEqual(groups.putIn.camping, []);
  assert.deepEqual(groups.takeOut.rentals.map((s) => s.name), ['Jadwin Canoe Rental']);
});

test('both endpoints missing is empty, not a throw', () => {
  const groups = groupEndpointServices(null, null);
  assert.deepEqual(groups, {
    putIn: { camping: [], rentals: [] },
    takeOut: { camping: [], rentals: [] },
  });
});

/* ── The ranked remainder ────────────────────────────────────────────────── */

test('only businesses that actually shuttle are recommended', () => {
  // serviceTiers unions the KIND in as a floor, so every outfitter is in
  // `rentals` whether or not it shuttles anybody. Asking the tier here
  // recommended all 71 outfitters, three of which shuttle nobody.
  const ranked = rankNearbyShuttles(
    [
      directory({ id: 'a', name: 'Shuttles Us', servicesOffered: ['shuttle'] }),
      directory({ id: 'b', name: 'Rentals Only', servicesOffered: ['canoe_rental'] }),
    ],
    AKERS,
    flatDistance,
  );
  assert.deepEqual(ranked.map((r) => r.service.name), ['Shuttles Us']);
});

test('closed, unmappable and uncontactable businesses are dropped', () => {
  const ranked = rankNearbyShuttles(
    [
      directory({ id: 'a', name: 'Open', phone: '573-555-0100' }),
      directory({ id: 'b', name: 'Closed', status: 'permanently_closed' }),
      directory({ id: 'c', name: 'No geocode', latitude: null, longitude: null }),
      directory({ id: 'd', name: 'No contact', phone: null, website: null }),
    ],
    AKERS,
    flatDistance,
  );
  assert.deepEqual(ranked.map((r) => r.service.name), ['Open']);
});

test('the shortlist is nearest first and capped at three', () => {
  const ranked = rankNearbyShuttles(
    [
      directory({ id: 'far', name: 'Far', latitude: 38.5, longitude: -91.55 }),
      directory({ id: 'near', name: 'Near', latitude: 37.38, longitude: -91.556 }),
      directory({ id: 'mid', name: 'Mid', latitude: 37.6, longitude: -91.55 }),
      directory({ id: 'x', name: 'Furthest', latitude: 39.5, longitude: -91.55 }),
    ],
    AKERS,
    flatDistance,
  );
  assert.deepEqual(ranked.map((r) => r.service.name), ['Near', 'Mid', 'Far']);
});

test('a provider already shown at an endpoint is not offered again below it', () => {
  // The whole reason the ranking survived the rewrite rather than being deleted:
  // it fills the gap the associations leave. Repeating one of them underneath,
  // with a mileage attached, presents one business as two options.
  const ranked = rankNearbyShuttles(
    [
      directory({ id: 'a', name: 'Akers Ferry Canoe Rental' }),
      directory({ id: 'b', name: 'Jadwin Canoe Rental', phone: '573-555-0199' }),
    ],
    AKERS,
    flatDistance,
    [{ name: 'Akers Ferry Canoe Rental, LLC', phone: '573-858-3224' }],
  );
  assert.deepEqual(ranked.map((r) => r.service.name), ['Jadwin Canoe Rental']);
});

/* ── Contact ─────────────────────────────────────────────────────────────── */

test('phone beats website, and a bare host gets a scheme', () => {
  assert.equal(
    serviceContactUrl({ name: 'A', phone: '(573) 858-3224', website: 'akersferry.com' }),
    'tel:5738583224',
  );
  assert.equal(
    serviceContactUrl({ name: 'A', website: 'akersferry.com' }),
    'https://akersferry.com',
  );
  assert.equal(
    serviceContactUrl({ name: 'A', website: 'http://akersferry.com' }),
    'http://akersferry.com',
    'an explicit scheme is left alone rather than doubled',
  );
  assert.equal(serviceContactUrl({ name: 'A' }), null, 'no contact means no action');
});
