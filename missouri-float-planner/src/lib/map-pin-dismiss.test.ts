import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { mapPlanSelection } from '../../../eddy-ios/src/map/planSelection';
import { mapAccessPointPin } from '../../../eddy-ios/src/map/accessPin';
import { pinStarItem, pinStarProps } from '../../../eddy-ios/src/lib/pinStar';
import type { MapAccessPoint } from '../../../packages/eddy-types';

const SCREEN = readFileSync(join(process.cwd(), '..', 'eddy-ios', 'app', '(tabs)', '(map)', 'index.tsx'), 'utf8');
const source = ts.createSourceFile('index.tsx', SCREEN, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Run actual screen handlers with observed state setters, without importing
// native Mapbox. Use the real pin builder and selection resolver together.
function callback(name: string, context: Record<string, unknown>) {
  let arrow: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name &&
      node.initializer && ts.isCallExpression(node.initializer)) arrow = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(arrow, `${name} must be defined`);
  return runInNewContext(ts.transpile(`(${arrow.getText(source)})`, { target: ts.ScriptTarget.ES2022 }), context) as (...args: unknown[]) => void;
}

const putIn: MapAccessPoint = { id: 'rymers', name: 'Rymers', type: 'access', riverMile: 16.2,
  isPublic: true, coordinates: { lng: -91.4, lat: 37.1 } };
const takeOut = { ...putIn, id: 'bay-creek', name: 'Bay Creek', riverMile: 25.2 };
const campOnly = { ...takeOut, id: 'camp-only', isFloatEndpoint: false };
const slug = 'jacks-fork';

function scene(planning = false) {
  const state = { selectedSlug: slug, mapPlanRiver: planning ? slug : null as string | null,
    riverSheetOpen: false, revealsRiverSheet: false, selectedPin: null as unknown,
    cameraCommands: 0, cameraCommand: { id: 1 } as unknown, putIn, takeOut, step: 'take-out' };
  const pendingAccessSelection = { current: null };
  const pendingMapPlanFrame = { current: null };
  const pendingRiverFit = { current: { slug } as { slug: string } | null };
  const run = (name: string, ...args: unknown[]) => callback(name, {
    ...state, pendingAccessSelection, pendingMapPlanFrame,
    pendingRiverFit, setCameraCommand: (command: unknown) => { state.cameraCommand = command; },
    mapPlanning: state.mapPlanRiver === state.selectedSlug,
    planOpen: false, mapPlanSelection, cancelMapSearch: () => {},
    gestureCount: { current: 0 }, isGaugeIndexId: () => false,
    accessPointForPin: () => ({ point: campOnly, riverSlug: slug }),
    setSelectedPin: (value: unknown) => { state.selectedPin = value; },
    setRiverSheetOpen: (value: boolean) => { state.riverSheetOpen = value; },
    setRevealsRiverSheet: (value: boolean) => { state.revealsRiverSheet = value; },
    setMapPlanRiver: (value: string | null) => { state.mapPlanRiver = value; },
    issueCameraCommand: () => { state.cameraCommands++; },
    selectRiver: (nextSlug: string) => { state.selectedSlug = nextSlug; },
    planner: { step: state.step, putIn: state.putIn, takeOut: state.takeOut,
      putInOptions: [putIn, takeOut], takeOutOptions: [takeOut],
      choosePutIn: (point: MapAccessPoint) => { state.putIn = point; },
      chooseTakeOut: (point: MapAccessPoint) => { state.takeOut = point; state.step = 'result'; } },
  })(...args);
  return { state, run, pendingRiverFit };
}

test('closing the route returns to the map while retaining river, endpoints and camera', () => {
  const { state, run, pendingRiverFit } = scene(true);
  state.riverSheetOpen = true;
  run('dismissMapPlan');
  assert.equal(state.mapPlanRiver, null);
  assert.equal(state.cameraCommand, null);
  assert.equal(pendingRiverFit.current, null);
  assert.equal(state.riverSheetOpen, false);
  assert.equal(state.selectedSlug, slug);
  assert.equal(state.putIn, putIn);
  assert.equal(state.takeOut, takeOut);
  assert.equal(state.cameraCommands, 0);
});

test('a selected river does not add a stop when a point is opened from the map', () => {
  const { state, run } = scene();
  state.riverSheetOpen = true;
  run('onSelectPin', mapAccessPointPin(campOnly, slug));
  assert.equal(state.revealsRiverSheet, false);
  const commands = state.cameraCommands;
  run('dismissPin');
  assert.equal(state.selectedPin, null);
  assert.equal(state.riverSheetOpen, false);
  assert.equal(state.selectedSlug, slug);
  assert.equal(state.cameraCommands, commands);
});

test('an access opened from the river sheet returns to that sheet', () => {
  const { state, run } = scene();
  state.riverSheetOpen = true;
  run('onSelectPin', mapAccessPointPin(takeOut, slug), 'river-sheet');
  assert.equal(state.revealsRiverSheet, true);
  assert.equal(state.riverSheetOpen, false);
  run('dismissPin');
  assert.equal(state.selectedPin, null);
  assert.equal(state.riverSheetOpen, true);
});

