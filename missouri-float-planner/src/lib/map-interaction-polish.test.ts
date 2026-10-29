import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  absorbingAccessEntry,
  accessPinLayer,
  gestureStarted,
  layersBelowFloor,
  locationNearNetwork,
  pointNeedsReveal,
} from '../../../eddy-ios/src/map/mapInteraction';
import { fallbackMatches } from '../../../eddy-ios/src/hooks/searchFallback';
import type { MapAccessPoint, RiverService } from '../../../packages/eddy-types';
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
    'pins-hazards-badge', 'pins-statewide-index-dot', 'plan-endpoints-icon']) pinHitLayerId(id);
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
    selectedPinId: null as string | null, selectedPin: null as { id: string; coordinates: { lng: number; lat: number } } | null,
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
  for (const id of ['pins-dams-icon', 'pins-allGauges-cluster', 'road-label', 'network-fill']) assert.ok(!queries[0].includes(id));
  assert.deepEqual(s.selected, ['access:2']);
});

test('a tap on the selected marker its layer no longer holds stays on that place', async () => {
  // Outfitters switched off with an outfitter's sheet open: the selection layer
  // still draws it, but byId has dropped it. The tap used to fall through to
  // the river or the background and close the sheet.
  const s = scene();
  s.context.selectedPinId = 'outfitter:7';
  s.context.selectedPin = { id: 'outfitter:7', coordinates: { lng: -91.5, lat: 37.2 } };
  s.context.mapRef.current.queryRenderedFeaturesInRect = async () => ({ features: [{ properties: { id: 'outfitter:7' } }] });
  await s.press(tap);
  assert.deepEqual(s.selected, ['outfitter:7']);
  assert.equal(s.dismissed(), 0);
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

test('stacked members are hidden by a layer filter, so a camera stop re-uploads no pin source', () => {
  // Stack membership changes on camera stops; the places do not. Every pin
  // shape is keyed on its own data (and the plan's endpoints, which move only
  // with the plan), never on the stacks, so a pinch that merges one pair no
  // longer re-serialises every source across the bridge.
  for (const shape of ['accessShape', 'outfitterShape', 'lodgingShape', 'boatRampShape', 'campgroundShape']) {
    assert.match(mapText, new RegExp(`const ${shape} = useMemo\\(\\s*\\(\\) => featureCollection\\([\\w ?[\\]]+, layerColorFor\\('\\w+'\\), endpointIds\\),\\s*\\[\\w+, endpointIds\\]`), shape);
  }
  for (const shape of ['gaugeShape', 'springShape', 'damShape', 'referenceShape']) {
    assert.match(mapText, new RegExp(`const ${shape} = useMemo\\(\\s*\\(\\) => featureCollection\\([\\w ?[\\]]+, layerColorFor\\('\\w+'\\)\\),\\s*\\[[\\w]+\\]`), shape);
  }
  assert.match(mapText, /const hazardShape = useMemo\(\s*\(\) => featureCollection\(hazardPins, layerColorFor\('hazards'\)\),/);
  const shapes = mapText.slice(mapText.indexOf('const accessShape = useMemo'), mapText.indexOf('const pinShapes = useMemo'));
  assert.doesNotMatch(shapes, /stackedKey|notStacked|stacks\b/, 'no pin shape may depend on the stacks');

  // The filter clause: keyed on the primitive stacked-id string, and it
  // really excludes exactly the stacked members.
  assert.match(mapText, /const notStacked = useMemo\([\s\S]*?\[stackedKey\],\s*\)/);
  const clause = (stackedKey: string) => JSON.parse(JSON.stringify(handler('notStacked', { stackedKey })()));
  assert.deepEqual(clause('access:1|gauge:3'), ['!', ['in', ['get', 'id'], ['literal', ['access:1', 'gauge:3']]]]);
  assert.deepEqual(clause(''), ['!', ['in', ['get', 'id'], ['literal', []]]], 'no stacks hides nothing');

  // Applied to every layer a stacked member could draw on, and not to hazards.
  const pinLayerBody = mapText.slice(mapText.indexOf('const pinLayer = ('), mapText.indexOf('const contextGaugeLayer = () =>'));
  assert.match(pinLayerBody, /const solo = id === 'hazards' \? unselected\(\) : unselected\(notStacked\);/);
  const access = mapText.slice(mapText.indexOf('const accessLayer = () =>'), mapText.indexOf('</Mapbox.ShapeSource>', mapText.indexOf('const accessLayer = () =>')));
  assert.equal((access.match(/filter=\{unselected\(notStacked\)\}/g) ?? []).length, 4, 'every access layer hides stacked members');
  assert.doesNotMatch(access, /filter=\{unselected\(\)\}/);
  const reference = mapText.slice(mapText.indexOf('const contextGaugeLayer = () =>'), mapText.indexOf('const statewideIndexLayer'));
  assert.equal((reference.match(/notStacked\]\)\}/g) ?? []).length, 2, 'the reference dot and label hide stacked members');

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
  assert.doesNotMatch(mapText, /\{layerOn\('\w+'\)[\s\S]{0,40}\? (pinLayer|contextGaugeLayer|statewideIndexLayer|accessLayer)\(/);
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
  assert.match(mapText, /const solo = [^;]*unselected\(/);
  for (const id of ['pins-access-overview', 'pins-access-badge', 'pins-access-icon', 'pins-access-label', 'pins-allGauges-dot']) {
    assert.match(mapText, new RegExp(`pinHitLayerId\\('${id}'\\)\\}\\s*filter=\\{unselected\\(`), `${id} leaves out the selection`);
  }
  const unselected = handler('unselected', { selectedPinId: 'gauge:1' });
  assert.deepEqual(JSON.parse(JSON.stringify(unselected(['!', ['has', 'point_count']]))),
    ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'id'], 'gauge:1']]);
  // @rnmapbox's iOS layer ignores an undefined or empty filter, so returning
  // undefined after a close left `!= selected` on the layer and the place
  // vanished. With no selection the filter must still be a real expression.
  const cleared = handler('unselected', { selectedPinId: null });
  assert.deepEqual(JSON.parse(JSON.stringify(cleared(undefined))), ['!=', ['get', 'id'], '']);
  assert.deepEqual(JSON.parse(JSON.stringify(cleared(['!', ['has', 'point_count']]))),
    ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'id'], '']]);
});

