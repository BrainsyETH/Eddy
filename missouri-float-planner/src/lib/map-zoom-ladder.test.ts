import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── ONE LADDER, AND EVERY LAYER ON THE SAME RUNGS ─────────────────────────
//
// map/layers.ts documents the zoom ladder — OFF below 5.5, COUNTS to 8,
// PLACES to 9.5, MARKS above, NAMES at 10.5 — and says why it is one table:
// "every layer on
// this map is statewide now and the map is only legible if they all change
// character together."
//
// Only the gauge tiers actually honoured it. Camping, cabins, rentals, ramps
// and hazards drew a full 22pt Eddy mark at EVERY zoom, so the opening
// statewide view carried ~285 icons over the rivers they were meant to
// annotate — while the two layers holding 14,000 gauges collapsed into
// bubbles. Switching Camping on made it worse in a way nobody would predict:
// a put-in tagged `campground` leaves the access source to wear a tent, so the
// access cluster's count fell by 123 at the moment 123 unclustered tents
// appeared.
//
// The fix has two halves that MUST agree, and neither fails loudly on its own:
//
//   • a family index source draws the bubbles below ZOOM.cluster, and
//   • every layer in that family starts drawing AT ZOOM.cluster.
//
// Set the index's ceiling above the layers' floor and both paint at statewide
// zoom — bubbles with the full scatter of dots underneath, which is the
// crowding this replaced. Set it below and there is a band of zoom where a
// switched-on layer draws nothing at all, which is the failure the layers
// sheet exists to prevent: pins the reader asked for, a switch that says they
// are on, and an empty map.
//
// Neither is visible in a diff or a type. Both are visible here.
//
// The source is parsed rather than imported because RiverMap is a React Native
// component — it imports Mapbox, expo assets and the themed palette, none of
// which this suite can load. Same constraint, same technique, as the map-sheet
// guards next door.

const SOURCE = readFileSync(
  join(process.cwd(), '..', 'eddy-ios', 'src', 'map', 'RiverMap.tsx'),
  'utf8',
);

/**
 * The file with its comments removed.
 *
 * Load-bearing, not tidiness: the docblocks quote call shapes that no longer
 * exist (`pinLayer('weatherRadar')` appears in an argument about why it must
 * not compile) and explain at length what each rung replaced. A naive scan
 * reads those as code. Stripping them is what makes this a guard against what
 * SHIPS rather than against what is discussed.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*$/gm, '');

/** Every `pinLayer(...)` call, as its argument list. */
function pinLayerArgs(): Map<string, string[]> {
  const calls = new Map<string, string[]>();
  for (const match of CODE.matchAll(/pinLayer\(([^)]*)\)/g)) {
    const args = match[1].split(',').map((arg) => arg.trim());
    const key = args[0]?.replace(/'/g, '');
    if (key) calls.set(key, args);
  }
  return calls;
}

/** The JSX of one ShapeSource, from a string that identifies it to its closing tag. */
function sourceBlock(from: string): string {
  const at = CODE.indexOf(from);
  assert.notEqual(at, -1, `the source identified by ${from} must exist`);
  const end = CODE.indexOf('</Mapbox.ShapeSource>', at);
  assert.notEqual(end, -1, `the source identified by ${from} must be closed`);
  return CODE.slice(at, end);
}

// The four layers that draw PLACES and used to draw them at every zoom. Access
// is not here: it has its own source (a bottom-anchored marker and the
// private-access dimming), checked separately below.
const PLACE_LAYERS = ['campgrounds', 'boatRamps', 'outfitters', 'lodging'];

test('every place layer starts where the family index stops', () => {
  const calls = pinLayerArgs();
  for (const key of PLACE_LAYERS) {
    const args = calls.get(key);
    assert.ok(args, `${key} must be drawn through pinLayer`);
    // (key, shape, labelMinZoom, minZoom, compactUntilZoom)
    assert.equal(args[2], 'ZOOM.names', `${key} labels belong on the NAMES rung`);
    assert.equal(
      args[3],
      'ZOOM.cluster',
      `${key} must draw nothing below ZOOM.cluster — the family index has that band`,
    );
    assert.equal(
      args[4],
      'ZOOM.places',
      `${key} must be a compact dot until ZOOM.places, not a full mark`,
    );
  }
});

