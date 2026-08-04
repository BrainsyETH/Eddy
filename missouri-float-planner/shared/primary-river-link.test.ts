import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasUnresolvablePrimaryTie,
  orderRiverLinks,
  pickPrimaryRiverLink,
} from './primary-river-link';

// The real arrangement this module exists for: 07014000 sits on the Huzzah,
// and Courtois — which has no gauge of its own — borrows it from five miles
// away. Both rows are correctly is_primary.
const HUZZAH = { isPrimary: true, riverSlug: 'huzzah', distanceFromSectionMiles: 0 };
const COURTOIS = { isPrimary: true, riverSlug: 'courtois', distanceFromSectionMiles: 5 };

// ── the bug this module exists to prevent ────────────────────────

test('a shared gauge resolves to the river it physically sits on', () => {
  // The regression: every consumer used `find(l => l.isPrimary) || links[0]`,
  // which returns whichever row the query ordered first. With two primaries
  // that is arbitrary, so the same gauge could present as Huzzah on the map and
  // Courtois on the detail screen in one session, with nothing logged.
  //
  // Alphabetically Courtois wins, so a tiebreak that ignored distance would get
  // this exactly wrong — which is what makes distance the right tiebreak rather
  // than merely a stable one.
  assert.equal(pickPrimaryRiverLink([HUZZAH, COURTOIS])?.riverSlug, 'huzzah');
  assert.equal(pickPrimaryRiverLink([COURTOIS, HUZZAH])?.riverSlug, 'huzzah');
});

test('the answer does not depend on input order', () => {
  const a = orderRiverLinks([HUZZAH, COURTOIS]).map((l) => l.riverSlug);
  const b = orderRiverLinks([COURTOIS, HUZZAH]).map((l) => l.riverSlug);
  assert.deepEqual(a, b);
});

test('primary always outranks non-primary, whatever the distance', () => {
  // A non-primary association can be nearer — a gauge just upstream of another
  // river's put-in — and must still lose.
  const nearNonPrimary = { isPrimary: false, riverSlug: 'meramec', distanceFromSectionMiles: 0.1 };
  const farPrimary = { isPrimary: true, riverSlug: 'huzzah', distanceFromSectionMiles: 12 };
  assert.equal(pickPrimaryRiverLink([nearNonPrimary, farPrimary])?.riverSlug, 'huzzah');
});

// ── degradation where distance is not plumbed ────────────────────

test('missing distances fall back to the slug, which is stable if arbitrary', () => {
  // Not every payload carries distance yet. Alphabetical is not meaningful, but
  // it IS the same answer on every surface every time, which is the property
  // that was missing.
  const a = { isPrimary: true, riverSlug: 'zebra' };
  const b = { isPrimary: true, riverSlug: 'alpha' };
  assert.equal(pickPrimaryRiverLink([a, b])?.riverSlug, 'alpha');
  assert.equal(pickPrimaryRiverLink([b, a])?.riverSlug, 'alpha');
});

test('a measured link beats an unmeasured one', () => {
  const measured = { isPrimary: true, riverSlug: 'zebra', distanceFromSectionMiles: 3 };
  const unmeasured = { isPrimary: true, riverSlug: 'alpha', distanceFromSectionMiles: null };
  assert.equal(pickPrimaryRiverLink([unmeasured, measured])?.riverSlug, 'zebra');
});

test('an empty or absent link list resolves to null, not a guess', () => {
  // The national gauge tier rates no river at all. An honest null, not ''.
  assert.equal(pickPrimaryRiverLink([]), null);
  assert.equal(pickPrimaryRiverLink(null), null);
  assert.equal(pickPrimaryRiverLink(undefined), null);
});

test('orderRiverLinks does not mutate its input', () => {
  const links = [COURTOIS, HUZZAH];
  orderRiverLinks(links);
  assert.equal(links[0].riverSlug, 'courtois');
});

// ── what counts as reportable ────────────────────────────────────

test('a resolvable tie is not reportable', () => {
  // Sharing a gauge is legitimate. Only an unorderable tie needs a human.
  assert.equal(hasUnresolvablePrimaryTie([HUZZAH, COURTOIS]), false);
});

test('one primary is never a tie', () => {
  assert.equal(hasUnresolvablePrimaryTie([HUZZAH]), false);
  assert.equal(hasUnresolvablePrimaryTie([HUZZAH, { ...COURTOIS, isPrimary: false }]), false);
});

test('equal distances are unresolvable', () => {
  assert.equal(
    hasUnresolvablePrimaryTie([
      { isPrimary: true, riverSlug: 'a', distanceFromSectionMiles: 2 },
      { isPrimary: true, riverSlug: 'b', distanceFromSectionMiles: 2 },
    ]),
    true,
  );
});

test('any missing distance makes the tie unresolvable', () => {
  // Unknown is not "far". Sorting null last would silently pick the measured
  // river and hide the gap that made the choice arbitrary.
  assert.equal(hasUnresolvablePrimaryTie([HUZZAH, { ...COURTOIS, distanceFromSectionMiles: null }]), true);
  assert.equal(hasUnresolvablePrimaryTie([{ isPrimary: true, riverSlug: 'a' }, { isPrimary: true, riverSlug: 'b' }]), true);
});
