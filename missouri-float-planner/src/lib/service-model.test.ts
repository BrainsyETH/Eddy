import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isKnownServiceType,
  serviceEligible,
  serviceOffers,
  serviceTiers,
  type ServiceTier,
} from '@eddy/types';
import {
  LAYER_SERVICE_TIER,
  serviceOnLayer,
  serviceTypeLabel,
} from '../../../eddy-ios/src/map/serviceLayers';

// Covers the service classification the map, the layer counts, the planner and
// the Place tab all now share. Run from here because neither the Expo app nor
// packages/ has a runner of its own — see tsconfig.test.json's header.
//
// ── WHAT THIS FILE IS DEFENDING ───────────────────────────────────────────
// A map layer once declared its membership as a list of TYPE STRINGS, three of
// which the services directory has never held, and one of which — `cabin_lodge`,
// 41 of 156 rows — it held and the list omitted. Nothing failed. The layer just
// quietly drew nothing for every cabin and lodge Eddy has, under a row whose own
// description promised lodging.
//
// So the tests below are mostly about the cases where a SILENT wrong answer is
// the failure mode: a type nobody mapped, a capability nobody read, a business
// that closed.

const svc = (over: Partial<{ type: string; servicesOffered: string[]; status: string }> = {}) => ({
  type: 'outfitter',
  servicesOffered: [] as string[],
  ...over,
});

/* ── Membership is a set ─────────────────────────────────────────────────── */

test('an outfitter that rents cabins is in both tiers', () => {
  // The case a single-valued classifier cannot express, and it is not an edge:
  // 27 of the directory's 71 outfitters record `cabins`. Asked to pick one
  // group, every one of them would have to drop a true answer.
  const tiers = serviceTiers(svc({ type: 'outfitter', servicesOffered: ['shuttle', 'cabins'] }));
  assert.deepEqual(tiers, ['rentals', 'lodging']);
});

test('a campground that rents kayaks reaches the rentals tier', () => {
  const tiers = serviceTiers(
    svc({ type: 'campground', servicesOffered: ['kayak_rental', 'camping_rv'] }),
  );
  assert.deepEqual(tiers, ['rentals', 'camping']);
});

test('tiers come back in a stable order, never in capability order', () => {
  // The order is the display order, so a caller taking [0] for a label gets the
  // same answer whichever way the feed happened to list the offerings.
  const a = serviceTiers(svc({ type: 'campground', servicesOffered: ['cabins', 'kayak_rental'] }));
  const b = serviceTiers(svc({ type: 'campground', servicesOffered: ['kayak_rental', 'cabins'] }));
  assert.deepEqual(a, b);
  assert.deepEqual(a, ['rentals', 'camping', 'lodging']);
});

/* ── The kind is the floor, and that is load-bearing ─────────────────────── */

test('a campground with no camping offering is still camping', () => {
  // TEN campgrounds in the directory record showers, a boat ramp or vault
  // toilets and no `camping_*` offering at all. A capability-pure tier would
  // drop every one of them from the only layer that answers "where do I pitch".
  // The kind is unioned in, never overridden.
  const tiers = serviceTiers(svc({ type: 'campground', servicesOffered: ['showers', 'boat_ramp'] }));
  assert.deepEqual(tiers, ['camping']);
});

test('a cabin_lodge with no offerings recorded is still lodging', () => {
  assert.deepEqual(serviceTiers(svc({ type: 'cabin_lodge' })), ['lodging']);
});

test('capabilities add tiers, they never remove the kind', () => {
  // A cabin_lodge that also shuttles gains rentals and keeps lodging. If
  // capability-first meant capability-only, the roof would vanish from a row
  // whose whole business is roofs.
  assert.deepEqual(serviceTiers(svc({ type: 'cabin_lodge', servicesOffered: ['shuttle'] })), [
    'rentals',
    'lodging',
  ]);
});

/* ── Both vocabularies, and the one that used to fall off ────────────────── */

