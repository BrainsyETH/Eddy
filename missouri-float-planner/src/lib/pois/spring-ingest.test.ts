import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMileIndex,
  interpolateAlong,
  mileToFraction,
  metresBetween,
} from '../geo/mile-index';
import { alignMileAxis, pairAccessByName } from './mile-axis';
import { extractSprings, OFF_RIVER_LIMIT_MI, type SpringMarker } from './spring-extract';
import { dedupeSprings, sameNamedPlace, distinctiveTokens } from './spring-dedupe';
import { guideRiverSlug } from './guide-rivers';

// Covers the four pure stages behind scripts/ingestion/snap-springs.ts.
//
// The cases are not invented. Every string quoted below is real text from
// `floatmissouri_mile_markers.json`, and every numeric fixture is shaped like
// production — because the whole reason this pipeline exists is that the source
// is messier than its own `feature_type: "spring"` flag admits, and a test
// written against tidy fixtures would agree with a parser that ships garbage.

function marker(over: Partial<SpringMarker> = {}): SpringMarker {
  return {
    river_id: 'meramec-river',
    mile: 98.7,
    description: 'Roaring Spring, on left.',
    feature_type: 'spring',
    has_spring: true,
    side: 'left',
    ...over,
  };
}

// ── extract ───────────────────────────────────────────────────────────────

test('a named spring on the channel is accepted with its name', () => {
  const out = extractSprings(marker());
  assert.equal(out.named.length, 1);
  assert.equal(out.named[0].name, 'Roaring Spring');
  assert.equal(out.named[0].mile, 98.7);
});

test('the word "spring" meaning the season is not a spring', () => {
  const out = extractSprings(
    marker({ description: 'Hwy D Bridge access in spring or high water only.' }),
  );
  assert.equal(out.named.length, 0);
  assert.equal(out.unnamed.length, 0);
});

test('Spring Creek is a creek, and Springs Access is an access point', () => {
  for (const description of [
    'Spring Creek enters on left.',
    'Schlicht Springs Access on Resort Road off Hwy. 133.',
    'Mineral Springs Ford. Access in dry weather.',
    'Fiddle Springs Hollow on left.',
    'Keener Springs Resort. Fee access, camping.',
  ]) {
    const out = extractSprings(marker({ description }));
    assert.equal(out.named.length, 0, description);
  }
});

test('Weldon Spring Conservation Area does not put seven springs on the Missouri', () => {
  const out = extractSprings(
    marker({ description: 'Weldon Spring Conservation Area ends on left.' }),
  );
  assert.equal(out.named.length, 0);
});

test('a settlement that ends in Spring is not a spring', () => {
  const out = extractSprings(
    marker({ description: 'Hwy. 49 Bridge at town of Mill Spring. Camping.' }),
  );
  assert.equal(out.named.length, 0);
});

// Big Spring is the largest spring in Missouri and the obvious casualty of a
// stop list that treats size words as generic. It must survive.
test('Big Spring keeps its name', () => {
  const out = extractSprings(
    marker({ river_id: 'current-river', mile: 89.2, description: 'Big Spring. Access and campground. One of the largest springs in the world.' }),
  );
  assert.deepEqual(out.named.map((s) => s.name), ['Big Spring']);
});

test('a conjunction inside a name is kept', () => {
  const out = extractSprings(
    marker({ river_id: 'jacks-fork-river', mile: 15.9, description: 'Ebb and Flow Spring on left.' }),
  );
  assert.deepEqual(out.named.map((s) => s.name), ['Ebb and Flow Spring']);
});

test('a parenthetical alias yields one spring, not two', () => {
  const out = extractSprings(
    marker({
      river_id: 'big-piney-river',
      mile: 80,
      description:
        'Shanghai Spring (Blue Spring), 500 feet up branch at left, is comparable in size to the other large springs along the Piney.',
    }),
  );
  assert.deepEqual(out.named.map((s) => s.name), ['Shanghai Spring']);
});