test('no map layer filter can fall back to undefined, which iOS never clears', () => {
  // Every filter prop is either a literal array or unselected(); a ternary or
  // optional filter would reintroduce the stuck-filter bug on close.
  for (const match of mapText.matchAll(/filter=\{([^}]*)\}/g)) {
    assert.match(match[1], /^(\[|unselected\(|solo$)/, `filter={${match[1]}} must always be an expression`);
  }
});

test('the selection still draws when the layer that drew it is switched off', () => {
  // byId holds only what the switched-on layers draw. Turning off the last of
  // them dropped the selection source from one feature to zero while its sheet
  // stayed open — so the caller's own pin is the fallback.
  const pin = { id: 'access:9', name: 'Cedargrove', layer: 'access', coordinates: { lng: -91.6, lat: 37.4 } };
  const context = (byId: Map<string, unknown>, selectedPin: unknown = pin, selectedPinId = 'access:9') => ({
    selectedPinId, selectedPin, byId, endpointIds: new Set<string>(),
    PIN_ICONS: { pin: { image: 'eddy-access-map', anchor: 'bottom', labelOffset: 1.05 } },
    LAYER_SHAPE: { access: 'pin' }, SELECTED_SCALE: 1.18,
    EMPTY_COLLECTION: { type: 'FeatureCollection', features: [] },
    layerColorFor: () => '#256574',
  });
  const shape = (ctx: ReturnType<typeof context>) =>
    JSON.parse(JSON.stringify(handler('selectedShape', ctx)())) as { features: Array<{ properties: Record<string, unknown> }> };
  assert.equal(shape(context(new Map())).features.length, 1, 'drawn from the caller\'s pin when the map no longer holds it');
  const fresher = { ...pin, name: 'Cedargrove (renamed)' };
  assert.equal(shape(context(new Map([[pin.id, fresher]]))).features[0].properties.label, 'Cedargrove (renamed)',
    'a pin the map still holds is the fresher copy');
  assert.equal(shape(context(new Map(), { ...pin, id: 'access:1' })).features.length, 0, 'a stale caller pin is never drawn');
  assert.match(SCREEN, /selectedPin=\{selectedPin\}/, 'the screen hands its pin to the map');
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

// ── Planning, search and tap flows on the map screen ──────────────────────────
//
// The screen has no runner of its own, so its flow rules are asserted two ways:
// the pure helpers they lean on are called directly, and the handler wiring is
// read out of the source, as the camera tests above do.

function accessPoint(over: Partial<MapAccessPoint> = {}): MapAccessPoint {
  return {
    id: 'ap-1',
    name: 'Akers Ferry',
    riverMile: 22.4,
    type: 'access',
    isPublic: true,
    coordinates: { lng: -91.2301, lat: 37.2789 },
    ...over,
  } as MapAccessPoint;
}

function directoryRow(over: Partial<RiverService> = {}): RiverService {
  return {
    id: 'svc-1',
    name: 'Akers Ferry Campground',
    type: 'campground',
    phone: null,
    website: null,
    city: 'Salem',
    state: 'MO',
    latitude: 37.2789,
    longitude: -91.2301,
    description: null,
    servicesOffered: [],
    ...over,
  } as RiverService;
}

test('a named access point opens on the layer its types give it, as route endpoints do', () => {
  assert.equal(accessPinLayer(accessPoint({ types: ['access', 'campground'] })), 'campgrounds');
  assert.equal(accessPinLayer(accessPoint({ types: ['access', 'boat_ramp'] })), 'boatRamps');
  assert.equal(accessPinLayer(accessPoint({ types: ['access'] })), 'access');
  // Older rows carry only `type`, which accessPointTypes reads as the set.
  assert.equal(accessPinLayer(accessPoint({ type: 'campground', types: undefined })), 'campgrounds');
  // The fallback is RiverMap's; if that rule changes, this one has to follow.
  assert.match(
    mapText,
    /types\.includes\('campground'\) \? 'campgrounds'\s*: types\.includes\('boat_ramp'\) \? 'boatRamps' : 'access'/,
  );
});

test('a searched service the map draws as an access point opens as that access point', () => {
  const host = { point: accessPoint(), riverSlug: 'current' };
  const far = { point: accessPoint({ id: 'far', coordinates: { lng: -91.9, lat: 37.9 } }), riverSlug: 'current' };
  // Camping rows fold into a put-in on the same spot.
  assert.equal(absorbingAccessEntry(directoryRow(), [far, host]), host);
  // A rental on the same spot is not absorbed by proximity — only camping is.
  assert.equal(absorbingAccessEntry(directoryRow({ type: 'outfitter' }), [host]), null);
  // An explicit link is the last word, however far apart the two rows are...
  assert.equal(absorbingAccessEntry(directoryRow({ type: 'outfitter', accessPointId: 'far' }), [host, far]), far);
  // ...including when the linked put-in is not on the map: the row draws alone.
  assert.equal(absorbingAccessEntry(directoryRow({ accessPointId: 'missing' }), [host]), null);
});

test('the map opens on the user only when the user is near the network', () => {
  const bounds: [number, number, number, number] = [-94, 36, -90, 39];
  assert.equal(locationNearNetwork({ lng: -91.5, lat: 37.5 }, bounds), true);
  // Just over the state line still counts — padded by a fifth of the span.
  assert.equal(locationNearNetwork({ lng: -94.6, lat: 37 }, bounds), true);
  // Denver does not.
  assert.equal(locationNearNetwork({ lng: -104.99, lat: 39.74 }, bounds), false);
  assert.equal(locationNearNetwork({ lng: -91.5, lat: 37.5 }, null), false);
  assert.match(SCREEN, /const nearbyCoords =\s*location\.coords && locationNearNetwork\(location\.coords, network\.bounds\)/);
  assert.match(SCREEN, /: nearbyCoords\s*\? \{\s*type: 'center'/, 'initialCamera opens on the position only when near');
  assert.match(
    SCREEN,
    /if \(!nearbyCoords\) return;[\s\S]{0,400}type: 'locationRequested',\s*lng: nearbyCoords\.lng/,
    'the late-location fly-to must apply the same test',
  );
});

test('the on-map floor hint shows only when every switched-on layer draws nothing', () => {
  const gated = new Set(['access', 'gauges', 'springs', 'dams', 'allGauges']);
  const rungs = { floor: 5.5, publicLand: 7, radar: 4 };
  assert.equal(layersBelowFloor(['access', 'gauges'], 5, gated, rungs), true);
  assert.equal(layersBelowFloor(['access', 'gauges'], 5.5, gated, rungs), false);
  // Radar still draws down to 4, so the map is not empty.
  assert.equal(layersBelowFloor(['access', 'weatherRadar'], 5, gated, rungs), false);
  assert.equal(layersBelowFloor(['access', 'weatherRadar'], 3.5, gated, rungs), true);
  assert.equal(layersBelowFloor(['access', 'publicLand'], 5, gated, rungs), true);
  // Nothing on, or a camera that has not reported, is no reason to speak.
  assert.equal(layersBelowFloor([], 3, gated, rungs), false);
  assert.equal(layersBelowFloor(['access'], null, gated, rungs), false);

  const floorRows = /const FLOOR_GATED_PIN_ROWS = new Set<LayerKey>\(\[([\s\S]*?)\]\);/.exec(SCREEN);
  assert.ok(floorRows, 'FLOOR_GATED_PIN_ROWS moved');
  for (const key of ['springs', 'dams', 'gauges', 'allGauges']) {
    assert.match(floorRows[1], new RegExp(`'${key}'`), `${key} rides the same rungs and must be floor-gated`);
  }
  assert.match(SCREEN, /layersBelowFloor\(layers, viewport\?\.zoom \?\? null, FLOOR_GATED_PIN_ROWS/);
  assert.match(SCREEN, /\{floorHintVisible \? \(\s*<View pointerEvents="none"/, 'the map hint must never take a touch');
});

test('a missed tap while choosing an endpoint keeps planning, and the put-in stays drawn', () => {
  assert.match(SCREEN, /const choosingEndpoint = mapPlanning && planner\.step !== 'result';/);
  const dismiss = /const dismissMapSelection = useCallback\(\(\) => \{([\s\S]*?)\}, \[/.exec(SCREEN);
  assert.ok(dismiss);
  assert.match(
    dismiss[1],
    /if \(!choosingEndpoint\) setMapPlanRiver\(null\);/,
    'a blank tap mid-plan must close the pin, not the planner',
  );
  const river = /const onSelectNetworkRiver = useCallback\(([\s\S]*?)\n {2}\);/.exec(SCREEN);
  assert.ok(river);
  assert.match(
    river[1],
    /if \(choosingEndpoint\) \{[\s\S]{0,160}return;\s*\}\s*setMapPlanRiver\(null\);/,
    'a river-line tap mid-plan must not end planning or switch rivers',
  );
  // Drawn whenever chosen, never gated on the compact planner being open.
  assert.match(SCREEN, /: planner\.putIn \? \{ putIn: planner\.putIn, takeOut: null \} : null,/);
  // "Use as take-out" only against a put-in being planned or a finished plan's.
  assert.match(SCREEN, /canSetTakeOut=\{\s*\(mapPlanning \|\| planner\.plan != null\) &&/);
  // And a put-in alone can be cleared from the map.
  assert.match(SCREEN, /\{!unavailable && \(planner\.plan \|\| planner\.putIn\) && !mapSearchOpen \? \(/);
});

test('an access pin on another river does not switch rivers under a plan', () => {
  assert.match(
    SCREEN,
    /const planHoldsRiver = selectedSlug !== null && \(planner\.putIn !== null \|\| planner\.plan !== null\);/,
  );
  assert.match(SCREEN, /entry\?\.riverSlug && entry\.riverSlug !== selectedSlug && !planHoldsRiver/);
  // Acting on the place is what switches, and the put-in lands on the new
  // river's planner rather than the old one's.
  assert.match(
    SCREEN,
    /planner\.reset\(\);\s*selectRiver\(pinRiver, \{ camera: 'hold' \}\);\s*deferredPlanAction\.current = \{ riverSlug: pinRiver, run: \(fresh\) => fresh\.choosePutIn\(point\) \};/,
  );
  // The deferred action runs after useFloatPlan's reset, which only holds if
  // the effect is declared after the hook.
  const hook = SCREEN.indexOf('const planner = useFloatPlan(');
  const applies = SCREEN.indexOf('const deferred = deferredPlanAction.current;');
  assert.ok(hook > 0 && applies > hook, 'the deferred plan action must be applied after the planner resets');
});

test('search and tap land in the same state for gauges', () => {
  const body = /const onSelectResult = useCallback\(\(result: SearchResult\) => \{([\s\S]*?)\n {2}\}, \[/.exec(SCREEN);
  assert.ok(body);
  const gaugeBranch = body[1].slice(body[1].indexOf("if (result.kind === 'gauge')"));
  // A tapped gauge selects no river; neither does a searched one with a point.
  assert.match(gaugeBranch, /if \(target\) \{\s*issueCameraCommand\(\{\s*type: 'searchResultSelected'/);
  assert.match(gaugeBranch, /\} else if \(result\.riverSlug\) \{\s*selectRiver\(result\.riverSlug, \{ camera: 'fitRiver', waitForSheet: false \}\);/);
  // And a station hidden by the flow-band chips widens them instead of
  // flying to an empty spot.
  assert.match(gaugeBranch, /applyGaugeFilters\(\[lite\], gaugeFilter\)\.length === 0/);
});

test('a put-in chosen from its sheet is not reopened by the river response landing late', () => {
  for (const name of ['onSetPutIn', 'onSetTakeOut']) {
    const start = SCREEN.indexOf(`${name}={() => {`);
    assert.ok(start > 0, `${name} moved`);
    const body = SCREEN.slice(start, SCREEN.indexOf('}}', start));
    assert.match(body, /pendingAccessSelection\.current = null;/, `${name} must cancel the pending reopen`);
  }
  assert.match(
    SCREEN,
    /setSelectedPin\(\(current\) => \(current === null \|\| current\.id === pin\.id \? pin : current\)\);/,
    'a landing response may only fill an empty slot or refresh the same place',
  );
});

test('a pending put-in never outlives the navigation that asked for it', () => {
  const select = /const selectRiver = useCallback\(([\s\S]*?)switch \(intent\.camera\)/.exec(SCREEN);
  assert.ok(select);
  assert.match(
    select[1],
    /pendingAccessSelection\.current = null;/,
    'choosing another river and then this one reopened an old put-in',
  );
  // Set only while a selection effect will answer it — not for a river that
  // is already selected and whose response has already landed.
  assert.match(SCREEN, /hold \|\| answered \? null : \{ id: accessId, riverSlug: slug, layer: pinLayer, named: \{ fitCommandId \} \}/);
  // Search and deep links share the one opener.
  assert.match(SCREEN, /openNamedAccess\(result\.id, result\.riverSlug, null\)/);
  assert.match(SCREEN, /openNamedAccess\(accessId, riverSlug, null\)/);
});

test('a search result that opens a sheet waits for it, and one that opens nothing does not', () => {
  const waiting = cameraCommandFor({ type: 'searchResultSelected', lng: -91, lat: 37, waitForSheet: true }, 1);
  assert.equal(waiting && 'waitForSheet' in waiting && waiting.waitForSheet, true);
  const bare = cameraCommandFor({ type: 'searchResultSelected', lng: -91, lat: 37 }, 2);
  assert.equal(
    bare && 'waitForSheet' in bare,
    false,
    'a result with no sheet must not queue its move until some unrelated sheet opens',
  );
  assert.match(SCREEN, /waitForSheet: pin !== null/);
});

test('offline search falls back to what the map draws from disk', () => {
  const rivers = [{
    id: 'r1',
    slug: 'current',
    name: 'Current River',
    region: 'Ozarks',
    gauges: [{ site_id: '07067000', lon: -91.0, lat: 37.0, is_primary: true }],
  }];
  const accessPoints = [{ point: accessPoint({ name: 'Cedar Grove', slug: 'cedar-grove' }), riverSlug: 'current' }];
  const none = { rivers: false, gauges: false, accessPoints: false };

  // Live sources answering: nothing added, so nothing duplicates them.
  assert.deepEqual(fallbackMatches('cedar', { rivers, accessPoints, missing: none }), []);

  const put = fallbackMatches('cedar', { rivers, accessPoints, missing: { ...none, accessPoints: true } });
  assert.equal(put.length, 1);
  assert.equal(put[0].kind, 'access_point');
  assert.equal(put[0].riverSlug, 'current');
  assert.equal(put[0].riverName, 'Current River');
  assert.deepEqual(put[0].coordinates, accessPoints[0].point.coordinates);

  const river = fallbackMatches('current', { rivers, accessPoints, missing: { ...none, rivers: true } });
  assert.deepEqual(river.map((r) => [r.kind, r.riverSlug]), [['river', 'current']]);

  const gauge = fallbackMatches('0706', { rivers, accessPoints, missing: { ...none, gauges: true } });
  assert.equal(gauge.length, 1);
  assert.equal(gauge[0].siteId, '07067000');
  assert.deepEqual(gauge[0].coordinates, { lng: -91.0, lat: 37.0 });
  // No reading is claimed from a copy that holds none.
  assert.equal(gauge[0].gauge, null);

  assert.match(SCREEN, /fallback: \{ rivers: networkRivers, accessPoints: drawnAccessPoints \}/);
});

// ── Review follow-ups ─────────────────────────────────────────────────────

test('opening an access point the map does not hold keeps the plan on its river', async () => {
  // A landing added since the bundle, searched while a plan holds another
  // river: this used to switch rivers so that river's response could produce
  // it, which reset the planner before anyone chose "Use as put-in".
  const point = { id: 'new-1', name: 'New Landing', coordinates: { lng: -91.2, lat: 37.3 }, riverMile: 4 };
  const calls = { selectRiver: [] as unknown[], selected: [] as Array<{ id: string; riverSlug: string }>, held: [] as unknown[] };
  const context = (stored: unknown, fetched: unknown[] = []) => ({
    drawnAccessPoints: [], planHoldsRiver: true, selectedSlug: 'current', plannerAccess: null,
    heldAccessRequest: { current: 0 }, pendingAccessSelection: { current: { id: 'stale', riverSlug: 'x' } },
    navigationEpoch: { current: 0 }, cameraCommandId: { current: 0 }, showPlaceNotice: () => {},
    readRiver: async () => stored,
    fetchRiverAccessPoints: async () => fetched,
    AbortController,
    accessPinLayer: () => 'access',
    mapAccessPointPin: (p: { id: string }, riverSlug: string, layer: string) => ({ id: `access:${p.id}`, riverSlug, layer }),
    setHeldAccess: (value: unknown) => calls.held.push(value),
    setSelectedPin: (pin: { id: string; riverSlug: string }) => calls.selected.push(pin),
    selectRiver: (...args: unknown[]) => calls.selectRiver.push(args),
    enableLayer: () => {}, issueCameraCommand: () => {},
  });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  // From the river's cached copy.
  const cached = context({ payload: { accessPoints: [point] } });
  handler('openNamedAccess', cached, SCREEN)('new-1', 'jacks-fork', null);
  await flush();
  assert.equal(calls.selectRiver.length, 0, 'the plan\'s river must not be switched');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.selected)), [{ id: 'access:new-1', riverSlug: 'jacks-fork', layer: 'access' }]);
  assert.equal(cached.pendingAccessSelection.current, null, 'no reopen token is left behind');

  // From the network when the cache predates it; a newer open supersedes it.
  const live = context(null, [point]);
  const open = handler('openNamedAccess', live, SCREEN);
  open('new-1', 'jacks-fork', null);
  live.heldAccessRequest.current += 1;
  await flush();
  assert.equal(calls.selected.length, 1, 'a superseded request opens nothing');

  // A sheet the reader opened while the fetch was in flight wins over it.
  const navigated = context(null, [point]);
  handler('openNamedAccess', navigated, SCREEN)('new-1', 'jacks-fork', null);
  navigated.navigationEpoch.current += 1;
  await flush();
  assert.equal(calls.selected.length, 1, 'a slow answer must not replace a sheet opened since');
  for (const handlerName of ['onSelectPin', 'onSelectNetworkRiver', 'dismissMapSelection', 'onSelectResult', 'focusOnAccess']) {
    const at = SCREEN.indexOf(`const ${handlerName} = useCallback(`);
    assert.ok(at > 0, handlerName);
    assert.match(SCREEN.slice(at, at + 400), /navigationEpoch\.current \+= 1;/, `${handlerName} is a navigation`);
  }

  // The sheet resolves the held point, so "Use as put-in" acts on its river.
  assert.match(SCREEN, /\?\? \(heldAccess\?\.point\.id === accessId \? heldAccess : null\)/);
});

test('a named place its river no longer lists frames the river now and says so', () => {
  // The river is selected and its list has settled without this id: no
  // sheet will open, so the fit must not wait for one. It used to sit in
  // RiverMap until some unrelated sheet opened, then fly to the whole river.
  const calls = { selectRiver: [] as unknown[][], notices: [] as string[], selected: [] as unknown[] };
  const context = {
    drawnAccessPoints: [], planHoldsRiver: false, selectedSlug: 'current',
    plannerAccess: { slug: 'current', settled: true },
    heldAccessRequest: { current: 0 }, pendingAccessSelection: { current: null as unknown },
    navigationEpoch: { current: 0 }, cameraCommandId: { current: 7 },
    accessPinLayer: () => 'access', mapAccessPointPin: () => null,
    selectRiver: (...args: unknown[]) => { calls.selectRiver.push(args); context.cameraCommandId.current += 1; },
    issueCameraCommand: () => {}, enableLayer: () => {}, setSelectedPin: (pin: unknown) => calls.selected.push(pin),
    showPlaceNotice: (message: string) => calls.notices.push(message),
    PLACE_NOT_LISTED: 'not listed',
  };
  handler('openNamedAccess', context, SCREEN)('gone-1', 'current', null);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.selectRiver)), [['current', { camera: 'fitRiver', waitForSheet: false }]]);
  assert.deepEqual(calls.notices, ['not listed']);
  assert.equal(context.pendingAccessSelection.current, null, 'nothing is left to reopen it later');
  assert.deepEqual(calls.selected, []);

  // Not yet answered (the river's list is still to come): it still waits for
  // the sheet, and the token remembers which command to release.
  const pending = { ...context, selectedSlug: 'jacks-fork', plannerAccess: null, pendingAccessSelection: { current: null as unknown } };
  calls.selectRiver.length = 0; calls.notices.length = 0;
  handler('openNamedAccess', pending, SCREEN)('maybe-1', 'current', null);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.selectRiver)), [['current', { camera: 'fitRiver', waitForSheet: true }]]);
  assert.deepEqual(calls.notices, []);
  assert.deepEqual(JSON.parse(JSON.stringify(pending.pendingAccessSelection.current)),
    { id: 'maybe-1', riverSlug: 'current', layer: null, named: { fitCommandId: context.cameraCommandId.current } });

  // And when that list lands without the id, the selection effect releases
  // the wait and says so; a token not set by name (the planner's) does not.
  const effect = SCREEN.slice(SCREEN.indexOf('if (pending?.riverSlug === slug) {'), SCREEN.indexOf('pendingAccessSelection.current = null;', SCREEN.indexOf('if (pending?.riverSlug === slug) {')));
  assert.match(effect, /\} else if \(pending\.named\) \{\s*(\/\/.*\s*)*releaseSheetWait\(pending\.named\.fitCommandId, slug\);\s*showPlaceNotice\(PLACE_NOT_LISTED\);/);
});

test('releasing a sheet wait touches only the command it names', () => {
  let state: Record<string, unknown> | null = { id: 4, type: 'fitBounds', bounds: [0, 0, 1, 1], waitForSheet: true };
  const pendingRiverFit = { current: { slug: 'current', gestures: 0, waitForSheet: true } as Record<string, unknown> | null };
  const release = handler('releaseSheetWait', {
    pendingRiverFit,
    setCameraCommand: (update: (current: unknown) => unknown) => { state = update(state) as typeof state; },
  }, SCREEN);
  release(3, 'other');
  assert.equal(state?.waitForSheet, true, 'an older id leaves the current command alone');
  assert.equal(pendingRiverFit.current?.waitForSheet, true, 'another river\'s deferred fit keeps waiting');
  release(4, 'current');
  assert.deepEqual(JSON.parse(JSON.stringify(state)), { id: 4, type: 'fitBounds', bounds: [0, 0, 1, 1], waitForSheet: false });
  assert.equal(pendingRiverFit.current?.waitForSheet, false, 'a fit deferred for this river stops waiting too');
  state = null;
  release(4, 'current');
  assert.equal(state, null, 'a consumed command is not resurrected');
});

test('a river result the map has no line for says so instead of doing nothing', () => {
  const river = SCREEN.slice(SCREEN.indexOf("if (result.kind === 'river' && result.riverSlug) {"), SCREEN.indexOf('// The pin the result opens, built first'));
  assert.match(river, /if \(!network\.loading && !network\.bySlug\.has\(result\.riverSlug\)\) showPlaceNotice\(RIVER_NOT_MAPPED\);/);
  // The notice is drawn, announced, and does not take touches.
  assert.match(SCREEN, /\{placeNotice \? \(\s*<View pointerEvents="none"/);
  assert.match(SCREEN, /AccessibilityInfo\.announceForAccessibility\(message\)/);
});

test('VoiceOver hears which river a listed place is on, and the land callout has one Close', () => {
  const places = readFileSync('../eddy-ios/src/components/MapPlacesSheet.tsx', 'utf8');
  assert.match(places, /accessibilityLabel=\{\[pin\.name, layer\?\.label, pin\.subtitle, pin\.value, pin\.codeLabel\]/);
  const land = readFileSync('../eddy-ios/src/map/PublicLandCallout.tsx', 'utf8');
  const scrim = land.slice(land.indexOf('<Pressable'), land.indexOf('/>', land.indexOf('<Pressable')));
  assert.doesNotMatch(scrim, /accessibilityRole|accessibilityLabel/, 'the scrim is not a second Close button');
  assert.match(scrim, /accessible=\{false\}/);
  assert.match(scrim, /onPress=\{onClose\}/, 'a tap on the scrim still dismisses');
  assert.equal((land.match(/accessibilityLabel="Close"/g) ?? []).length, 1);
  assert.match(land, /accessibilityViewIsModal/);
  assert.match(land, /onAccessibilityEscape=\{onClose\}/);
});

test('an offline gauge result opens a sheet with an honest absence of a reading', () => {
  const pin = handler('offlineGaugePin', { conditionColor: () => '#999', conditionLabel: () => 'Unknown' }, SCREEN);
  const offline = {
    kind: 'gauge', id: 'site:07067000', name: 'USGS 07067000', riverName: 'Current River', riverSlug: 'current',
    coordinates: { lng: -91.0, lat: 37.0 }, siteId: '07067000', gauge: null,
  };
  const built = pin(offline);
  assert.equal(built.layer, 'gauges');
  assert.equal(built.siteId, '07067000', 'the sheet still asks for the station by site');
  assert.equal(built.code, 'unknown', 'never graded from a copy that holds no reading');
  assert.equal(built.value, null);
  assert.match(built.body, /No reading while offline/);
  assert.equal(pin({ ...offline, gauge: { curated: true } }), null, 'a live result is never built from its thinner fields');
  assert.equal(pin({ ...offline, siteId: null }), null);
  assert.match(SCREEN, /if \(known && hasCoordinates\(known\)\) return mapGaugePin\(known\);\s*return offlineGaugePin\(result\);/);
});

test('nothing pushes a second Map screen: "View on map" navigates to the existing tab', () => {
  // router.push to '/' mints a fresh copy of the Map screen on the stack. The
  // camping sheet's "View on map" did, focused on its campground, and every
  // later return to the Map tab landed on that copy — "the map keeps sending
  // me back to Steel Creek". navigate returns to the Map tab that exists.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk('../eddy-ios/app');
  walk('../eddy-ios/src');
  const offenders: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/router\.(push|replace)\(\{([\s\S]{0,300}?)\}\)/g)) {
      if (/pathname:\s*['"]\/['"]/.test(match[2])) offenders.push(`${file}: router.${match[1]}`);
    }
  }
  assert.deepEqual(offenders, [], 'open the Map tab with router.navigate, never push or replace a copy of it');
  assert.match(readFileSync('../eddy-ios/src/components/CampingDetailSheet.tsx', 'utf8'),
    /router\.navigate\(\{\s*pathname: '\/',\s*params: \{\s*focusAccess:/);
});
