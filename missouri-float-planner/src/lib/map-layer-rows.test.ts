import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  accessOverlapNote,
  activeRoles,
  resolveAccessMarkers,
  type RoleStats,
} from '../../../eddy-ios/src/map/accessLayers';
import { groupLayerRows, layerRowCount } from '../../../eddy-ios/src/map/layerRows';
import type { MapAccessPoint } from '@eddy/types';

// The three shapes of row the sheet draws, as the count rule sees them.
const PLAIN = { key: 'campgrounds' } as const;
const PARTITIONED = { key: 'gauges', tiers: ['gauges', 'allGauges'] } as const;
const REFINED = {
  key: 'access',
  tiers: ['access', 'boatRamps'],
  tiersRefine: true,
} as const;

test('a row with no tiers reports its own key', () => {
  assert.equal(layerRowCount(PLAIN, ['campgrounds'], { campgrounds: 78 }), 78);
  // Including while it is off: a count is a fact about the data, and every
  // untiered row has always printed one whatever its switch is set to.
  assert.equal(layerRowCount(PLAIN, [], { campgrounds: 78 }), 78);
  assert.equal(layerRowCount(PLAIN, ['campgrounds'], {}), undefined);
});

test('partitioning tiers are summed, and only the live ones', () => {
  const counts = { gauges: 40, allGauges: 1200 };
  assert.equal(layerRowCount(PARTITIONED, ['gauges'], counts), 40);
  assert.equal(layerRowCount(PARTITIONED, ['gauges', 'allGauges'], counts), 1240);
});

test('a tier that has not answered makes the whole row unknown', () => {
  // "1" beside a row whose second tier is still fetching is a number that will
  // change under the reader's eyes.
  assert.equal(layerRowCount(PARTITIONED, ['gauges', 'allGauges'], { gauges: 40 }), undefined);
});

test('refining tiers report the outermost live one, never the sum', () => {
  // Every ramp is already inside "all access". Summing them would put 60 beside
  // a row holding 50 places.
  const counts = { access: 50, boatRamps: 10 };
  assert.equal(layerRowCount(REFINED, ['access', 'boatRamps'], counts), 50);
  assert.equal(layerRowCount(REFINED, ['access'], counts), 50);
});

test('ramps alone report the ramps, not the whole population', () => {
  // THE DEFECT THIS RULE REPLACED. Reachable: turning a row off clears its
  // tiers, but the chips toggle independently, so "All access" can be off while
  // "Boat ramps" is on — and the row then draws ten places. It used to say 50.
  assert.equal(layerRowCount(REFINED, ['boatRamps'], { access: 50, boatRamps: 10 }), 10);
});

test('a row with nothing live describes nothing', () => {
  // Rather than falling back to the whole population, which would make the
  // figure jump UP as the reader switches the row OFF.
  assert.equal(layerRowCount(REFINED, [], { access: 50, boatRamps: 10 }), undefined);
  assert.equal(layerRowCount(REFINED, ['campgrounds'], { access: 50 }), undefined);
  assert.equal(layerRowCount(PARTITIONED, [], { gauges: 40 }), undefined);
});

test('the count a row prints is the count the resolver measured', () => {
  // The two halves joined: whatever `layerCounts` feeds the sheet for these
  // keys comes from statsByRole, and the projection picks between them.
  const at = (lat: number, types: string[]) => ({
    point: {
      id: `p${lat}`,
      name: 'x',
      riverMile: 1,
      type: 'access',
      isPublic: true,
      types,
      coordinates: { lng: -91, lat },
    } as MapAccessPoint,
  });
  const resolved = resolveAccessMarkers(
    {
      accessPoints: [at(37.1, ['access']), at(37.2, ['access', 'boat_ramp'])],
      services: [],
    },
    activeRoles(['boatRamps']),
  );
  const counts = {
    access: resolved.statsByRole.access.totalMatches,
    boatRamps: resolved.statsByRole.boatRamp.totalMatches,
  };
  assert.equal(layerRowCount(REFINED, ['boatRamps'], counts), 1);
  assert.equal(resolved.markers.length, 1, 'and one place is what actually draws');
});