test('POI dismissal during either endpoint step or the result returns to the existing route', () => {
  for (const step of ['put-in', 'take-out', 'result']) {
    const { state, run } = scene(true);
    state.step = step;
    run('onSelectPin', mapAccessPointPin(campOnly, slug, 'campgrounds'));
    assert.ok(state.selectedPin);
    const commands = state.cameraCommands;
    run('dismissPin');
    assert.equal(state.selectedPin, null);
    assert.equal(state.mapPlanRiver, slug);
    assert.equal(state.riverSheetOpen, false);
    assert.equal(state.putIn, putIn);
    assert.equal(state.takeOut, takeOut);
    assert.equal(state.cameraCommands, commands);
  }
});

test('the real map handler selects Bay Creek without a confirmation sheet', () => {
  const { state, run } = scene(true);
  run('onSelectPin', mapAccessPointPin(takeOut, slug, 'campgrounds'));
  assert.equal(state.takeOut, takeOut);
  assert.equal(state.step, 'result');
  assert.equal(state.selectedPin, null);
  assert.equal(state.cameraCommands, 0);
});

test('Back and close use the same return handler and planning names the route', () => {
  const pinSheet = SCREEN.slice(SCREEN.indexOf('<PinSheet'), SCREEN.indexOf('{...pinStarProps('));
  assert.match(pinSheet, /onClose=\{dismissPin\}/);
  assert.match(pinSheet, /onBack=\{mapPlanning .*\? dismissPin : null\}/);
  assert.match(pinSheet, /backLabel=\{mapPlanning \? 'Your route'/);
  assert.match(SCREEN, /riverSheetOpen && riverSheetData && !selectedPin/);
  assert.match(SCREEN, /onClose=\{dismissMapPlan\}/);
});

test('empty map dismisses details and route sheet without clearing endpoints or moving the camera', () => {
  const { state, run, pendingRiverFit } = scene(true);
  state.selectedPin = { id: 'gauge:1' };
  state.riverSheetOpen = true;
  run('dismissMapSelection');
  assert.equal(state.selectedPin, null);
  assert.equal(state.riverSheetOpen, false);
  assert.equal(state.mapPlanRiver, null);
  assert.equal(state.selectedSlug, slug);
  assert.equal(state.putIn, putIn);
  assert.equal(state.takeOut, takeOut);
  assert.equal(state.cameraCommands, 0);
  assert.equal(pendingRiverFit.current, null);
});

test('tapping the still-selected river after background dismissal reopens its sheet', () => {
  const { state, run } = scene(true);
  run('dismissMapSelection');
  assert.equal(state.riverSheetOpen, false);
  run('onSelectNetworkRiver', slug, { lng: -91.4, lat: 37.1 });
  assert.equal(state.riverSheetOpen, true);
  assert.equal(state.mapPlanRiver, null);
  assert.equal(state.selectedSlug, slug);
  assert.equal(state.putIn, putIn);
  assert.equal(state.takeOut, takeOut);
});

test('rated gauges, national gauges and dams star from the map as their screens store them', () => {
  const rated = { id: 'g-uuid', name: 'Current at Van Buren', usgsSiteId: '07067000', provider: 'usgs',
    thresholds: [{ isPrimary: false, riverSlug: 'jacks-fork' }, { isPrimary: true, riverSlug: 'current' }] };
  assert.deepEqual(pinStarItem({ layer: 'gauges', name: 'x' }, rated, null), {
    kind: 'gauge', entityId: 'g-uuid', name: rated.name, slug: 'current', usgsSiteId: '07067000', provider: 'usgs',
  });
  // The national tier rates no river: an honest empty slug, an unknown provider.
  const national = { id: 'n-uuid', name: 'Creek near Town', siteId: '07000001' };
  assert.deepEqual(pinStarItem({ layer: 'allGauges', name: 'x' }, null, national), {
    kind: 'gauge', entityId: 'n-uuid', name: national.name, slug: '', usgsSiteId: '07000001', provider: null,
  });
  // An index-decoded gauge has no gauge_stations id; a star under it is a star under nothing.
  assert.equal(pinStarItem({ layer: 'allGauges', name: 'x' }, null, { ...national, id: 'idx:07000001' }), null);
  assert.deepEqual(pinStarItem({ layer: 'dams', name: 'Bull Shoals', damId: 'bull-shoals', riverSlug: 'white' }, null, null),
    { kind: 'dam', entityId: 'bull-shoals', name: 'Bull Shoals', slug: 'white' });
  // Hazards and springs have no star store at all.
  assert.equal(pinStarItem({ layer: 'hazards', name: 'x' }, null, null), null);

  const toggled: unknown[] = [];
  const props = pinStarProps(pinStarItem({ layer: 'dams', name: 'Dam', damId: 'd' }, null, null),
    (kind, id) => kind === 'dam' && id === 'd', (item) => toggled.push(item));
  assert.equal(props.starred, true);
  props.onToggleStar?.();
  assert.equal(toggled.length, 1);
  assert.deepEqual(pinStarProps(null, () => true, () => {}), { starred: false, onToggleStar: null });
  assert.match(SCREEN, /\{\.\.\.pinStarProps\(pinStarItem\(selectedPin, pinGauge, pinReferenceGauge\), isStarred, toggleStar\)\}/);
});
