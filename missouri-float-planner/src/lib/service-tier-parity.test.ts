import assert from 'node:assert/strict';
import test from 'node:test';
import { serviceEligible as appServiceEligible, serviceTiers as appServiceTiers } from '@eddy/types';
import {
  serviceEligible as webServiceEligible,
  serviceTiers as webServiceTiers,
  TIER_ORDER,
} from './service-tiers';

// Two copies of the tier model, and the only thing keeping them one model.
//
// ── Why there are two ─────────────────────────────────────────────────────
//
// Vercel builds only missouri-float-planner/, so shippable web code cannot
// import from packages/ — the app's `serviceTiers` is unreachable from the
// river page. The website therefore mirrors it, exactly as src/types/api.ts
// mirrors the wire types and /api/services declares its own MappedService.
//
// ── Why an exhaustive sweep and not a handful of cases ────────────────────
//
// The divergence this replaced was invisible for months precisely because both
// sides looked right in isolation: the page grouped by `type` and every
// individual row landed SOMEWHERE. What was missing was a row landing in two
// places at once, which no single-row assertion notices. So this runs every
// kind against every subset of the offerings that decide a tier, and compares
// the full arrays.
const KINDS = [
  'outfitter',
  'campground',
  'cabin_lodge',
  'canoe_rental',
  'shuttle',
  'lodging',
  // Not a type either vocabulary declares. Both sides must still answer, and
  // must answer the same thing — the "never empty" rule.
  'something_eddy_has_never_seen',
];

const TIER_DECIDING_OFFERINGS = [
  'canoe_rental',
  'kayak_rental',
  'raft_rental',
  'tube_rental',
  'jon_boat_rental',
  'shuttle',
  'camping_primitive',
  'camping_rv',
  'cabins',
  'lodge_rooms',
];

/** Offerings that decide nothing, and must not shift a tier on either side. */
const INERT_OFFERINGS = ['showers', 'boat_ramp', 'wifi', 'playground'];

function subsets<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 0; mask < 1 << items.length; mask += 1) {
    out.push(items.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

test('the website and the app agree on every kind and every offering combination', () => {
  let compared = 0;
  for (const type of KINDS) {
    for (const offerings of subsets(TIER_DECIDING_OFFERINGS)) {
      const service = { type, servicesOffered: offerings };
      assert.deepEqual(
        webServiceTiers(service),
        appServiceTiers(service),
        `tiers disagree for ${type} offering [${offerings.join(', ')}]`,
      );
      compared += 1;
    }
  }
  // 7 kinds × 2^10 offering subsets. Asserted so a future edit that narrows the
  // sweep cannot leave this test passing on a fraction of the space.
  assert.equal(compared, KINDS.length * 2 ** TIER_DECIDING_OFFERINGS.length);
});

test('null, undefined and inert offerings agree too', () => {
  for (const type of KINDS) {
    for (const servicesOffered of [null, undefined, [], INERT_OFFERINGS]) {
      const service = { type, servicesOffered };
      assert.deepEqual(
        webServiceTiers(service),
        appServiceTiers(service),
        `tiers disagree for ${type} with ${JSON.stringify(servicesOffered)}`,
      );
    }
  }
});

test('a business in two tiers is reported in both', () => {
  // The case the river page could not express, and the reason for the change:
  // one campground row that also rents cabins is an answer to two questions.
  assert.deepEqual(
    webServiceTiers({ type: 'campground', servicesOffered: ['cabins'] }),
    ['camping', 'lodging'],
  );
  assert.deepEqual(
    webServiceTiers({ type: 'outfitter', servicesOffered: ['camping_rv', 'lodge_rooms'] }),
    ['rentals', 'camping', 'lodging'],
  );
});

test('the kind is a floor the capabilities cannot lower', () => {
  // Ten campgrounds record showers and a boat ramp and no camping_* offering.
  // A capability-pure tier would drop them out of Campgrounds entirely.
  assert.deepEqual(
    webServiceTiers({ type: 'campground', servicesOffered: ['showers', 'boat_ramp'] }),
    ['camping'],
  );
  assert.deepEqual(webServiceTiers({ type: 'cabin_lodge', servicesOffered: ['shuttle'] }), [
    'rentals',
    'lodging',
  ]);
});

test('the tier order is stable and shared', () => {
  assert.deepEqual(TIER_ORDER, ['rentals', 'camping', 'lodging']);
  // Membership is a set; the ORDER of the returned array is the tier order, not
  // the order the offerings happened to be listed in.
  const a = webServiceTiers({ type: 'campground', servicesOffered: ['cabins', 'kayak_rental'] });
  const b = webServiceTiers({ type: 'campground', servicesOffered: ['kayak_rental', 'cabins'] });
  assert.deepEqual(a, b);
  assert.deepEqual(a, ['rentals', 'camping', 'lodging']);
});

// ── Eligibility, the other half that has to match ──────────────────────────
//
// Same arrangement, same reason, and the divergence here was live rather than
// theoretical: the app filtered closed businesses out and the website did not,
// so eddy.guide kept a card and a tappable phone number for an outfitter the
// phone had already stopped showing. Both copies must answer identically for
// every status the column can hold — including the ones it does not have yet.

test('both copies agree on which businesses may be shown', () => {
  const STATUSES = [
    'active',
    'unverified',
    'permanently_closed',
    'temporarily_closed',
    // Silence is the common case and must read as eligible: most rows say
    // nothing, and treating "not told" as closed would empty the directory.
    null,
    undefined,
    // A value neither vocabulary declares. Both sides must still answer, and
    // answer the same way, rather than one of them quietly hiding the row.
    'seasonal_hours',
  ];

  for (const status of STATUSES) {
    assert.equal(
      webServiceEligible({ status }),
      appServiceEligible({ status }),
      `status ${String(status)} is classified differently by the two copies`
    );
  }
});

test('closed businesses are excluded and everything else is kept', () => {
  // The rule itself, stated once so a parity test passing on two identically
  // wrong copies is still caught.
  assert.equal(webServiceEligible({ status: 'permanently_closed' }), false);
  assert.equal(webServiceEligible({ status: 'temporarily_closed' }), false);
  assert.equal(webServiceEligible({ status: 'active' }), true);
  assert.equal(webServiceEligible({ status: null }), true, 'absent means eligible');
  assert.equal(webServiceEligible({}), true, 'so does missing entirely');
});
