import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { gestureStarted, pointNeedsReveal } from '../../../eddy-ios/src/map/mapInteraction';
import {
  nearestHitId, pinStacks, stackExpansionZoom, stackTap, STACK_MAX_ZOOM, STACK_RADIUS,
} from '../../../eddy-ios/src/map/pinStacks';
// layers.ts imports through the app's alias, so the ladder rung is restated
// here; map-zoom-ladder.test.ts pins the real value.
const ZOOM = { cluster: 8 };
import { gaugeCoverage, gaugeRenderSubset } from '../../../eddy-ios/src/map/gaugeCoverage';
import { padBbox, quantizeBbox, requestCovers, type Bounds } from '../../../packages/eddy-geo';
import { decodeGaugePoints } from '../../../packages/eddy-types';
import { cameraCommandFor } from '../../../eddy-ios/src/map/cameraBehavior';

const mapText = readFileSync('../eddy-ios/src/map/RiverMap.tsx', 'utf8');
const SCREEN = readFileSync('../eddy-ios/app/(tabs)/(map)/index.tsx', 'utf8');
function handler(name: string, context: Record<string, unknown>, code = mapText) {
  const source = ts.createSourceFile('source.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let arrow: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) {
      arrow = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) arrow = node;
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(arrow, `Expected handler ${name}; update this harness if it moves or is renamed`);
  return runInNewContext(ts.transpile(`(${arrow.getText(source)})`, { target: ts.ScriptTarget.ES2022 }), context);
}

test('capped statewide results do not cover a valley under the same budget', () => {
  const broad = { bbox: [-96, 34, -88, 41] as [number, number, number, number], limit: 1000, capped: true };
  const bounds: Bounds = [-92.1, 37.1, -91.9, 37.3];
  const target = quantizeBbox(padBbox(bounds), 7);
  assert.equal(requestCovers(broad, bounds, 1000, target), false);
  assert.equal(requestCovers({ ...broad, capped: false }, bounds, 300, target), true);
});

test('the real cache scan reuses capped memory and disk payloads for their raw viewport', () => {
  const containingEntry = handler('containingEntry', { requestCovers },
    readFileSync('../eddy-ios/src/hooks/useViewportGauges.ts', 'utf8'));
  for (const [zoom, limit] of [[7, 1000], [11, 300]]) {
    const bounds: Bounds = [-92.21, 37.21, -91.21, 37.91];
    const target = quantizeBbox(padBbox(bounds), zoom);
    for (const source of ['network', 'disk']) {
      const entry = { key: `${limit}:${target.join(',')}`, bbox: target, limit, source, payload: { capped: true } };
      const cache = new Map([[entry.key, entry]]);
      for (let echo = 0; echo < 3; echo++) {
        assert.equal(containingEntry(cache, [...bounds], limit, target), entry);
      }
      const valley: Bounds = [-91.8, 37.5, -91.7, 37.6];
      assert.equal(containingEntry(cache, valley, limit, quantizeBbox(padBbox(valley), zoom)), null);
    }
  }
});

test('a partial viewport enriches the index without dropping a small creek or duplicating a station', () => {
  const index = decodeGaugePoints({ v: 1, rows: [
    ['001', -91, 37, 20, 2, 1793180000, 0, null],
    ['002', -92, 38, 5, 1, 1793180000, 0, null],
  ] });
  assert.equal(index.length, 2);
  const full = { ...index[0], id: 'station-uuid', name: 'Named river station' };
  const merged = gaugeCoverage(index, [full]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].name, full.name);
  assert.equal(merged[1].siteId, '002');
  assert.equal(gaugeCoverage(index, [{ ...full, curated: true }]).length, 1);
  assert.equal(gaugeCoverage(index, [{ ...full, readingTimestamp: null, dischargeCfs: null }])[0].dischargeCfs, 20);
});

