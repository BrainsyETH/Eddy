// Exercise Expo's actual route expansion, without loading native screen code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { getRoutes } = require('expo-router/build/getRoutesCore');
const root = path.join(__dirname, '../app');
const keys = fs.readdirSync(root, { recursive: true }).filter(p => /\.tsx$/.test(p)).map(p => `./${p}`);
function literal(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => [p.name.text, literal(p.initializer)]));
  throw new Error('Route settings must be static literals');
}
function context(key) {
  const source = ts.createSourceFile(key, fs.readFileSync(path.join(root, key), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let settings;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) === 'unstable_settings') settings = literal(declaration.initializer);
    }
  }
  return { default() {}, unstable_settings: settings };
}
context.keys = () => keys;
const tree = getRoutes(context, { platform: 'ios', skipGenerated: true, importMode: 'sync' });
const tabs = tree.children.find(route => route.route === '(tabs)');
assert.ok(tabs, 'Native tab navigator is missing');
const roots = { today: 'reports', map: 'index', floats: 'float-home', favorites: 'favorites', alerts: 'alerts' };
for (const [group, initial] of Object.entries(roots)) {
  const stack = tabs.children.find(route => route.route === `(${group})`);
  assert.ok(stack, `Missing ${group} stack`);
  assert.equal(stack.initialRouteName, initial, `${group} must open its own root`);
  const routes = stack.children.map(route => route.route);
  for (const detail of ['river/[slug]', 'gauge/[siteId]', 'dam/[damId]', 'river-conditions', 'camping', 'weather', 'eddy-reads']) {
    assert.ok(routes.includes(detail), `${detail} must push inside ${group}`);
  }
  for (const other of Object.values(roots).filter(name => name !== initial)) {
    assert.ok(!routes.includes(other), `${other} would open in the wrong tab`);
  }
}
assert.ok(tree.children.some(route => route.route === 'alerts/(create)'), 'Alert creation must remain a root modal');
assert.ok(!tree.children.some(route => /^(river|gauge|dam)\//.test(route.route)), 'Details must not hide the tabs');
console.log('Tab stacks, shared detail routes, anchors, and root alert modal verified.');

// Run Expo's real path resolution, action targeting, native-tab router, and
// stack reducers. Only the native module barrel and mounted store are replaced;
// no route matching, push, tab switching, or Back algorithm is mocked here.
const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter');
const { TabRouter } = require('expo-router/build/react-navigation/routers/TabRouter');
const { validatePathConfig } = require('expo-router/build/react-navigation/core/validatePathConfig');
function provide(moduleName, exports) {
  const filename = require.resolve(moduleName);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
provide('expo-router/build/react-navigation/native', { validatePathConfig, TabRouter });
provide('expo-linking', { openURL() { throw new Error('Unexpected external navigation'); } });
const { NativeBottomTabsRouter } = require('expo-router/build/native-tabs/NativeBottomTabsRouter');
const { getStateFromPath } = require('expo-router/build/fork/getStateFromPath');
const { getReactNavigationConfig } = require('expo-router/build/getReactNavigationConfig');
const { getRouteInfoFromState } = require('expo-router/build/global-state/getRouteInfoFromState');
const { resolveHref } = require('expo-router/build/link/href');
const { INTERNAL_SLOT_NAME } = require('expo-router/build/constants');
// The extra root matches Expo's getNavigationConfig wrapper.
const wrappedTree = { children: [{ ...tree, route: INTERNAL_SLOT_NAME }] };
const config = { screens: { [INTERNAL_SLOT_NAME]: { path: '', ...getReactNavigationConfig(tree, true) } } };
const mounted = new Map();
let state;
function mount(node, partial) {
  const router = node.route === '(tabs)'
    ? NativeBottomTabsRouter({ initialRouteName: node.initialRouteName })
    : StackRouter({ initialRouteName: node.initialRouteName });
  const options = { routeNames: node.children.map(child => child.route), routeParamList: {}, routeGetIdList: {} };
  const result = partial ? router.getRehydratedState(partial, options) : router.getInitialState(options);
  mounted.set(result.key, { router, options });
  return { ...result, routes: result.routes.map(route => {
    const child = node.children.find(child => child.route === route.name);
    return child.children.length ? { ...route, state: mount(child, route.state) } : route;
  }) };
}
function launch(href) {
  mounted.clear();
  const partial = getStateFromPath(href, config);
  assert.ok(partial, `Unresolved launch URL: ${href}`);
  state = mount(wrappedTree, partial);
}
const store = {
  assertIsReady() { assert.ok(state); },
  navigationRef: { current: { getRootState: () => state } },
  redirects: [],
  getRouteInfo: () => getRouteInfoFromState(state),
  linking: { config, getStateFromPath: (href, options) => getStateFromPath(href, options, store.getRouteInfo().segments) },
};
provide('expo-router/build/global-state/store', { store });
const { getNavigateAction } = require('expo-router/build/global-state/getNavigationAction');
function apply(action, current = state) {
  if (current.key === action.target) {
    const { router, options } = mounted.get(current.key);
    const next = router.getStateForAction(current, action, options);
    assert.ok(next, `Unhandled ${action.type} on ${current.type}`);
    return next;
  }
  return { ...current, routes: current.routes.map(route => route.state ? { ...route, state: apply(action, route.state) } : route) };
}
function push(href) {
  const action = getNavigateAction(resolveHref(href), {}, 'PUSH');
  assert.ok(action);
  state = apply(action);
  return action;
}
const appState = () => state.routes[state.index].state;
const tabsState = () => appState().routes.find(route => route.name === '(tabs)').state;
const activeStack = () => tabsState().routes[tabsState().index].state;
const activeTab = () => tabsState().routes[tabsState().index].name;
function back(target = activeStack().key) { state = apply({ type: 'GO_BACK', target }); }
function selectTab(group) { state = apply({ type: 'NAVIGATE', target: tabsState().key, payload: { name: `(${group})` } }); }

// Compile our pure route helpers without importing any native screen components.
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(output.outputText, filename);
};
const { redirectSystemPath } = require('../app/+native-intent.tsx');
const { notificationDestination } = require('../src/lib/notificationDestination.ts');
const { weatherDestination } = require('../src/lib/weatherDestination.ts');
const { planAccessDestination, planCampingDestination } = require('../src/lib/planDestinations.ts');
for (const href of ['/', 'eddy:///', 'https://eddy.guide/']) {
  launch(redirectSystemPath({ path: href, initial: true }));
  assert.equal(activeTab(), '(today)', 'Plain launches must start on Today');
  assert.equal(activeStack().routes.at(-1).name, 'reports');
  selectTab('map');
  assert.equal(activeTab(), '(map)');
  assert.equal(activeStack().routes.at(-1).name, 'index');
}
launch(redirectSystemPath({ path: '/?focusRiver=current&focusAccess=akers', initial: true }));
assert.equal(activeTab(), '(map)', 'Explicit map links must survive the Today launch default');
assert.equal(activeStack().routes.at(-1).params.focusAccess, 'akers');
for (const [group, initial] of Object.entries(roots)) {
  launch(`/(tabs)/(${group})/${initial === 'index' ? '' : initial}`);
  const owner = `(${group})`;
  const stackKey = activeStack().key;
  const beforeOtherTabs = tabsState().routes.filter(route => route.name !== owner);
  for (const href of ['/river/current', '/gauge/07067000', '/dam/clearwater']) {
    const before = activeStack();
    const action = push(href);
    assert.equal(action.target, stackKey, `${href} escaped ${owner}`);
    assert.equal(action.type, 'PUSH');
    assert.equal(activeTab(), owner);
    assert.equal(appState().routes.length, 1, 'A detail covered the tab navigator');
    back();
    assert.deepEqual(activeStack(), before, `Back from ${href} lost ${owner}'s history`);
  }
  push('/river/current?gauge=07067000');
  const river = activeStack();
  push('/river/current/access/van-buren');
  assert.equal(activeStack().routes.at(-1).name, 'river/[slug]/access/[accessSlug]');
  back();
  assert.deepEqual(activeStack(), river);
  push(weatherDestination({ lat: 37.42, lng: -91.26 }));
  assert.equal(activeTab(), owner, 'Weather must stay in the river’s tab');
  assert.equal(activeStack().routes.at(-1).name, 'weather');
  assert.equal(activeStack().routes.at(-1).params.lat, '37.42');
  back();
  assert.deepEqual(activeStack(), river, 'Back from weather lost the river');
  // Both the map planner and a saved float keep their stack when opening a
  // place or a dated campground. Back must restore that exact origin.
  for (const fromSaved of [false, true]) {
    if (fromSaved) push('/float/TESTPLAN');
    const origin = activeStack();
    for (const destination of [
      planAccessDestination('current', { slug: 'cedargrove' }),
      planCampingDestination('current', { slug: 'cedargrove' }, { facilityId: 'cedar-camp' }, '2026-10-03', true),
    ]) {
      const action = push(destination);
      assert.equal(action.target, stackKey, 'Plan details must stay in the originating tab');
      assert.equal(activeStack().routes.at(-1).params[destination.pathname === '/camping' ? 'night' : 'accessSlug'],
        destination.pathname === '/camping' ? '2026-10-03' : 'cedargrove');
      back();
      assert.deepEqual(activeStack(), origin, 'Back from plan details lost the origin');
    }
    if (fromSaved) back();
  }
  const other = group === 'today' ? 'map' : 'today';
  selectTab(other); selectTab(group);
  assert.deepEqual(activeStack(), river, 'Tab switch lost the detail history');
  assert.deepEqual(tabsState().routes.filter(route => route.name !== owner).map(route => route.state), beforeOtherTabs.map(route => route.state));
  for (const data of [
    { gaugeSiteId: '07067000', alertId: 'rule-1', alertSource: 'gauge' },
    { riverSlug: 'jacks-fork', alertId: 'rule-2', alertSource: 'river' },
  ]) {
    const action = push(notificationDestination(data));
    assert.equal(action.target, stackKey, 'Notification escaped the active tab');
    assert.equal(activeStack().routes.at(-1).params.alertId, data.alertId);
    back();
    assert.deepEqual(activeStack(), river);
  }
  for (const href of ['/alerts/quiet-hours', '/alerts/rule-1?source=gauge']) {
    const manage = push(href);
    assert.equal(manage.target, appState().key, 'Alert management must target the root modal stack');
    assert.equal(appState().routes.at(-1).name, 'alerts/(manage)');
    back(appState().key);
    assert.equal(activeTab(), owner);
    assert.deepEqual(activeStack(), river, 'Dismissing management lost the source screen');
  }
  const modal = push('/alerts/new');
  assert.equal(modal.target, appState().key, 'Alert creation must target the root modal stack');
  assert.equal(appState().routes.at(-1).name, 'alerts/(create)');
  back(appState().key);
  assert.equal(activeTab(), owner);
  assert.deepEqual(activeStack(), river, 'Dismissing alert creation lost the source screen');
}
for (const [href, group, screen] of [
  ['https://eddy.guide/river/current?gauge=07067000#conditions', 'today', 'river/[slug]'],
  ['eddy://gauge/07067000', 'today', 'gauge/[siteId]'],
  ['/storage', 'today', 'storage'],
  ['/profile', 'today', 'profile'],
  ['/floats', 'floats', 'floats'],
  ['/favorite-floats', 'floats', 'favorite-floats'],
  ['https://eddy.guide/plan/TESTPLAN', 'floats', 'float/[shortCode]'],
]) {
  launch(redirectSystemPath({ path: href, initial: true }));
  assert.equal(activeTab(), `(${group})`, `Wrong cold-link owner for ${href}`);
  assert.equal(activeStack().routes.at(-1).name, screen);
  back();
  assert.equal(activeStack().routes.at(-1).name, roots[group], 'Cold link has no useful Back destination');
}
// Settings is not a tab: the account button pushes it inside Today or
// Favorites, and Back returns to that tab's root.
for (const group of ['today', 'favorites']) {
  launch(`/(tabs)/(${group})/${roots[group]}`);
  const action = push('/profile');
  assert.equal(activeTab(), `(${group})`, `Settings escaped ${group}`);
  assert.equal(action.type, 'PUSH');
  assert.equal(activeStack().routes.at(-1).name, 'profile');
  push('/storage');
  assert.equal(activeStack().routes.at(-1).name, 'storage', 'Storage must push over Settings');
  back(); back();
  assert.equal(activeStack().routes.at(-1).name, roots[group], 'Back from Settings lost the tab root');
}
console.log('Shared pushes, nested Back, independent tab history, notification destinations, cold links, and root modal dismissal verified.');

for (const href of ['/alerts/quiet-hours', '/alerts/rule-1?source=gauge']) {
  launch(redirectSystemPath({ path: href, initial: true }));
  assert.equal(appState().routes.at(-1).name, 'alerts/(manage)');
  const modal = appState().routes.at(-1).state;
  assert.equal(modal.routes.at(-1).name, href.includes('quiet-hours') ? 'quiet-hours' : '[id]');
}
console.log('Quiet hours and edit sheets preserve warm origins and resolve cold URLs.');