// Covers what a layers-sheet ROW says: the figure beside the switch
// (map/layerRows.ts) and the line underneath saying where that row's places
// actually went (accessOverlapNote).
//
// Both exist because the access family's counts became MEMBERSHIP (ADR 0008):
// "Boat ramps · 10" stays 10 while three of those ten wear tents, so without the
// sentence a reader counts ramp marks, finds seven, and concludes the map is
// broken. The numbers therefore have to come from one pass over the data.
//
// The projection is tested apart from the resolver on purpose. The resolver's
// algebra can be perfectly right — 10 places hold the ramp role, 7 wear the mark
// — while the sheet prints the wrong one of those numbers beside the switch,
// which is exactly the defect that shipped: a row that read its own key
// unconditionally announced fifty access points in a state that draws ten.

function stats(over: Partial<RoleStats> = {}): RoleStats {
  return {
    totalMatches: 0,
    ownedMarkers: 0,
    representedElsewhere: 0,
    notShown: 0,
    representedBy: {},
    ...over,
  };
}

test('silent when every place wears its own mark', () => {
  // Absent, never empty — the same rule the sheet's sections follow. A row with
  // nothing to explain must not print a sentence explaining nothing.
  assert.equal(
    accessOverlapNote('boatRamp', stats({ totalMatches: 10, ownedMarkers: 10 })),
    null,
  );
  assert.equal(accessOverlapNote('access', stats()), null);
});

test('names the layer the places went to, rather than "somewhere else"', () => {
  assert.equal(
    accessOverlapNote(
      'boatRamp',
      stats({
        totalMatches: 10,
        ownedMarkers: 7,
        representedElsewhere: 3,
        representedBy: { campground: 3 },
      }),
    ),
    '7 drawn as boat ramps · 3 as campgrounds',
  );
});

test('lists every destination, in mark-priority order', () => {
  assert.equal(
    accessOverlapNote(
      'access',
      stats({
        totalMatches: 50,
        ownedMarkers: 46,
        representedElsewhere: 4,
        representedBy: { boatRamp: 1, campground: 3 },
      }),
    ),
    '46 drawn as access points · 3 as campgrounds · 1 as boat ramps',
  );
});

test('says when a filter is hiding places outright', () => {
  // The bucket P3b added. Without it the sentence would claim 2 of 4 places are
  // accounted for and stay silent about the other two.
  assert.equal(
    accessOverlapNote(
      'access',
      stats({
        totalMatches: 4,
        ownedMarkers: 0,
        representedElsewhere: 2,
        representedBy: { boatRamp: 2 },
        notShown: 2,
      }),
    ),
    '0 drawn as access points · 2 as boat ramps · 2 not shown',
  );
});

test('the note and the row count come from the same resolve', () => {
  const point = (over: Partial<MapAccessPoint>): MapAccessPoint =>
    ({
      id: 'x',
      name: 'x',
      riverMile: 1,
      type: 'access',
      isPublic: true,
      coordinates: { lng: -91, lat: 37 },
      ...over,
    }) as MapAccessPoint;

  const accessPoints = [
    { point: point({ id: 'a', types: ['access', 'boat_ramp'] }) },
    { point: point({ id: 'b', types: ['access', 'boat_ramp', 'campground'] }) },
    { point: point({ id: 'c', types: ['access'] }) },
  ];
  const resolved = resolveAccessMarkers(
    { accessPoints, services: [] },
    activeRoles(['access', 'campgrounds', 'boatRamps']),
  );
  const ramps = resolved.statsByRole.boatRamp;

  // The row prints totalMatches; the note accounts for all of it.
  assert.equal(ramps.totalMatches, 2);
  assert.equal(accessOverlapNote('boatRamp', ramps), '1 drawn as boat ramps · 1 as campgrounds');
  const drawnAsRamps = resolved.markers.filter((m) => m.owner === 'boatRamp').length;
  assert.equal(drawnAsRamps, ramps.ownedMarkers);
});