test('regional gauge geometry keeps padded-edge stations and omits distant stations without capping', () => {
  const [gauge] = decodeGaugePoints({ v: 1, rows: [['001', -91.5, 37.5, 5, 1, 1793180000, 0, null]] });
  const regional = Array.from({ length: 1100 }, (_, i) => ({ ...gauge, siteId: String(i) }));
  const edge = { ...gauge, siteId: 'edge', coordinates: { lng: -92.1, lat: 37.5 } };
  const distant = Array.from({ length: 12900 }, (_, i) => ({ ...gauge, siteId: `far-${i}`, coordinates: { lng: -120, lat: 45 } }));
  const all = [...regional, edge, ...distant];
  const target = quantizeBbox(padBbox([-92, 37, -91, 38]), 11);
  const subset = gaugeRenderSubset(all, target);
  assert.equal(subset.length, 1101, 'all local stations survive even above a viewport response cap');
  assert.ok(subset.includes(edge), 'padding covers a station just beyond the visible edge');
  assert.ok(!subset.includes(distant[0]));
  assert.equal(gaugeRenderSubset(all, null), all, 'the continental source retains its stable national set');
});

test('each gesture reports once, including gestures after an app-driven camera move', () => {
  let calls = 0;
  const context = {
    gestureLatched: { current: false }, interactionEpoch: { current: 0 }, tapSequence: { current: 0 },
    gestureStarted,
    pendingCommand: { current: null }, appliedCommandId: { current: null }, liveCamera: { current: null },
    flightEndsAt: { current: 0 },
    onCameraCommandConsumed: () => {}, onUserGesture: () => { calls++; },
  };
  const run = handler('onCameraChanged', context);
  for (const active of [true, true, false, false, true, false, true, false]) {
    run({ properties: { center: [-91, 37], zoom: 9 }, gestures: { isGestureActive: active } });
  }
  assert.equal(calls, 3);
});

test('revealing a POI leaves a visible point alone and moves a point covered by the sheet', () => {
  const padding = { paddingTop: 80, paddingBottom: 200, paddingLeft: 16, paddingRight: 16 };
  const size = { width: 390, height: 800 };
  assert.equal(pointNeedsReveal([180, 300], size, padding), false);
  assert.equal(pointNeedsReveal([180, 640], size, padding), true);
  assert.equal(pointNeedsReveal([180, 90], size, padding), true);
});

function scene(options: { stacks?: Array<{ id: string; ids: string[]; lng: number; lat: number; expansionZoom: number }>; zoom?: number } = {}) {
  const selected: string[] = []; let dismissed = 0;
  const zooms: Array<{ lng: number; lat: number; zoom?: number }> = [];
  const choices: string[][] = [];
  const pinHitLayers: string[] = [];
  const pinHitLayerId = handler('pinHitLayerId', { pinHitLayers });
  for (const id of ['pins-allGauges-dot', 'pins-allGauges-label', 'pins-access-icon',
    'pins-hazards-badge', 'pins-places-index-dot', 'plan-endpoints-icon']) pinHitLayerId(id);
  const queryRenderedFeaturesInRect: (box?: number[], filter?: unknown[], layers?: string[]) => Promise<{ features: object[] }> =
    async () => ({ features: [] });
  // A gauge and a campground 30m apart, as at Alley Spring.
  const pins = new Map([
    ['gauge:1', { id: 'gauge:1', name: 'Jacks Fork at Alley', coordinates: { lng: -91.4430, lat: 37.1530 } }],
    ['access:2', { id: 'access:2', name: 'Alley Spring', coordinates: { lng: -91.4433, lat: 37.1530 } }],
  ]);
  const stacks = options.stacks ?? [];
  const context = {
    byId: pins,
    stacksById: new Map(stacks.map((stack) => [stack.id, stack])),
    nearestHitId, stackTap,
    liveCamera: { current: { zoom: options.zoom ?? 15 } }, visibleViewport: undefined,
    setStackChoice: (members: Array<{ id: string }>) => choices.push(members.map((pin) => pin.id)),
    onSelectPin: (pin: { id: string }) => selected.push(pin.id),
    interactionEpoch: { current: 0 }, tapSequence: { current: 0 },
    pinHitLayers,
    clusterSources: { current: new Map() },
    onZoomToCluster: (point: { lng: number; lat: number; zoom?: number }) => { zooms.push(point); }, onNetworkPress: () => {},
    warn: () => {}, onBackgroundPress: () => { dismissed++; },
    mapRef: { current: { queryRenderedFeaturesInRect } },
    // What selectPinHits reads to lift a bottom-anchored mark to its bulb, and
    // what onMapPress reads before trying public land.
    PIN_ICONS: { pin: { anchor: 'bottom' }, drop: { anchor: 'center' } },
    LAYER_SHAPE: { access: 'pin', gauges: 'drop' },
    ACCESS_BADGE_LIFT: 11, ZOOM: { places: 9.5 },
    layers: [] as string[], setPublicLand: () => {},
  };
  const selectPinHits = handler('selectPinHits', context);
  return { context, selected, zooms, choices, dismissed: () => dismissed,
    press: handler('onMapPress', { ...context, selectPinHits }) as (event: object) => Promise<void> };
}
const tap = { properties: { screenPointX: 100, screenPointY: 200 } };
test('POI hit testing queries only the IDs registered by rendered pins', async () => {
  const s = scene();
  const queries: string[][] = [];
  s.context.mapRef.current.queryRenderedFeaturesInRect = async (_box, _filter, layers) => {
    queries.push(layers ?? []);
    return { features: [{ properties: { id: 'access:2' } }] };
  };
  await s.press(tap);
  assert.equal(queries.length, 1);
  assert.equal(queries[0], s.context.pinHitLayers);
  for (const id of ['pins-dams-icon', 'pins-services-index-dot', 'road-label', 'network-fill']) assert.ok(!queries[0].includes(id));
  assert.deepEqual(s.selected, ['access:2']);
});