test('every declared type resolves to a tier', () => {
  // The directory enum and the access-point JSONB enum, in one list. This is the
  // check that would have caught `cabin_lodge` on the day it was added — though
  // the real guard is the `satisfies Record<KnownServiceType, ServiceTier>` in
  // @eddy/types, which fails the BUILD rather than a test run.
  const declared = [
    'outfitter',
    'campground',
    'cabin_lodge',
    'canoe_rental',
    'shuttle',
    'lodging',
  ];
  for (const type of declared) {
    assert.ok(isKnownServiceType(type), `${type} is not a known service type`);
    assert.ok(serviceTiers(svc({ type })).length > 0, `${type} resolved to no tier`);
  }
});

test('lodging and cabin_lodge are the same claim under two names', () => {
  // The access point's JSONB says `lodging`; the directory table says
  // `cabin_lodge`. Two vocabularies for one thing is what started all of this,
  // and the one place they are reconciled is here.
  assert.deepEqual(serviceTiers(svc({ type: 'lodging' })), serviceTiers(svc({ type: 'cabin_lodge' })));
});

/* ── Unknown values degrade visibly, not silently ────────────────────────── */

test('an unrecognised type still lands in a tier', () => {
  // A directory that grows a fourth enum value must degrade to a visible pin
  // under a broad heading, never to an invisible one. `mappable.ts`'s "a wrong
  // pin is worse than none" is a rule about LOCATION — this pin is in the right
  // place, it is only generically labelled.
  const tiers = serviceTiers(svc({ type: 'kayak_school' }));
  assert.ok(tiers.length > 0, 'an unknown type must never resolve to no tier');
  assert.equal(isKnownServiceType('kayak_school'), false);
});

test('an unknown type is labelled by its tier, never by its raw string', () => {
  // "cabin lodge" in lowercase was the live symptom of the old fallback, which
  // ran `type.replace(/_/g, ' ')`. A database token is not a thing to show
  // somebody.
  const label = serviceTypeLabel(svc({ type: 'kayak_school' }));
  assert.ok(!label.includes('_'), label);
  assert.equal(label, 'Rentals & shuttles');
});

test('cabin_lodge has a real label on both platforms', () => {
  assert.equal(serviceTypeLabel(svc({ type: 'cabin_lodge' })), 'Cabin or lodge');
  assert.equal(serviceTypeLabel(svc({ type: 'lodging' })), 'Cabin or lodge');
});

/* ── Eligibility is a separate question from classification ──────────────── */

test('classification says nothing about whether to show it', () => {
  // A permanently closed outfitter is still an outfitter. Keeping these apart is
  // what stops a layer filter from quietly becoming a safety decision.
  const closed = svc({ type: 'outfitter', status: 'permanently_closed' });
  assert.deepEqual(serviceTiers(closed), ['rentals']);
  assert.equal(serviceEligible(closed), false);
});

test('unverified is eligible; closed is not', () => {
  // `unverified` means nobody has confirmed the listing recently, not that the
  // business is gone — hiding it would remove nine of the directory's
  // seventy-one outfitters over a housekeeping flag.
  assert.equal(serviceEligible(svc({ status: 'unverified' })), true);
  assert.equal(serviceEligible(svc({ status: 'active' })), true);
  assert.equal(serviceEligible(svc({ status: 'seasonal' })), true);
  assert.equal(serviceEligible(svc({ status: 'temporarily_closed' })), false);
  assert.equal(serviceEligible(svc({ status: 'permanently_closed' })), false);
});

test('a service with no status recorded is eligible', () => {
  // Absent means "not told", which is a different claim from "known to be shut"
  // — the same rule `geocodePrecision` follows for a null.
  assert.equal(serviceEligible(svc()), true);
  assert.equal(serviceEligible({ status: null }), true);
});

/* ── Tier to layer ───────────────────────────────────────────────────────── */

test('layers draw the tier they own, not a list of type strings', () => {
  const cabinRentingOutfitter = svc({
    type: 'outfitter',
    servicesOffered: ['shuttle', 'cabins'],
  });
  assert.equal(serviceOnLayer(cabinRentingOutfitter, 'outfitters'), true);
  assert.equal(serviceOnLayer(cabinRentingOutfitter, 'lodging'), true);
  assert.equal(serviceOnLayer(cabinRentingOutfitter, 'campgrounds'), false);
});