test('the sheet does not hand-build a representation sentence of its own', () => {
  // ── WHAT THIS GUARD NOW PROTECTS ────────────────────────────────────────
  //
  // It used to assert the OPPOSITE — that the map screen called
  // `accessOverlapNote` — because the sheet printed the sentence and the risk
  // was a component recomputing it beside the count and drifting from it.
  //
  // The sheet no longer prints it at all: "138 drawn as access points · 103 as
  // campgrounds" is a data-integrity fact, and a "Show on map" drawer is where
  // somebody controls a map, not where Eddy explains its mark-priority rules.
  // The resolver still computes the buckets and the tests above still pin the
  // algebra, so the capability is intact for an internal panel to use.
  //
  // The drift risk survives the removal, inverted: the temptation now is a
  // component assembling "N drawn as X" out of `layers.includes(...)`, which
  // would be both a second derivation AND the copy that was just removed. So
  // the guard is that the screen builds no such sentence itself.
  const screen = readFileSync(
    join(process.cwd(), '../eddy-ios/app/(tabs)/index.tsx'),
    'utf8',
  );
  // CODE ONLY. The comments in that file explain what was removed and quote
  // the old copy while doing it, which is exactly what a reader arriving at
  // the change needs and exactly what a naive scan would trip over. Stripping
  // them is what makes this a guard against SHIPPING the sentence rather than
  // against mentioning it. `(?<!:)` keeps `https://` out of the line-comment
  // rule; this is a heuristic and does not need to be a parser.
  const code = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*$/gm, '');
  assert.ok(
    !/drawn as/.test(code),
    'the map screen must not assemble its own representation sentence',
  );
  assert.ok(
    !/have a confirmed location/.test(code),
    'coverage copy belongs to the river page listing, not to a map control',
  );
  // And the guard has to be able to fail, or it is decoration: the stripper
  // must leave real code behind.
  assert.ok(code.includes('renderLayerDetail'), 'the stripper kept the screen’s code');
});

// ── Sections: a heading groups rows and does nothing else ──────────────────

const SHEET = [
  { key: 'access' },
  { key: 'gauges' },
  { key: 'publicLand' },
  { key: 'campgrounds', section: 'stay' },
  { key: 'outfitters', section: 'services' },
  { key: 'lodging', section: 'stay' },
] as const;

const SECTIONS = [
  { key: 'stay', label: 'Places to stay' },
  { key: 'services', label: 'Services' },
] as const;

test('ungrouped rows come first, then sections in declared order', () => {
  const groups = groupLayerRows(SHEET, SECTIONS);
  assert.deepEqual(
    groups.map((g) => g.label),
    [null, 'Places to stay', 'Services'],
  );
  assert.deepEqual(groups[1].rows.map((r) => r.key), ['campgrounds', 'lodging']);
  assert.deepEqual(groups[2].rows.map((r) => r.key), ['outfitters']);
});

test('grouping drops nothing and duplicates nothing', () => {
  // The property that makes this a heading rather than a filter. A grouping
  // that silently lost a row would take a layer off the sheet while leaving it
  // on the map — a switch the reader cannot find for pins they can see, which is
  // the failure this sheet exists to prevent.
  const groups = groupLayerRows(SHEET, SECTIONS);
  const placed = groups.flatMap((g) => g.rows.map((r) => r.key));
  assert.equal(placed.length, SHEET.length);
  assert.deepEqual([...placed].sort(), SHEET.map((r) => r.key).sort());
});

test('catalog order is preserved inside every group', () => {
  // Reordering is not a heading's job either. `lodging` follows `campgrounds`
  // here because the catalog says so, not because the section rearranged them.
  const reordered = [
    { key: 'lodging', section: 'stay' },
    { key: 'campgrounds', section: 'stay' },
  ] as const;
  assert.deepEqual(
    groupLayerRows(reordered, SECTIONS)[0].rows.map((r) => r.key),
    ['lodging', 'campgrounds'],
  );
});