test('every rendered POI layer registers its hit-test ID, including the unused dot fallback', () => {
  const source = ts.createSourceFile('RiverMap.tsx', mapText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const pinHitLayers: string[] = [];
  const pinHitLayerId = handler('pinHitLayerId', { pinHitLayers });
  const evaluate = (node: ts.Node) => runInNewContext(
    ts.transpile(`(${node.getText(source)})`, { target: ts.ScriptTarget.ES2022 }),
    { pinHitLayerId, id: 'fixture', anchor: 'center' },
  );
  const attribute = (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) => {
    const attr = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === name);
    if (!attr || !ts.isJsxAttribute(attr)) return undefined;
    return attr.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : attr.initializer;
  };
  let checked = 0;
  function visit(node: ts.Node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && /^Mapbox\..*Layer$/.test(node.tagName.getText(source))) {
      let parent: ts.Node | undefined = node.parent;
      while (parent && !(ts.isJsxElement(parent) && parent.openingElement.tagName.getText(source) === 'Mapbox.ShapeSource')) parent = parent.parent;
      if (parent && ts.isJsxElement(parent)) {
        const sourceId = attribute(parent.openingElement, 'id');
        assert.ok(sourceId, 'ShapeSource needs an ID');
        const name = evaluate(sourceId) as string;
        if (name.startsWith('pins-') || name === 'plan-endpoints') {
          const filter = attribute(node, 'filter');
          // Cluster bubbles/counts are resolved separately through their source.
          const cluster = filter && ts.isArrayLiteralExpression(filter) &&
            filter.elements.length === 2 && filter.elements.every(ts.isStringLiteral) &&
            filter.elements[0].text === 'has' && filter.elements[1].text === 'point_count';
          if (!cluster) {
            const id = attribute(node, 'id');
            assert.ok(id && ts.isCallExpression(id) && id.expression.getText(source) === 'pinHitLayerId',
              `${name}: ${id?.getText(source)} must register its ID with pinHitLayerId`);
            const renderedId = evaluate(id);
            assert.equal(pinHitLayers.at(-1), renderedId, 'the rendered ID must enter the same list queried by onMapPress');
            checked++;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(checked > 0, 'the guard must inspect actual rendered POI layers');
  assert.ok(pinHitLayers.includes('pins-fixture-circle'), 'the dot fallback must be covered even without a current caller');
});
test('the mark nearest the finger wins, whatever order the native layers return', async () => {
  const s = scene();
  s.context.mapRef.current.queryRenderedFeaturesInRect = async () => ({
    features: ['gauge:1', 'access:2', 'gauge:1'].map((id) => ({ properties: { id } })),
  });
  // A finger on the gauge selects the gauge, even though "access" sorts first.
  await s.press({ ...tap, geometry: { coordinates: [-91.44302, 37.1530] } });
  await s.press({ ...tap, geometry: { coordinates: [-91.44328, 37.1530] } });
  assert.deepEqual(s.selected, ['gauge:1', 'access:2']);
  assert.equal(s.dismissed(), 0);
  // Source listeners would intercept the map-level handler on native iOS.
  for (const match of mapText.matchAll(/<Mapbox.ShapeSource\b[\s\S]*?>/g)) assert.doesNotMatch(match[0], /onPress=/);
  // The cycling hint and its alphabetical order are gone for good.
  assert.doesNotMatch(mapText, /Tap again to cycle|nextPinId/);
  assert.doesNotMatch(SCREEN, /Tap again to cycle|pinCycleText/);
});

test('a numbered stack eases in below zoom 13 and lists its places from 13', async () => {
  const stack = { id: 'stack:access:2|gauge:1', ids: ['access:2', 'gauge:1'], lng: -91.44315, lat: 37.153, expansionZoom: 14 };
  const hitStack = async (zoom: number) => {
    const s = scene({ stacks: [stack], zoom });
    s.context.mapRef.current.queryRenderedFeaturesInRect = async () => ({ features: [{ properties: { id: stack.id } }] });
    await s.press({ ...tap, geometry: { coordinates: [stack.lng, stack.lat] } });
    return s;
  };
  const zoomedOut = await hitStack(11);
  const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(zoomedOut.zooms), [{ lng: stack.lng, lat: stack.lat, zoom: 14 }]);
  assert.deepEqual(plain(zoomedOut.choices), []);
  const close = await hitStack(15);
  assert.deepEqual(plain(close.zooms), []);
  assert.deepEqual(plain(close.choices), [['access:2', 'gauge:1']]);
  assert.deepEqual(close.selected, [], 'choosing is the reader\'s, not the tap\'s');
  assert.equal(close.dismissed(), 0);
});

test('background taps dismiss, failed queries and stale replies do not', async () => {
  const s = scene(); await s.press(tap); assert.equal(s.dismissed(), 1);
  s.context.mapRef.current.queryRenderedFeaturesInRect = async () => { throw new Error('style not ready'); };
  await s.press(tap); assert.equal(s.dismissed(), 1);
  s.context.mapRef.current.queryRenderedFeaturesInRect = async () => {
    s.context.interactionEpoch.current++;
    return { features: [{ properties: { id: 'gauge:1' } }] };
  };
  await s.press(tap); assert.equal(s.selected.length, 0);
});

test('cluster navigation uses the source expansion zoom', () => {
  const command = cameraCommandFor({ type: 'clusterSelected', lng: -91, lat: 37, zoom: 9 }, 1);
  assert.equal(command?.type, 'showPoint');
  if (command?.type === 'showPoint') {
    assert.equal(command.zoom, 9); assert.equal(command.zoomDelta, undefined);
  }
});

test('real cluster handler passes the full native feature to the owning source', async () => {
  const s = scene();
  const feature = { type: 'Feature', properties: { cluster_id: 12, point_count: 8 },
    geometry: { type: 'Point', coordinates: [-91, 37] } };
  let queried = false;
  s.context.clusterSources.current.set('pins-allGauges', {
    getClusterExpansionZoom: async (received: unknown) => {
      assert.equal(received, feature); queried = true; return 9;
    },
  });
  s.context.mapRef.current.queryRenderedFeaturesInRect = async () => ({ features: [feature] });
  await s.press(tap);
  assert.equal(queried, true);
  assert.deepEqual(JSON.parse(JSON.stringify(s.zooms)), [{ lng: -91, lat: 37, zoom: 9 }]);
  assert.equal(s.dismissed(), 0);
});

test('failed and invalid cluster expansion queries fall back to the existing camera zoom step', async () => {
  for (const result of ['reject', NaN, Infinity] as const) {
    const s = scene();
    const feature = { properties: { cluster_id: 12 }, geometry: { coordinates: [-91, 37] } };
    s.context.clusterSources.current.set('pins-allGauges', {
      getClusterExpansionZoom: async () => { if (result === 'reject') throw new Error('source changed'); return result; },
    });
    s.context.mapRef.current.queryRenderedFeaturesInRect = async () => ({ features: [feature] });
    await s.press(tap);
    assert.deepEqual(JSON.parse(JSON.stringify(s.zooms)), [{ lng: -91, lat: 37 }]);
    const command = cameraCommandFor({ type: 'clusterSelected', ...s.zooms[0] }, 1);
    assert.equal(command?.type === 'showPoint' && command.zoomDelta, 2);
    assert.equal(s.dismissed(), 0);
  }
});

test('a stale cluster expansion does not move the camera', async () => {
  const s = scene();
  const feature = { properties: { cluster_id: 12 }, geometry: { coordinates: [-91, 37] } };
  s.context.clusterSources.current.set('pins-allGauges', {
    getClusterExpansionZoom: async () => {
      s.context.interactionEpoch.current++;
      return 9;
    },
  });
  s.context.mapRef.current.queryRenderedFeaturesInRect = async () => ({ features: [feature] });
  await s.press(tap);
  assert.equal(s.zooms.length, 0);
  assert.equal(s.dismissed(), 0);
});

// ── Numbered stacks: the web planner's grouping, across iOS's layer sources ──

/** Longitude offset that puts two points `points` apart at `zoom` (512pt tiles). */
const lngApart = (points: number, zoom: number) => (points * 360) / (512 * 2 ** zoom);

test('places within 56pt stack, and split at the first zoom where they clear it', () => {
  assert.equal(STACK_RADIUS, 56, 'the web planner clusterRadius');
  const gauge = { id: 'gauge:1', lng: -91.4430, lat: 37.153 };
  const camp = { id: 'access:2', lng: -91.4430 + lngApart(32, 15), lat: 37.153 };
  const [stack, ...rest] = pinStacks([gauge, camp], 15.4);
  assert.equal(rest.length, 0);
  assert.deepEqual(stack.ids, ['access:2', 'gauge:1']);
  assert.equal(stack.id, 'stack:access:2|gauge:1');
  assert.equal(stack.expansionZoom, 16, '32pt at 15 is 64pt at 16, clear of 56');
  assert.deepEqual(pinStacks([camp, gauge], 15.9), [stack], 'input order never changes the result');
  const apart = { ...camp, lng: -91.4430 + lngApart(60, 15) };
  assert.deepEqual(pinStacks([gauge, apart], 15), [], 'marks a thumb can tell apart stay marks');
  assert.equal(stackExpansionZoom([gauge, { ...gauge, id: 'access:3' }], 15), STACK_MAX_ZOOM + 1,
    'the same spot never splits');
});

test('a stack tap follows the web planner rule exactly', () => {
  assert.deepEqual(stackTap({ expansionZoom: 14 }, 11), { type: 'zoom', zoom: 14 });
  assert.deepEqual(stackTap({ expansionZoom: STACK_MAX_ZOOM + 1 }, 10), { type: 'zoom', zoom: 15 },
    'capped at 15, like the web easeTo');
  assert.deepEqual(stackTap({ expansionZoom: 12 }, 11.7), { type: 'choose' }, 'not worth half a level');
  assert.deepEqual(stackTap({ expansionZoom: 16 }, 13), { type: 'choose' }, 'from 13 the reader chooses');
  assert.equal(nearestHitId([{ id: 'a', lng: 0, lat: 0 }, { id: 'b', lng: 1, lat: 0 }], null), 'a');
  assert.equal(nearestHitId([], { lng: 0, lat: 0 }), null);
});

test('only individually drawn, enabled, non-hazard places stack; the selection and endpoints stay out', () => {
  const at = (id: string, layer: string, lng: number) => ({ id, layer, coordinates: { lng, lat: 37.153 } });
  const base = -91.4430;
  const near = lngApart(20, 15);
  const fixture = (overrides: Record<string, unknown> = {}) => ({
    ZOOM, pinStacks,
    visibleViewport: { bounds: [-91.46, 37.14, -91.43, 37.17], zoom: 15.2 },
    layers: ['access', 'gauges', 'campgrounds', 'hazards'],
    selectedPinId: null,
    endpointIds: new Set<string>(),
    accessPins: [at('access:1', 'access', base)],
    campgroundPins: [at('access:2', 'campgrounds', base + near)],
    boatRampPins: [], springPins: [], outfitterPins: [], lodgingPins: [],
    gaugePins: [at('gauge:3', 'gauges', base + 2 * near)],
    referenceGauges: [], dams: [],
    ...overrides,
  });
  const stacks = (overrides?: Record<string, unknown>) =>
    (JSON.parse(JSON.stringify(handler('stacks', fixture(overrides))())) as Array<{ ids: string[] }>).map((stack) => stack.ids);
  assert.deepEqual(stacks(), [['access:1', 'access:2', 'gauge:3']]);
  assert.deepEqual(stacks({ selectedPinId: 'access:2' }), [['access:1', 'gauge:3']]);
  assert.deepEqual(stacks({ endpointIds: new Set(['access:1']) }), [['access:2', 'gauge:3']]);
  assert.deepEqual(stacks({ layers: ['access', 'campgrounds'] }), [['access:1', 'access:2']], 'a layer that is off draws nothing to stack');
  assert.deepEqual(stacks({ visibleViewport: { bounds: [-91.46, 37.14, -91.43, 37.17], zoom: 8.6 } }), [['access:1', 'access:2', 'gauge:3']],
    'native clusters break at ZOOM.cluster like the family index, so at 8.x the gauge is a mark and stacks');
  assert.deepEqual(stacks({ visibleViewport: { bounds: [-91.46, 37.14, -91.43, 37.17], zoom: 7.9 } }), [],
    'below the cluster rung the family index already groups places');
  assert.deepEqual(stacks({ visibleViewport: { bounds: [-80, 30, -79, 31], zoom: 15.2 } }), [], 'off-screen places do not stack');
  assert.doesNotMatch(mapText.slice(mapText.indexOf('const stacks = useMemo'), mapText.indexOf('const stacksById')),
    /hazardPins/, 'a hazard must never disappear into a count');
});

test('stacked members leave their own layers, and the stack paints below hazards', () => {
  for (const shape of ['accessShape', 'outfitterShape', 'lodgingShape', 'boatRampShape', 'campgroundShape']) {
    assert.match(mapText, new RegExp(`const ${shape} = useMemo\\(\\s*\\(\\) => featureCollection\\([\\w ?[\\]]+, layerColorFor\\('\\w+'\\), layerHiddenIds\\)`), shape);
  }
  for (const shape of ['gaugeShape', 'springShape', 'damShape', 'referenceShape']) {
    assert.match(mapText, new RegExp(`const ${shape} = useMemo\\(\\s*\\(\\) => featureCollection\\([\\w ?[\\]]+, layerColorFor\\('\\w+'\\), stackedOnlyIds\\)`), shape);
  }
  assert.match(mapText, /const hazardShape = useMemo\(\s*\(\) => featureCollection\(hazardPins, layerColorFor\('hazards'\)\),/);
  const stacksAt = mapText.indexOf('<Mapbox.ShapeSource id="pins-stacks"');
  const hazardsAt = mapText.indexOf("pinLayer('hazards'", stacksAt);
  assert.ok(stacksAt > 0 && hazardsAt > stacksAt, 'hazards draw over stacks');
});

// ── Draw order and the selection, from the second device pass ───────────────

test('hazards are the last pin source: over the route endpoints and the selection', () => {
  const endpointsAt = mapText.indexOf('<Mapbox.ShapeSource id="plan-endpoints"');
  const selectedAt = mapText.indexOf('<Mapbox.ShapeSource id="pins-selected"');
  const hazardsAt = mapText.indexOf("{pinLayer('hazards'");
  assert.ok(endpointsAt > 0 && selectedAt > endpointsAt, 'the selection draws over the route endpoints');
  assert.ok(hazardsAt > selectedAt, 'a put-in badge or a selection must never cover a hazard triangle');
  assert.equal(mapText.indexOf('<Mapbox.ShapeSource', hazardsAt), -1, 'nothing pin-like draws after hazards');
});

test('pin sources are mounted for the life of the map, never behind layerOn', () => {
  // @rnmapbox puts a newly mounted layer at the TOP of the style, so a source
  // mounted on a toggle jumped over hazards. Off means an empty collection.
  assert.doesNotMatch(mapText, /\{layerOn\('\w+'\)[\s\S]{0,40}\? (pinLayer|contextGaugeLayer|familyIndexLayer|accessLayer)\(/);
  assert.match(mapText, /shape=\{layerOn\(id\) \? pinShapes\[id\] : EMPTY_COLLECTION\}/);
  assert.match(mapText, /shape=\{layerOn\('allGauges'\) \? referenceShape : EMPTY_COLLECTION\}/);
  assert.match(mapText, /shape=\{layerOn\('access'\) \? pinShapes\.access : EMPTY_COLLECTION\}/);
});

test('the selected place has its own source, and every layer leaves it out', () => {
  const selected = mapText.slice(mapText.indexOf('<Mapbox.ShapeSource id="pins-selected"'), mapText.indexOf("{pinLayer('hazards'"));
  assert.match(selected, /iconSize: SELECTED_SCALE/);
  assert.match(selected, /id=\{pinHitLayerId\('pins-selected-label'\)\}[\s\S]*?textAllowOverlap: true/, 'the selected name is always drawn');
  // No layer styles its own selection any more: it is filtered out instead.
  const before = mapText.slice(0, mapText.indexOf('<Mapbox.ShapeSource id="plan-endpoints"'));
  assert.doesNotMatch(before, /\['==', \['get', 'id'\], selectedPinId\]/);
  assert.match(mapText, /const solo = unselected\(/);
  for (const id of ['pins-access-overview', 'pins-access-badge', 'pins-access-icon', 'pins-access-label', 'pins-allGauges-dot']) {
    assert.match(mapText, new RegExp(`pinHitLayerId\\('${id}'\\)\\}\\s*filter=\\{unselected\\(`), `${id} leaves out the selection`);
  }
  const unselected = handler('unselected', { selectedPinId: 'gauge:1' });
  assert.deepEqual(JSON.parse(JSON.stringify(unselected(['!', ['has', 'point_count']]))),
    ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'id'], 'gauge:1']]);
  assert.equal(handler('unselected', { selectedPinId: null })(undefined), undefined);
});

test('a bottom-anchored mark is measured from its bulb, not its tip', () => {
  // Access pin tip at the origin; a gauge 14pt above it at z12. A finger on
  // the pin's bulb, 11pt above the tip, means the pin.
  const zoom = 12;
  // Mercator: a screen point spans cos(lat) as many degrees of latitude as of longitude.
  const ptLat = (points: number) => ((points * 360) / (512 * 2 ** zoom)) * Math.cos((37 * Math.PI) / 180);
  const tip = { lng: -91.4, lat: 37 };
  const hits: Array<{ id: string; lng: number; lat: number; lift?: number }> = [
    { id: 'access:1', ...tip, lift: 11 },
    { id: 'gauge:2', lng: tip.lng, lat: tip.lat + ptLat(14) },
  ];
  const bulb = { lng: tip.lng, lat: tip.lat + ptLat(11) };
  assert.equal(nearestHitId(hits, bulb, zoom), 'access:1');
  assert.equal(nearestHitId(hits.map(({ lift: _lift, ...hit }) => hit), bulb, zoom), 'gauge:2',
    'measured from the tip, as it was, the gauge stole the tap');
});

// ── Chrome regressions from the first device pass ─────────────────────────────

test('Plan a float spans a definite row, so its 55% cap is not circular', () => {
  assert.match(SCREEN, /planRow: \{ width: '100%'/);
  assert.match(SCREEN, /planButton: \{[\s\S]*?maxWidth: '55%'/);
});

test('a resting map sheet is clipped at the tab bar instead of painting through it', () => {
  const sheet = readFileSync('../eddy-ios/src/components/map-sheet/MapSheet.tsx', 'utf8');
  assert.match(sheet, /style=\{\[StyleSheet\.absoluteFill, styles\.clip\]\}/);
  assert.match(sheet, /clip: \{ overflow: 'hidden' \}/);
});

test('the search row keeps its width; the places list sits beside Locate in the same glass', () => {
  const header = SCREEN.slice(SCREEN.indexOf('<View style={styles.searchRow}'), SCREEN.indexOf("{layers.includes('allGauges') && (gaugeIndex.error"));
  assert.ok(header.length > 0);
  assert.doesNotMatch(header, /setPlacesListOpen|list-outline/);
  const controls = SCREEN.slice(SCREEN.indexOf('<View style={styles.controlGroup}'), SCREEN.indexOf('THERE IS NO CONDITION LEGEND'));
  assert.match(controls, /accessibilityLabel="Show my location"[\s\S]*setPlacesListOpen\(true\)/);
  assert.equal((controls.match(/<FloatingControlSurface style=\{styles\.locateButton\}/g) ?? []).length, 2);
  assert.match(readFileSync('../eddy-ios/src/components/ControlIcon.tsx', 'utf8'), /list: 'list\.bullet'/,
    'an SF Symbol, like Locate and Layers beside it');
});