test('a cabin_lodge reaches the lodging layer, which is the whole bug', () => {
  // 41 rows drew on no layer at all, because the outfitters filter was a list of
  // four strings that did not include this one.
  assert.equal(serviceOnLayer(svc({ type: 'cabin_lodge' }), 'lodging'), true);
});

test('only the three service layers can be asked about at all', () => {
  // Hazards, gauges and dams come from other tables entirely, and the type
  // refuses the question rather than answering `false` — `serviceOnLayer(s,
  // 'hazards')` does not compile. This asserts the table itself, since that is
  // the part a test can still reach.
  assert.deepEqual(Object.keys(LAYER_SERVICE_TIER).sort(), [
    'campgrounds',
    'lodging',
    'outfitters',
  ]);
});

test('the tier vocabulary and the layer table agree', () => {
  // Every tier a service can be classified into must have a layer that draws it,
  // or a classification is a place a pin goes to disappear.
  const tiers: ServiceTier[] = ['rentals', 'camping', 'lodging'];
  const layers = ['outfitters', 'lodging', 'campgrounds'] as const;
  for (const tier of tiers) {
    const drawn = layers.some((layer) =>
      serviceOnLayer({ type: 'unknown_kind', servicesOffered: offeringFor(tier) }, layer),
    );
    assert.ok(drawn, `no layer draws the ${tier} tier`);
  }
});

/** One offering that puts a service in the given tier, for the check above. */
function offeringFor(tier: ServiceTier): string[] {
  if (tier === 'rentals') return ['shuttle'];
  if (tier === 'camping') return ['camping_primitive'];
  return ['cabins'];
}

/* ── A capability is not a tier ──────────────────────────────────────────── */

test('serviceOffers asks what a business DOES, where a tier asks what it is', () => {
  // The distinction the planner needed. Every `outfitter` is in the rentals
  // tier through the kind floor — right for a map layer, wrong for a heading
  // that names one service. 68 of the directory's 71 outfitters record a
  // shuttle; three do not, and were recommended under "Shuttles near the
  // put-in" until this predicate existed.
  const noShuttle = svc({ type: 'outfitter', servicesOffered: ['canoe_rental'] });
  assert.ok(serviceTiers(noShuttle).includes('rentals'), 'still an outfitter');
  assert.equal(serviceOffers(noShuttle, 'shuttle'), false, 'but it shuttles nobody');
});

test('a campground that runs a shuttle qualifies as one', () => {
  // Ten non-outfitters in the directory offer shuttles. The old type-based list
  // could not express this at all.
  assert.equal(
    serviceOffers(svc({ type: 'campground', servicesOffered: ['shuttle'] }), 'shuttle'),
    true,
  );
});

test('serviceOffers has NO kind fallback, deliberately', () => {
  // A fallback would re-admit exactly the rows this exists to exclude. Every
  // outfitter in the directory records at least one capability, so it would
  // protect nothing today — and a row that somehow has none should drop out of
  // a RECOMMENDATION while staying listed and mapped everywhere else.
  assert.equal(serviceOffers(svc({ type: 'outfitter', servicesOffered: [] }), 'shuttle'), false);
  assert.equal(serviceOffers({ servicesOffered: null }, 'shuttle'), false);
  assert.equal(serviceOffers({}, 'shuttle'), false);
});

/* ── Coverage is a fact about rows, not about drawn pins ─────────────────── */

test('a service in two tiers is located in both', () => {
  // The coverage bug: the lodging PIN count subtracts whatever the rentals tier
  // is already drawing (one service, one pin), and the total did not. Ten of
  // the thirteen mappable lodging rows are also rentals, so a note derived from
  // the pin count read "3 of 81" where the truth is 13 of 81.
  //
  // Coverage is counted per tier BEFORE any cross-tier deduplication, so a
  // cabin-renting outfitter counts as located under both.
  const cabinRentingOutfitter = svc({
    type: 'outfitter',
    servicesOffered: ['shuttle', 'cabins'],
  });
  assert.equal(serviceOnLayer(cabinRentingOutfitter, 'outfitters'), true);
  assert.equal(serviceOnLayer(cabinRentingOutfitter, 'lodging'), true);
});