test('a spring stated to be miles off the river is refused, not misplaced', () => {
  const out = extractSprings(
    marker({
      river_id: 'gasconade-river',
      mile: 123.1,
      description: 'Harrison Spring 0.3 mile up branch on left. Private.',
    }),
  );
  assert.equal(out.named.length, 0);
  assert.match(out.rejected.map((r) => r.reason).join(' '), /off the river/);
  assert.ok(0.3 > OFF_RIVER_LIMIT_MI);
});

test('a spring that merely feeds this reach is refused', () => {
  const out = extractSprings(
    marker({
      river_id: 'huzzah-river',
      mile: 23,
      description:
        'Dry Creek on left just above Hwy. 8 Bridge. Dry Creek includes water from James Spring, which has a flow of more than a million gallons per day.',
    }),
  );
  assert.equal(out.named.length, 0);
});

// The Eleven Point's mile-1.2 entry is the tail of a paragraph about Greer
// Spring, which is at mile 16.6. Trusting the fragment files the river's most
// famous spring fifteen miles from itself.
test('a mid-sentence fragment is refused whole', () => {
  const out = extractSprings(
    marker({
      river_id: 'eleven-point-river',
      mile: 1.2,
      description:
        'miles away. The average flow is more than 300 cubic feet per second and the drop is 62 feet. Greer Spring nearly doubles the size of the river.',
    }),
  );
  assert.equal(out.named.length, 0);
  assert.match(out.rejected[0].reason, /fragment/);
});

test('privacy is read from the whole marker, not the naming sentence', () => {
  const out = extractSprings(
    marker({
      river_id: 'north-fork',
      mile: 33.5,
      description:
        'Upper branch of Rainbow (Double) Spring on right. Lower branch enters river 1500 feet downstream from source. No admittance. Private use only.',
    }),
  );
  assert.equal(out.named.length, 1);
  assert.equal(out.named[0].name, 'Rainbow Spring');
  assert.equal(out.named[0].isPrivate, true);
});

test('an unnamed spring is recognised but held back rather than accepted', () => {
  const out = extractSprings(marker({ description: 'Spring at base of bluff on right. Begin long pool.' }));
  assert.equal(out.named.length, 0);
  assert.equal(out.unnamed.length, 1);
});

// ── mile axis ─────────────────────────────────────────────────────────────

test('the axis offset is the value most pairs agree on, not the average', () => {
  // Four pairs agree on +19; one is a bad name match 84 miles out. A mean would
  // report +32 and slide every spring on the river.
  const fit = alignMileAxis([
    { sourceMile: 0, targetMile: 19.1 },
    { sourceMile: 10, targetMile: 29.0 },
    { sourceMile: 20, targetMile: 39.1 },
    { sourceMile: 30, targetMile: 48.9 },
    { sourceMile: 40, targetMile: 143.0 },
  ]);
  assert.ok(fit);
  assert.ok(Math.abs(fit.offsetMiles - 19) <= 0.15, `offset ${fit.offsetMiles}`);
  assert.equal(fit.inliers, 4);
  assert.equal(fit.samples, 5);
});

test('two axes that already agree produce a zero offset', () => {
  const fit = alignMileAxis([
    { sourceMile: 5, targetMile: 5 },
    { sourceMile: 20, targetMile: 20.1 },
    { sourceMile: 40, targetMile: 40 },
  ]);
  assert.equal(fit?.offsetMiles, 0);
});

test('pairing needs a word belonging to exactly one access point', () => {
  const db = [
    { mile: 12.5, name: 'Akers Ferry Access' },
    { mile: 30.2, name: 'Bennett Spring Access' },
    { mile: 44.0, name: 'Pulltite Access' },
  ];
  // "Akers" is unique; the generic sentence shares nothing distinctive.
  const pairs = pairAccessByName(
    [
      { mile: 10.8, description: 'Akers Ferry. Camping and canoe rental.' },
      { mile: 18.0, description: 'Low-water bridge access.' },
    ],
    db,
  );
  assert.deepEqual(pairs, [{ sourceMile: 10.8, targetMile: 12.5 }]);
});

