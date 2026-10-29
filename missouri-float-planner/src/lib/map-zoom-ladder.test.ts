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
//   • the statewide index source draws the counts below ZOOM.cluster, and
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

test('every place layer starts where the statewide index stops', () => {
  const calls = pinLayerArgs();
  for (const key of PLACE_LAYERS) {
    const args = calls.get(key);
    assert.ok(args, `${key} must be drawn through pinLayer`);
    // (key, shape, labelMinZoom, minZoom, compactUntilZoom)
    assert.equal(args[2], 'ZOOM.names', `${key} labels belong on the NAMES rung`);
    assert.equal(
      args[3],
      'ZOOM.cluster',
      `${key} must draw nothing below ZOOM.cluster — the statewide index has that band`,
    );
    assert.equal(
      args[4],
      'ZOOM.places',
      `${key} must be a compact dot until ZOOM.places, not a full mark`,
    );
  }
});

test('the statewide index covers exactly the band the layers leave', () => {
  // The other half of the same rule. A ceiling that does not match the floor
  // above is either a double-drawn statewide view or a hole in the ladder.
  const block = sourceBlock('const statewideIndexLayer');
  const caps = [...block.matchAll(/maxZoomLevel=\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(caps.length >= 2, 'the index draws count badges and dots');
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

test('one statewide index counts every Eddy layer, gauges and dams included', () => {
  // There were four counts — places, services, rated gauges, dams — each
  // clustering only its own points, so on a device a lone dam or gauge sat as
  // a dot beside a places count that should have held it. One index now.
  assert.match(CODE, /\{statewideIndexLayer\(statewideIndexShape\)\}/, 'the index must be mounted');
  const shape = CODE.slice(CODE.indexOf('const statewideIndexShape'), CODE.indexOf('const pinShapes'));
  for (const list of ['accessPins', 'campgroundPins', 'boatRampPins', 'springPins',
    'outfitterPins', 'lodgingPins', 'gaugePins', 'dams']) {
    assert.match(shape, new RegExp(`\\.\\.\\.(\\()?${list}`), `${list} must be counted in the index`);
  }
  assert.doesNotMatch(shape, /hazardPins|referenceGauges/, 'hazards never join a count; the reference tier keeps its own');
  assert.match(shape, /filter\(\(pin\) => layers\.includes\(pin\.layer\)\)/, 'a count holds only layers that are on');
  // And nothing else counts Eddy pins: the only other clustered source is the
  // USGS reference tier.
  const sources = [...CODE.matchAll(/<Mapbox\.ShapeSource[^>]*?\n?\s*cluster\n/g)];
  assert.equal(sources.length, 2, 'the statewide index and the reference tier are the only clustered sources');
});

test('rated gauges and dams hand over from the index at ZOOM.cluster', () => {
  const calls = pinLayerArgs();
  assert.equal(calls.get('gauges')?.[3], 'ZOOM.cluster');
  assert.equal(calls.get('dams')?.[3], 'ZOOM.cluster');
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
    'the statewide index owns clustering for every Eddy layer',
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
  // a count: a badge reading "3" where a low-water dam is cannot be acted on.
  // pinLayer cannot cluster at all, and hazards are not in the statewide index.
  assert.doesNotMatch(sourceBlock('const pinLayer'), /\n\s*cluster(=|\s*$)/m, 'pinLayer must not cluster');
  const index = CODE.slice(CODE.indexOf('const statewideIndexShape'), CODE.indexOf('const pinShapes'));
  assert.doesNotMatch(index, /hazardPins/, 'a hazard must never join a count');
});

test('lakes & dams climb the ladder with no exception', () => {
  // They once kept their names at every zoom and drew below the floor, as
  // "landmarks". On a device that made the dams the only named thing on a
  // statewide map. A dam is a place: its name waits for ZOOM.names, and below
  // ZOOM.cluster it is counted in the statewide index with everything else.
  const args = pinLayerArgs().get('dams');
  assert.ok(args, 'dams must be drawn through pinLayer');
  assert.equal(args[2], 'ZOOM.names', 'dam names arrive when every other name does');
  assert.equal(args[3], 'ZOOM.cluster', 'below ZOOM.cluster a dam is in the statewide index');
  assert.equal(args[4], 'ZOOM.places', 'the full dam mark arrives with the other place marks');
});

test('no layer is named before the names rung, and none sits below the floor', () => {
  // The general form of the dam rule, so the next "landmark" exception fails
  // here rather than on a device. Rated gauges were the last holdout: named a
  // rung early and drawn below ZOOM.min. Indexed layers floor at ZOOM.cluster,
  // where the statewide index hands over; hazards, never indexed, at ZOOM.min.
  const family = new Set(['outfitters', 'lodging', 'campgrounds', 'springs', 'boatRamps', 'gauges', 'dams']);
  for (const [key, args] of pinLayerArgs()) {
    assert.equal(args[2], 'ZOOM.names', `${key} must not be named before ZOOM.names`);
    assert.equal(args[3], family.has(key) ? 'ZOOM.cluster' : 'ZOOM.min', `${key} must observe the ladder floor`);
  }
  // The reference tier is not drawn through pinLayer, and takes the same floor.
  const reference = sourceBlock('id="pins-allGauges"');
  for (const layer of ['pins-allGauges-cluster', "pinHitLayerId('pins-allGauges-dot')"]) {
    const at = reference.indexOf(layer);
    assert.match(reference.slice(at, at + 400), /minZoomLevel=\{ZOOM\.min\}/, `${layer} must observe the floor`);
  }
});

test('every count on the map breaks at the same zoom', () => {
  // clusterMaxZoomLevel is the last TILE zoom that clusters, and a camera at
  // 8.6 draws z8 tiles: given ZOOM.cluster, native counts outlived the family
  // index by a whole level.
  assert.match(CODE, /const NATIVE_CLUSTER_MAX_ZOOM = ZOOM\.cluster - 1;/);
  const props = [...CODE.matchAll(/clusterMaxZoomLevel=\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(props.length, 2, 'the reference tier and the statewide index');
  for (const prop of props) assert.match(prop, /NATIVE_CLUSTER_MAX_ZOOM/);
});

test('map marks are painted from the light palette in both appearances', () => {
  // The basemap is light in both schemes; the dark-scheme layer tints are for
  // charcoal sheets and vanished on it.
  assert.match(CODE, /const MAP_PAINT: Palette = lightPalette;/);
  assert.match(CODE, /function layerColorFor\(key: LayerKey\): string \{\s*return MAP_LAYERS\.find\(\(l\) => l\.key === key\)!\.color\(MAP_PAINT\);/);
  assert.doesNotMatch(CODE, /layerColorFor\([^)]*, colors\)/);
});

test('the label floor is the pin floor, not the mark floor', () => {
  // The other half of the test above, and the half that was missing when it
  // went wrong: a layer's `labelMinZoom` is only a promise if the shared label
  // layer honours it. It once clamped to `compactUntilZoom`, which silently
  // re-floored labels to ZOOM.places — the argument said one rung, the
  // assertion on the argument passed, and the map drew another. So this pins
  // the EFFECTIVE floor: a label may wait
  // for its pin (`minZoom`) and for its own rung (`labelMinZoom`), and for
  // nothing else.
  const label = /id=\{pinHitLayerId\(`pins-\$\{id\}-label`\)\}[\s\S]*?minZoomLevel=\{([^}]*)\}/.exec(CODE);
  assert.ok(label, 'pinLayer must declare a floor on its label layer');
  assert.match(label[1], /labelMinZoom/, 'the label rung still applies');
  assert.match(label[1], /minZoom \?\? 0/, 'a label is allowed to wait for its pin');
  assert.doesNotMatch(
    label[1],
    /compactUntilZoom/,
    'clamping labels to compactUntilZoom silently re-floors every label to ZOOM.places',
  );
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
  // requestCovers (tested in geo-viewport.test.ts) is the rule: an uncapped
  // containing answer, or the same padded target and budget. Two paths can skip a
  // fetch — the memory-cache scan and the last-request shortcut — and the
  // regression this pins is the shortcut judging by bounds alone: a capped
  // detail answer kept standing in for the overview budget after the camera
  // eased back across GAUGE_FETCH_DETAIL_ZOOM, until the padding boundary
  // released hundreds of gauges at once.
  const hook = codeOf('src', 'hooks', 'useViewportGauges.ts');
  assert.match(
    hook,
    /requestCovers\(lastRequested\.current, viewport\.bounds, limit, target\)/,
    'the last-request shortcut must ask requestCovers, never bare containment',
  );
  assert.match(
    hook,
    /newestFirst\.find\(\(entry\) =>\s*requestCovers\(/,
    'the memory-cache scan judges entries with the same rule',
  );
  assert.match(hook, /const target = quantizeBbox\(padBbox\(viewport.bounds, 0.2\), viewport.zoom\);\s*const covering = containingEntry\(cache.current, viewport.bounds, limit, target\)/,
    'cache lookup must receive the same padded target as the network request');
  assert.doesNotMatch(
    hook,
    /bboxContains/,
    'no fetch-skipping path may fall back to bounds-only containment',
  );
});

// ── A COUNT IS A COUNT ────────────────────────────────────────────────────
//
// Every cluster on the map wears one of two count badges — the web planner's
// rounded square — and neither carries a condition colour: white for Eddy's
// own layers, parchment for the USGS reference tier. Rated clusters were once
// painted with the worst verdict inside them, which made a count's colour mean
// a verdict on one badge and a category on the next. The verdict lives on the
// river lines and the individual pins.

test('every cluster count wears a badge, never a coloured bubble', () => {
  const countLayers = [...CODE.matchAll(/<Mapbox\.(\w+)\s+id=\{?[`'"]([^`'"]+)[`'"]\}?\s+filter=\{\['has', 'point_count'\]\}/g)];
  assert.equal(countLayers.length, 2, 'two clustered sources, one count layer each');
  for (const [, kind, id] of countLayers) {
    assert.equal(kind, 'SymbolLayer', `${id}: a count is a badge image, not a circle`);
  }
  assert.doesNotMatch(CODE, /clusterProperties=/, 'a cluster reduces nothing: its count is the only summary it shows');
  assert.doesNotMatch(CODE, /conditionColor\([^)]*\)[^;]*point_count/, 'no count is painted with a condition colour');
});

test('a badge and its number are one symbol', () => {
  // They were two layers once, and on device every badge drew with no number:
  // the count layer landed beneath the opaque face. Mapbox draws a symbol's
  // text over its own icon only WITHIN one layer, so both belong to one style.
  const style = CODE.slice(CODE.indexOf('const countBadgeStyle'), CODE.indexOf('const PLACE_COUNT_BADGE'));
  assert.match(style, /iconImage:/);
  assert.match(style, /textField: \['get', 'point_count_abbreviated'\]/);
  const stacks = sourceBlock('<Mapbox.ShapeSource id="pins-stacks"');
  assert.equal(stacks.match(/<Mapbox\.\w+Layer/g)?.length, 1, 'the stack face carries its own number');
  assert.match(stacks, /iconImage: \['match', \['get', 'face'\], 'usgs', 'eddy-count-stack-usgs-map', 'eddy-count-stack-map'\],\s*textField:/);
  // It covers the places under it, so neighbouring labels give way to it
  // instead of printing across its face.
  assert.doesNotMatch(stacks, /IgnorePlacement/);
});

test('only the USGS reference tier wears the parchment badge', () => {
  const reference = sourceBlock('id="pins-allGauges"');
  assert.match(reference, /style=\{USGS_COUNT_BADGE\}/);
  assert.equal(CODE.match(/style=\{USGS_COUNT_BADGE\}/g)?.length, 1, 'no Eddy layer borrows the reference face');
  assert.equal(CODE.match(/style=\{PLACE_COUNT_BADGE\}/g)?.length, 1, 'the statewide index — every Eddy count — wears the place face');
});

test('every count badge image is registered and on disk', () => {
  const keys = [...new Set([...CODE.matchAll(/eddy-count-[a-z-]+-map/g)].map((m) => m[0]))];
  const expanded = keys.flatMap((key) => key.includes('${') ? [] : [key]);
  for (const face of ['place', 'usgs']) expanded.push(`eddy-count-${face}-map`, `eddy-count-${face}-wide-map`);
  for (const key of new Set(expanded)) {
    const registration = new RegExp(`'${key}': \\{ image: require\\('\\.\\./\\.\\./assets/map/([a-z-]+)\\.png'\\), sdf: false \\}`);
    const file = CODE.match(registration)?.[1];
    assert.ok(file, `${key} must be registered in PIN_IMAGES as full-colour art`);
    // React Native resolves the bare name to its @3x file; that file must exist.
    assert.doesNotThrow(
      () => readFileSync(join(process.cwd(), '..', 'eddy-ios', 'assets', 'map', `${file}@3x.png`)),
      `${file}@3x.png must exist — regenerate with eddy-ios/scripts/build-map-icons.py`,
    );
  }
});
