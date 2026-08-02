import assert from 'node:assert/strict';
import test from 'node:test';
import { bookableLoops, foldGrid } from './usedirect';

// Fixture shapes are transcribed from live `search/place` and `search/grid`
// responses for Meramec (place 60, loops keyed by their own global ids) and
// Sam A. Baker (place 79, loops keyed 1..6 with global ids in the 820s).

test('loops are read by their global FacilityId, never by the dictionary key', () => {
  // The Sam A. Baker shape. Keying off the dictionary would send FacilityId=2
  // to search/grid, which answers HTTP 200 with "Invalid FacilityId specified"
  // and an empty Units map — so the park reports zero sites and looks merely
  // full instead of broken. Half the Missouri parks are keyed this way.
  const loops = bookableLoops({
    SelectedPlace: {
      Name: 'Sam A. Baker State Park',
      Facilities: {
        '1': { FacilityId: 820, Name: 'Campground 1 (sites 1-43)', InSeason: true },
        '2': { FacilityId: 821, Name: 'Campground 1 (sites 44-95)', InSeason: true },
        '3': { FacilityId: 822, Name: 'Equestrian Campground', InSeason: true },
      },
    },
  });

  assert.deepEqual(loops, [820, 821, 822]);
});

test('out-of-season loops are dropped before they cost a request', () => {
  const loops = bookableLoops({
    SelectedPlace: {
      Facilities: {
        '802': { FacilityId: 802, Name: 'Group Tenting', InSeason: false },
        '803': { FacilityId: 803, Name: 'Section 1', InSeason: true },
      },
    },
  });

  assert.deepEqual(loops, [803]);
});

test('a loop with no usable id is skipped rather than sent as NaN', () => {
  const loops = bookableLoops({
    SelectedPlace: { Facilities: { '1': { Name: 'Shelters', InSeason: true } } },
  });
  assert.deepEqual(loops, []);
});

test('a place with no facilities yields no loops', () => {
  // Current River State Park is day-use: it has a place id and no camping.
  assert.deepEqual(bookableLoops({ SelectedPlace: { Facilities: {} } }), []);
  assert.deepEqual(bookableLoops({}), []);
});

test('a unit is open for a night only when that night is free', () => {
  const folded = foldGrid({
    Facility: {
      Units: {
        u1: {
          Name: 'Electric 50 amp #178',
          Slices: {
            '2026-08-07T00:00:00': { IsFree: false },
            '2026-08-08T00:00:00': { IsFree: true },
          },
        },
        u2: {
          Name: 'Basic #12',
          Slices: {
            '2026-08-07T00:00:00': { IsFree: true },
            '2026-08-08T00:00:00': { IsFree: true },
          },
        },
      },
    },
  });

  assert.deepEqual(folded.get('2026-08-07'), { open: 1, total: 2 });
  assert.deepEqual(folded.get('2026-08-08'), { open: 2, total: 2 });
});

test('every unit counts toward the total, free or not', () => {
  // UseDirect has no walk-up concept — if a unit appears in the grid it is
  // bookable, so unlike the federal feed the denominator is simply the count.
  const folded = foldGrid({
    Facility: {
      Units: Object.fromEntries(
        Array.from({ length: 56 }, (_, i) => [
          `u${i}`,
          { Slices: { '2026-08-07T00:00:00': { IsFree: i < 5 } } },
        ]),
      ),
    },
  });

  assert.deepEqual(folded.get('2026-08-07'), { open: 5, total: 56 });
});

test('a missing IsFree is treated as taken, not as free', () => {
  const folded = foldGrid({
    Facility: { Units: { u1: { Slices: { '2026-08-07T00:00:00': {} } } } },
  });
  assert.deepEqual(folded.get('2026-08-07'), { open: 0, total: 1 });
});

test('an empty grid folds to nothing rather than throwing', () => {
  assert.equal(foldGrid({}).size, 0);
  assert.equal(foldGrid({ Facility: { Units: {} } }).size, 0);
});
