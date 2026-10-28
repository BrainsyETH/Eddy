import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { nextPinId, gestureStarted, pointNeedsReveal } from '../../../eddy-ios/src/map/mapInteraction';
import { gaugeCoverage } from '../../../eddy-ios/src/map/gaugeCoverage';
import { requestCovers } from '../../../packages/eddy-geo';
import { decodeGaugePoints } from '../../../packages/eddy-types';
import { cameraCommandFor } from '../../../eddy-ios/src/map/cameraBehavior';

const mapText = readFileSync('../eddy-ios/src/map/RiverMap.tsx', 'utf8');
const source = ts.createSourceFile('RiverMap.tsx', mapText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name: string, context: Record<string, unknown>) {
  let arrow: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) {
      arrow = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(arrow);
  return runInNewContext(ts.transpile(`(${arrow.getText(source)})`, { target: ts.ScriptTarget.ES2022 }), context);
}

test('capped statewide results do not cover a valley under the same budget', () => {
  const broad = { bbox: [-96, 34, -88, 41] as [number, number, number, number], limit: 1000, capped: true };
  assert.equal(requestCovers(broad, [-92.1, 37.1, -91.9, 37.3], 1000), false);
  assert.equal(requestCovers({ ...broad, capped: false }, [-92.1, 37.1, -91.9, 37.3], 300), true);
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

test('each gesture reports once, including gestures after an app-driven camera move', () => {
  let calls = 0;
  const context = {
    gestureLatched: { current: false }, interactionEpoch: { current: 0 }, tapSequence: { current: 0 },
    cycle: { current: null }, onPinCycle: () => {}, gestureStarted,
    pendingCommand: { current: null }, appliedCommandId: { current: null }, liveCamera: { current: null },
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

function scene() {
  const selected: string[] = []; let dismissed = 0;
  const pins = new Map(['gauge:1', 'access:2'].map(id => [id, { id, name: id }]));
  const context = {
    byId: pins, cycle: { current: null }, nextPinId,
    AccessibilityInfo: { announceForAccessibility: () => {} }, onPinCycle: () => {},
    onSelectPin: (pin: { id: string }) => selected.push(pin.id),
    interactionEpoch: { current: 0 }, tapSequence: { current: 0 },
    clusterSources: { current: new Map() }, onZoomToCluster: () => {}, onNetworkPress: () => {},
    warn: () => {}, onBackgroundPress: () => { dismissed++; },
    mapRef: { current: { queryRenderedFeaturesInRect: async () => ({ features: [] as object[] }) } },
  };
  const selectPinHits = handler('selectPinHits', context);
  return { context, selected, dismissed: () => dismissed,
    press: handler('onMapPress', { ...context, selectPinHits }) as (event: object) => Promise<void> };
}
const tap = { properties: { screenPointX: 100, screenPointY: 200 } };
test('real map handler cycles cross-source hits despite reversed order and duplicate icon/label hits', async () => {
  const s = scene(); let reverse = false;
  s.context.mapRef.current.queryRenderedFeaturesInRect = async () => {
    const ids = reverse ? ['access:2', 'gauge:1'] : ['gauge:1', 'access:2', 'gauge:1']; reverse = !reverse;
    return { features: ids.map(id => ({ properties: { id } })) };
  };
  await s.press(tap); await s.press(tap); await s.press(tap);
  assert.deepEqual(s.selected, ['access:2', 'gauge:1', 'access:2']);
  assert.equal(s.dismissed(), 0);
  // Source listeners would intercept the map-level handler on native iOS.
  for (const match of mapText.matchAll(/<Mapbox.ShapeSource\b[\s\S]*?>/g)) assert.doesNotMatch(match[0], /onPress=/);
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
  assert.equal(s.dismissed(), 0);
});

test('a stale cluster expansion cannot clear a newer selection cycle', async () => {
  const s = scene();
  const feature = { properties: { cluster_id: 12 }, geometry: { coordinates: [-91, 37] } };
  const newerCycle = { ids: ['access:2', 'gauge:1'], selectedId: 'access:2' };
  s.context.clusterSources.current.set('pins-allGauges', {
    getClusterExpansionZoom: async () => {
      s.context.interactionEpoch.current++;
      Object.assign(s.context.cycle, { current: newerCycle });
      return 9;
    },
  });
  s.context.mapRef.current.queryRenderedFeaturesInRect = async () => ({ features: [feature] });
  await s.press(tap);
  assert.equal(s.context.cycle.current, newerCycle);
  assert.equal(s.dismissed(), 0);
});