test('an empty section is omitted, never drawn as a bare heading', () => {
  const groups = groupLayerRows([{ key: 'access' }, { key: 'campgrounds', section: 'stay' }] as const, SECTIONS);
  assert.deepEqual(groups.map((g) => g.label), [null, 'Places to stay']);
});

test('a sheet with no ungrouped rows draws no empty leading block', () => {
  const groups = groupLayerRows([{ key: 'campgrounds', section: 'stay' }] as const, SECTIONS);
  assert.deepEqual(groups.map((g) => g.label), ['Places to stay']);
});

test('a section has no count of its own — the rows keep theirs', () => {
  // Camping and Cabins overlap: 35 of the directory's mapped rows are both. A
  // section total would either double-count them or force a place to pick a
  // side, which is exactly what serviceTiers returning a SET exists to avoid.
  // So `groupLayerRows` returns rows and a label, and nothing else — there is
  // no field here for a total to live in.
  const group = groupLayerRows(SHEET, SECTIONS)[1];
  assert.deepEqual(Object.keys(group).sort(), ['label', 'rows']);
});

test('each grouped row still counts on its own key, unsummed', () => {
  // The row-level half of the same rule, through the real count function: with
  // lodging promoted out of the River services row, neither row has tiers, so
  // each reports its own membership and nothing adds them.
  const counts = { campgrounds: 77, lodging: 81, outfitters: 84 };
  const active = ['campgrounds', 'lodging', 'outfitters'] as const;
  assert.equal(layerRowCount({ key: 'campgrounds' }, active, counts), 77);
  assert.equal(layerRowCount({ key: 'lodging' }, active, counts), 81);
  assert.equal(layerRowCount({ key: 'outfitters' }, active, counts), 84);
});

// ── Every layer caveat has to be reachable without sight ───────────────────
//
// The ⓘ button in MapLayersSheet is nested inside the row Pressable, which
// declares accessibilityRole="switch" and therefore subsumes its whole subtree
// into one VoiceOver stop. The button had a role and a label and no focus, so
// `info` — the public-land ownership caveat and the IEM radar attribution —
// could not be reached at all. The radar attribution had previously been an
// always-visible note, so the declutter removed the only way to read it.
//
// The row now exposes an `info` custom action instead. This asserts the source
// still wires it, because the failure mode is silent: the visible ⓘ keeps
// working and nothing about the screen looks wrong.

test('a layer that carries info exposes it as an accessibility action', () => {
  const sheet = readFileSync(
    join(process.cwd(), '..', 'eddy-ios', 'src', 'components', 'MapLayersSheet.tsx'),
    'utf8'
  );

  assert.match(
    sheet,
    /accessibilityActions=\{\s*layer\.info \? \[\{ name: 'info', label: `About \$\{layer\.label\}` \}\] : undefined\s*\}/,
    'the row must offer an info action whenever the layer has info to give'
  );
  assert.match(
    sheet,
    /onAccessibilityAction=/,
    'and must handle it — an advertised action that does nothing is worse than none'
  );
  assert.match(
    sheet,
    /actionName === 'info'/,
    'the handler must dispatch on the action it advertises'
  );
});

test('the visible info button does not claim a VoiceOver stop it cannot hold', () => {
  const sheet = readFileSync(
    join(process.cwd(), '..', 'eddy-ios', 'src', 'components', 'MapLayersSheet.tsx'),
    'utf8'
  );
  // A role and label on a subsumed element describe a stop that does not
  // exist, which is what made this look handled for as long as it did.
  assert.doesNotMatch(
    sheet,
    /accessibilityLabel=\{`About \$\{layer\.label\}`\}/,
    'the nested pressable must not re-declare itself as a focusable button'
  );
});