// ── mile index ────────────────────────────────────────────────────────────

test('an index interpolates between its control points', () => {
  const index = buildMileIndex([
    { mile: 0, fraction: 0 },
    { mile: 10, fraction: 0.5 },
    { mile: 20, fraction: 1 },
  ]);
  assert.equal(mileToFraction(index, 5)?.fraction, 0.25);
  assert.equal(mileToFraction(index, 5)?.bracketMiles, 10);
});

// This is the whole reason the module exists: on a river whose miles are
// editorial, the fraction is NOT mile / length, and an index built from access
// points recovers the real curve.
test('a bent mile axis is followed, not straightened', () => {
  // Half the river's miles occupy the first fifth of its line.
  const index = buildMileIndex([
    { mile: 0, fraction: 0 },
    { mile: 50, fraction: 0.2 },
    { mile: 100, fraction: 1 },
  ]);
  assert.equal(mileToFraction(index, 50)?.fraction, 0.2);
  assert.notEqual(mileToFraction(index, 50)?.fraction, 0.5);
});

test('a mile past the last control is reported as unbracketed', () => {
  const index = buildMileIndex([
    { mile: 10, fraction: 0.1 },
    { mile: 20, fraction: 0.2 },
  ]);
  assert.equal(mileToFraction(index, 40)?.bracketMiles, null);
  assert.equal(mileToFraction(index, 1)?.bracketMiles, null);
});

test('a control that contradicts the ladder is dropped, not interpolated across', () => {
  // Mile rises but fraction falls at mile 15 — a mis-snapped access point.
  const index = buildMileIndex([
    { mile: 0, fraction: 0 },
    { mile: 10, fraction: 0.4 },
    { mile: 15, fraction: 0.1 },
    { mile: 20, fraction: 0.8 },
  ]);
  assert.deepEqual(
    index.controls.map((c) => c.mile),
    [0, 15, 20],
  );
  for (let i = 1; i < index.controls.length; i += 1) {
    assert.ok(index.controls[i].fraction > index.controls[i - 1].fraction);
  }
});

test('duplicate miles do not divide by zero', () => {
  const index = buildMileIndex([
    { mile: 5, fraction: 0.1 },
    { mile: 5, fraction: 0.15 },
    { mile: 25, fraction: 0.9 },
  ]);
  const fix = mileToFraction(index, 15);
  assert.ok(fix && Number.isFinite(fix.fraction));
});

test('one control point is not enough to place anything', () => {
  assert.equal(mileToFraction(buildMileIndex([{ mile: 1, fraction: 0.1 }]), 5), null);
});

test('interpolating along a line walks it by length', () => {
  const line: [number, number][] = [
    [-91, 37],
    [-91, 37.1],
    [-91, 37.2],
  ];
  const mid = interpolateAlong(line, 0.5);
  assert.ok(mid);
  assert.ok(Math.abs(mid[1] - 37.1) < 1e-9);
  assert.ok(metresBetween(mid, [-91, 37.1]) < 1);
});

// ── dedupe ────────────────────────────────────────────────────────────────

test('the furniture in a place name is not distinctive', () => {
  assert.deepEqual([...distinctiveTokens('Alley Spring Campground')], ['alley']);
  assert.equal(distinctiveTokens('Spring').size, 0);
});

test('a spring matches the longer name that contains it', () => {
  assert.ok(sameNamedPlace('Alley Spring', 'Alley Spring and Mill'));
  assert.ok(sameNamedPlace('Boiling Spring', 'Boiling Spring Campground (BSC Outdoors)'));
  assert.ok(!sameNamedPlace('Blue Spring', 'Round Spring'));
});

test('a nameless spring is never merged with anything', () => {
  assert.ok(!sameNamedPlace('Spring', 'Round Spring'));
});