test('the family index covers exactly the band the layers leave', () => {
  // The other half of the same rule. A ceiling that does not match the floor
  // above is either a double-drawn statewide view or a hole in the ladder.
  // Both families share one builder, so this is one check for both of them.
  const block = sourceBlock('const familyIndexLayer');
  const caps = [...block.matchAll(/maxZoomLevel=\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(caps.length >= 3, 'the index draws bubbles, counts and dots');
  for (const cap of caps) {
    assert.equal(cap, 'ZOOM.cluster', 'the index must stop where its layers start');
  }
  // And it must not draw at continental zoom, where a bubble is a count of
  // things in four states.
  const floors = [...block.matchAll(/minZoomLevel=\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(floors.length, caps.length, 'every index layer states a floor as well as a ceiling');
  for (const floor of floors) {
    assert.equal(floor, 'ZOOM.min', 'the index must honour the ladder floor');
  }
});

test('both families are actually mounted', () => {
  // A guard on the rungs is worth nothing if the index is never rendered: the
  // layers would simply be silent below ZOOM.cluster.
  assert.match(CODE, /familyIndexLayer\(\s*'places'/, 'the access family needs its index');
  assert.match(CODE, /familyIndexLayer\(\s*'services'/, 'the service family needs its index');
});

test('the access source no longer clusters on its own', () => {
  // Two clustered sources over one family is the state this replaced: access
  // bubbles beside the family bubbles, counting overlapping halves of the same
  // population.
  const block = sourceBlock('id="pins-access"');
  // The PROPS, not the word — `minZoomLevel={ZOOM.cluster}` is the handover
  // this same block is required to declare, and it contains "cluster" too.
  assert.doesNotMatch(
    block,
    /\n\s*cluster(\s*$|=|Radius|MaxZoomLevel|Properties)/m,
    'the family index owns clustering for this family',
  );
  assert.match(
    block,
    /minZoomLevel=\{ZOOM\.cluster\}/,
    'the access overview dot must start where the index stops',
  );
});

test('hazards resolve a rung early and never cluster', () => {
  const args = pinLayerArgs().get('hazards');
  assert.ok(args, 'hazards must be drawn through pinLayer');
  assert.equal(args[3], 'ZOOM.min', 'hazards observe the ladder floor like everything else');
  assert.equal(
    args[4],
    'ZOOM.cluster',
    'a hazard becomes a triangle as soon as the bubbles break, not at ZOOM.places',
  );
  // THE ONE RULE HERE THAT IS NOT A TUNING. A hazard must never disappear into
  // a count: a bubble reading "3" where a low-water dam is cannot be acted on,
  // and unlike a gauge cluster there is no worst-verdict fill that would make
  // it honest. pinLayer clusters only when handed a clustering object.
  assert.equal(args.length, 5, 'hazards must not be handed a clustering config');
});

test('lakes & dams keep their names at every zoom', () => {
  // ~24 of them, and they are landmarks: an unnamed dot cannot be told from the
  // lake it sits on. Deliberately the one layer off the label rung.
  const args = pinLayerArgs().get('dams');
  assert.ok(args, 'dams must be drawn through pinLayer');
  assert.equal(args[2], '0', 'dam labels are on at every zoom, on purpose');
});

// ── The rung VALUES, not only the relationships ─────────────────────────────
//
// Everything above asserts that the layers sit on the same rungs; nothing said
// where the rungs are. These numbers are product decisions — 9.5 for the marks
// was tuned because at z10 the camera already frames a single river valley and
// the reader choosing a bank was still looking at anonymous dots — and a test
// is where a tuned number stops being drift waiting to happen.

/** A second file's code, comments stripped the same way as CODE above. */
function codeOf(...path: string[]): string {
  return readFileSync(join(process.cwd(), '..', 'eddy-ios', ...path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<!:)\/\/.*$/gm, '');
}

test('the ladder rungs hold their agreed values', () => {
  const layers = codeOf('src', 'map', 'layers.ts');
  const block = layers.match(/export const ZOOM = \{([\s\S]*?)\} as const/);
  assert.ok(block, 'layers.ts must declare the ZOOM table');
  const rung = (name: string): number => {
    const m = block![1].match(new RegExp(`${name}:\\s*([\\d.]+)`));
    assert.ok(m, `the ${name} rung must be a numeric literal in the ZOOM table`);
    return Number(m![1]);
  };
  assert.equal(rung('min'), 5.5, 'the statewide floor');
  assert.equal(rung('cluster'), 8, 'where bubbles break into pins');
  assert.equal(rung('places'), 9.5, 'where full marks arrive — a product decision');
  assert.equal(rung('names'), 10.5, 'labels wait one rung past the marks');
});

test('the national fetch flip is decoupled from the marks rung', () => {
  // GAUGE_FETCH_DETAIL_ZOOM was an alias for ZOOM.places, which meant retuning
  // the marks rung — a visual decision — silently changed how many gauges a
  // mid-zoom viewport requests. The flip is a fetch parameter with its own
  // value, and the hook must read IT, not the visual threshold.
  const layers = codeOf('src', 'map', 'layers.ts');
  assert.match(
    layers,
    /export const GAUGE_FETCH_DETAIL_ZOOM = 10\.5/,
    'the fetch flip is its own numeric constant, not an alias for a rung',
  );
  const hook = codeOf('src', 'hooks', 'useViewportGauges.ts');
  assert.match(
    hook,
    /viewport\.zoom < GAUGE_FETCH_DETAIL_ZOOM \? OVERVIEW_LIMIT : DETAIL_LIMIT/,
    'the limit choice reads the fetch constant',
  );
  assert.doesNotMatch(
    hook,
    /\bGAUGE_DETAIL_ZOOM\b/,
    'the hook must not couple its fetch budget to the visual detail threshold',
  );
});

test('every fetch-skipping path applies the one eligibility rule', () => {
  // requestCovers (tested in geo-viewport.test.ts) is the rule: containment
  // AND (same limit, or an uncapped answer). Two paths in the hook can skip a
  // fetch — the memory-cache scan and the last-request shortcut — and the
  // regression this pins is the shortcut judging by bounds alone: a capped
  // detail answer kept standing in for the overview budget after the camera
  // eased back across GAUGE_FETCH_DETAIL_ZOOM, until the padding boundary
  // released hundreds of gauges at once.
  const hook = codeOf('src', 'hooks', 'useViewportGauges.ts');
  assert.match(
    hook,
    /requestCovers\(lastRequested\.current, viewport\.bounds, limit\)/,
    'the last-request shortcut must ask requestCovers, never bare containment',
  );
  assert.match(
    hook,
    /newestFirst\.find\(\(entry\) =>\s*requestCovers\(/,
    'the memory-cache scan judges entries with the same rule',
  );
  assert.doesNotMatch(
    hook,
    /bboxContains/,
    'no fetch-skipping path may fall back to bounds-only containment',
  );
});