test('a spring already curated or already an access point is dropped', () => {
  const result = dedupeSprings(
    [
      { riverSlug: 'jacks-fork', name: 'Alley Spring', mile: 31 },
      { riverSlug: 'gasconade', name: 'Boiling Spring', mile: 143.7 },
      { riverSlug: 'meramec', name: 'Richart Spring', mile: 32.8 },
    ],
    [{ riverSlug: 'jacks-fork', name: 'Alley Spring and Mill', mile: 31 }],
    [{ riverSlug: 'gasconade', name: 'Boiling Spring Campground', mile: 143.4 }],
  );
  assert.deepEqual(result.kept.map((k) => k.name), ['Richart Spring']);
  assert.deepEqual(result.dropped.map((d) => d.reason), [
    'already drawn as an access point',
    'already a curated point of interest',
  ]);
});

test('the same name on two different rivers is two springs', () => {
  const result = dedupeSprings(
    [
      { riverSlug: 'current', name: 'Cave Spring', mile: 22 },
      { riverSlug: 'black', name: 'Cave Spring', mile: 19.7 },
    ],
    [{ riverSlug: 'current', name: 'Cave Spring', mile: 22.12 }],
    [],
  );
  assert.deepEqual(result.kept.map((k) => k.riverSlug), ['black']);
});

// The Meramec names Camper's Spring twice: once as the end of a park boundary
// at 88.2, once as itself at 88.5. The describing mention has to win, or the
// spring is filed a third of a mile above its own bluff.
test('between two mentions of one spring, the describing one survives', () => {
  const result = dedupeSprings(
    [
      {
        riverSlug: 'meramec',
        name: 'Camper’s Spring',
        mile: 88.2,
        sourceText: 'State park picnic ground along left bank, from bridge to Camper’s Spring.',
      },
      {
        riverSlug: 'meramec',
        name: 'Camper’s Spring',
        mile: 88.5,
        sourceText: 'Camper’s Spring on right at base of bluff.',
      },
    ],
    [],
    [],
  );
  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].mile, 88.5);
  assert.equal(result.dropped[0].reason, 'duplicate within source');
});

test('a curated row with no mile still suppresses by name', () => {
  const result = dedupeSprings(
    [{ riverSlug: 'jacks-fork', name: 'Alley Spring', mile: 31 }],
    [{ riverSlug: 'jacks-fork', name: 'Alley Spring and Mill', mile: null }],
    [],
  );
  assert.equal(result.kept.length, 0);
});

// ── guide ids → slugs ─────────────────────────────────────────────────────

// The suffix rule this table replaced was wrong on three rivers, silently. Each
// case is pinned here because each looked correct and shipped for months in
// src/lib/social/section-picker.ts.
test('a guide id whose slug keeps its suffix is not stripped', () => {
  assert.equal(guideRiverSlug('bryant-creek'), 'bryant-creek');
});

test('a guide id shorter than its slug is not guessed at', () => {
  assert.equal(guideRiverSlug('north-fork'), 'north-fork-white');
});

// The worst of the three: two rivers collapsing onto one key served Big
// Creek's markers as Big River's.
test('big-river and big-creek do not collide', () => {
  assert.equal(guideRiverSlug('big-river'), 'big-river');
  assert.equal(guideRiverSlug('big-creek'), null);
  assert.notEqual(guideRiverSlug('big-river'), guideRiverSlug('big-creek'));
});

test('a guide river Eddy does not carry returns null, not a plausible slug', () => {
  for (const id of ['missouri-river', 'little-niangua-river', 'sac-river', 'osage-fork']) {
    assert.equal(guideRiverSlug(id), null, id);
  }
});

test('the ordinary suffixed ids still map', () => {
  assert.equal(guideRiverSlug('current-river'), 'current');
  assert.equal(guideRiverSlug('jacks-fork-river'), 'jacks-fork');
  assert.equal(guideRiverSlug('eleven-point-river'), 'eleven-point');
});
