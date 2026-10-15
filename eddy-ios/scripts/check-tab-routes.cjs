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
  for (const detail of ['river/[slug]', 'gauge/[siteId]', 'dam/[damId]', 'river-conditions', 'camping', 'weather', 'eddy-reads', 'river-guides', 'float-history-recap']) {
    assert.ok(routes.includes(detail), `${detail} must push inside ${group}`);
  }
  for (const detail of ['float-mode', 'float-options', 'float-recap']) assert.ok(!routes.includes(detail), `${detail} must have only one root presentation`);
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
// Read identity configuration from the shipped layout instead of inventing it
// in the harness: removing a singular prop must make the duplicate test fail.
function screenIdentity(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let identity;
  function visit(node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === 'Stack.Screen') {
      const attrs = node.attributes.properties;
      const named = attrs.find(a => a.name?.text === 'name');
      const singular = attrs.find(a => a.name?.text === 'dangerouslySingular');
      if (named?.initializer?.text === name && singular?.initializer?.expression) {
        const callback = require('../src/lib/floatNavigation.ts')[singular.initializer.expression.getText(source)];
        identity = ({ params }) => callback(name, params);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return identity;
}
function mount(node, partial) {
  const router = node.route === '(tabs)'
    ? NativeBottomTabsRouter({ initialRouteName: node.initialRouteName })
    : StackRouter({ initialRouteName: node.initialRouteName });
  const options = { routeNames: node.children.map(child => child.route), routeParamList: {}, routeGetIdList: {} };
  if (node.children.some(child => child.route === '(recording)')) options.routeGetIdList['(recording)'] = screenIdentity('_layout.tsx', '(recording)');
  if (node.route === '(recording)') for (const child of node.children) {
    options.routeGetIdList[child.route] = screenIdentity('(recording)/_layout.tsx', child.route);
  }
  const result = partial ? router.getRehydratedState(partial, options) : router.getInitialState(options);
  mounted.set(result.key, { router, options, node });
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
    const { router, options, node } = mounted.get(current.key);
    const next = router.getStateForAction(current, action, options);
    assert.ok(next, `Unhandled ${action.type} on ${current.type}`);
    // A real nested navigator mounts from the screen/params payload the first
    // time a root presentation is opened; model that lifecycle, using Expo's
    // real StackRouter for its history as well.
    return { ...next, routes: next.routes.map(route => {
      const child = node.children.find(child => child.route === route.name);
      if (!child.children.length || route.state) return route;
      const params = route.params;
      return { ...route, state: mount(child, params?.screen ? {
        routes: [{ name: params.screen, params: params.params }], index: 0,
      } : undefined) };
    }) };
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

// Router history alone cannot catch a native modal remount. Evaluate the real
// navigator's initial options, before any screen can call navigation.setOptions.
// Only the native platform and theme hooks are substituted; React's elements
// and TabStack's screenOptions callback are real.
const { Module } = require('node:module');
const stackFilename = path.join(__dirname, '../src/components/TabStack.tsx');
const stackModule = new Module(stackFilename, module);
stackModule.filename = stackFilename;
stackModule.paths = module.paths;
let platform;
let background;
stackModule.require = (id) => {
  if (id === 'expo-router') return { Stack: 'Stack' };
  if (id === 'react-native') return { Platform: platform };
  if (id === '@/theme/ThemeProvider') return { useTheme: () => ({ colors: { bg: background } }) };
  if (id === '@/lib/tabRoutes') return require('../src/lib/tabRoutes.ts');
  return require(id);
};
// Keep the imported Platform object stable while exercising its different values.
platform = { OS: 'ios', Version: 26 };
stackModule._compile(ts.transpileModule(fs.readFileSync(stackFilename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, stackFilename);
for (const OS of ['ios', 'android']) {
  platform.OS = OS;
  for (const Version of [18, 26]) {
    platform.Version = Version;
    for (background of ['#ffffff', '#121212']) {
      for (const [group, root] of Object.entries(roots)) {
        const stack = stackModule.exports.TabStack({ root, title: group });
        const options = stack.props.screenOptions({ route: { name: 'plan-route' } });
        assert.equal(options.headerShown, false, 'Planner header must already be hidden before mounting');
        assert.equal(options.presentation, 'transparentModal', 'Planner must mount in its final presentation');
        assert.equal(options.animation, 'none', 'Only PlanSheet should animate');
        assert.equal(options.gestureEnabled, false, 'PlanSheet owns dismissal');
        assert.equal(options.contentStyle.backgroundColor, 'transparent', 'The originating screen stays visible');
        const detail = stack.props.screenOptions({ route: { name: 'river/[slug]' } });
        assert.equal(detail.headerShown, true, 'Ordinary details retain their Back header');
        assert.equal(detail.presentation, undefined, 'Ordinary details retain native pushes');
        assert.equal(detail.contentStyle.backgroundColor, background);
      }
    }
  }
}
const plannerScreen = fs.readFileSync(path.join(root, '(tabs)/(today,map,floats,favorites,alerts)/plan-route.tsx'), 'utf8');
assert.doesNotMatch(plannerScreen, /\b(?:headerShown|presentation)\s*:/, 'Planner must not change its native header or presentation after mounting');
console.log('Planner presentation is stable before mounting in every tab and theme.');

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
  const findRoute = push({ pathname: '/find-float', params: { river: 'current' } });
  assert.equal(findRoute.target, stackKey, 'Find a Route must stay in the river’s tab');
  assert.equal(activeTab(), owner, 'Finding a route must not switch away from the river’s tab');
  assert.equal(activeStack().routes.at(-1).name, 'find-float');
  assert.equal(activeStack().routes.at(-1).params.river, 'current');
  const finder = activeStack();
  push('/plan-route?openPlan=1&focusRiver=current&planPutIn=akers&planTakeOut=waymeyer');
  back();
  assert.deepEqual(activeStack(), finder, 'Closing a suggested plan must return to the same finder');
  back();
  assert.deepEqual(activeStack(), river, 'Back from Find a Route must restore the exact river page');
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
  ['/find-float?river=current', 'floats', 'find-float'],
  ['/float-history-recap?id=older', 'floats', 'float-history-recap'],
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
  launch(`/(tabs)/(${group})/${group === 'map' ? '' : roots[group]}`);
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

// Readiness belongs to its origin. Recording/options/recap have exactly one
// root presentation, with stable IDs even under repeated or cross-tab Resume.
const { completedFloatRoutes } = require('../src/lib/floatNavigation.ts');
const recording = () => appState().routes.find(route => route.name === '(recording)');
for (const group of Object.keys(roots)) {
  for (const saved of [false, true]) {
    launch(`/(tabs)/(${group})/${group === 'map' ? '' : roots[group]}`);
    if (saved) push('/float/TESTPLAN');
    const origin = activeStack().routes.at(-1);
    push(saved ? '/float-start?riverSlug=current&putInId=akers&takeOutId=waymeyer&shortCode=TESTPLAN' : '/float-start');
    const stack = activeStack();
    const routes = completedFloatRoutes(stack.routes, stack.routes.at(-1).key);
    state = apply({ type: 'RESET', target: stack.key, payload: { ...stack, routes, index: routes.length - 1 } });
    push('/float-mode');
    assert.equal(recording().state.routes.at(-1).name, 'float-mode');
    assert.deepEqual(activeStack().routes.at(-1), origin);
    const recordingKey = recording().key;
    const modeKey = recording().state.routes.at(-1).key;
    push('/float-mode'); push('/float-mode');
    assert.equal(recording().key, recordingKey);
    assert.equal(recording().state.routes.length, 1);
    assert.equal(recording().state.routes.at(-1).key, modeKey);
    push('/float-options'); back(recording().state.key);
    assert.equal(recording().state.routes.at(-1).name, 'float-mode');
    back(appState().key);
    assert.deepEqual(activeStack().routes.at(-1), origin, 'Closing lost its origin');
    const other = group === 'map' ? 'floats' : 'map';
    selectTab(other);
    const otherOrigin = activeStack().routes.at(-1);
    push('/float-mode');
    assert.equal(appState().routes.filter(route => route.name === '(recording)').length, 1);
    state = apply(getNavigateAction(resolveHref('/float-recap?id=finished'), {}, 'REPLACE'));
    assert.deepEqual(recording().state.routes.map(route => route.name), ['float-recap']);
    back(appState().key);
    assert.deepEqual(activeStack().routes.at(-1), otherOrigin, 'Recap close lost Resume origin');
  }
}
assert.deepEqual(completedFloatRoutes([{ name: 'float-home' }, { name: 'float-start' }, { name: 'float-start' }], 'missing'),
  [{ name: 'float-home' }], 'Older multi-page setup histories must still be discarded');
for (const href of ['/float-mode', '/float-recap?id=finished', '/float-options']) {
  launch(redirectSystemPath({ path: href, initial: true }));
  assert.equal(appState().routes.at(-1).name, '(recording)');
  assert.ok(appState().routes.some(route => route.name === '(tabs)'), 'Cold recording must have a tab anchor');
  assert.equal(recording().state.routes.at(-1).params.coldRecording, '1');
  back(appState().key);
  state = apply(getNavigateAction(resolveHref('/(tabs)/(floats)/float-home'), {}, 'NAVIGATE'));
  assert.equal(activeTab(), '(floats)', 'Cold close must have a useful Floats fallback');
}
console.log('One recording presentation, repeated/cross-tab Resume, options, recap, and originating Close verified.');

for (const group of Object.keys(roots)) {
  launch(`/(tabs)/(${group})/${group === 'map' ? '' : roots[group]}`);
  push('/floats?view=history');
  const history = activeStack();
  push('/float-history-recap?id=last-month');
  assert.equal(activeTab(), `(${group})`);
  assert.equal(activeStack().routes.at(-1).name, 'float-history-recap');
  assert.equal(activeStack().routes.at(-1).params.id, 'last-month');
  assert.equal(recording(), undefined, 'History must not mount a recording presentation');
  const recap = activeStack();
  push('/float-mode');
  assert.equal(appState().routes.filter(route => route.name === '(recording)').length, 1);
  back(appState().key);
  assert.deepEqual(activeStack(), recap, 'Closing a resumed recording preserves the historical recap');
  back();
  assert.deepEqual(activeStack(), history, 'Back from a historical recap restores the exact History list');
}
console.log('Historical recaps stay in each tab, preserve History on Back, and coexist with one recording presentation.');


// Floats planners live in their originating stack. The kept-alive Map route
// never receives their selected river/endpoints or their dismissal state.
const { floatPlanDestination } = require('../src/lib/planRequest.ts');
launch(redirectSystemPath({ path: '/', initial: true }));
const todayBeforePlan = activeStack();
const mapBeforeTodayPlan = tabsState().routes.find(route => route.name === '(map)').state;
const todayPlan = push(floatPlanDestination({ focusRiver: 'current' }));
assert.equal(todayPlan.target, todayBeforePlan.key, 'Today recommendations must open a planner inside Today');
assert.equal(activeTab(), '(today)');
assert.equal(activeStack().routes.at(-1).name, 'plan-route');
assert.equal(activeStack().routes.at(-1).params.focusRiver, 'current');
assert.equal(activeStack().routes.at(-1).params.planPutIn, undefined);
back();
assert.deepEqual(activeStack(), todayBeforePlan, 'Closing Today’s planner must restore Today');
assert.deepEqual(tabsState().routes.find(route => route.name === '(map)').state, mapBeforeTodayPlan, 'Today planning must preserve Map');
launch(redirectSystemPath({ path: '/', initial: true }));
selectTab('map');
const originalMap = activeStack();
selectTab('floats');
for (const origin of ['float-home', 'favorite-floats', 'floats', 'find-float']) {
  if (origin !== 'float-home') push(`/${origin}`);
  const originKey = activeStack().routes.at(-1).key;
  const route = floatPlanDestination({ focusRiver: 'current', planPutIn: 'a', planTakeOut: 'b', planVesselTypeId: 'kayak-id' });
  push(route);
  assert.equal(activeTab(), '(floats)');
  assert.equal(activeStack().routes.at(-1).name, 'plan-route');
  assert.equal(activeStack().routes.at(-1).params.planVesselTypeId, 'kayak-id');
  // Endpoint detail and Back must return to this same planner.
  const plannerKey = activeStack().routes.at(-1).key;
  push('/river/current/access/akers');
  back();
  assert.equal(activeStack().routes.at(-1).key, plannerKey);
  back();
  assert.equal(activeStack().routes.at(-1).key, originKey);
  push(floatPlanDestination());
  assert.equal(activeStack().routes.at(-1).params.planPutIn, undefined);
  assert.notEqual(activeStack().routes.at(-1).key, plannerKey);
  back();
  if (origin !== 'float-home') back();
}
selectTab('map');
assert.deepEqual(activeStack(), originalMap, 'Floats planning must not mutate Map history or parameters');
selectTab('floats');
push('/floats?view=history');
push('/float-backup');
back();
assert.equal(activeStack().routes.at(-1).params.view, 'history');
console.log('Fresh route planners, exact finder handoffs, originating Back, preserved Map state, and collection settings verified.');

for (const origin of Object.keys(roots)) {
  launch(`/(tabs)/(${origin})/${origin === 'map' ? '' : roots[origin]}`);
  push('/floats');
  const collectionKey = activeStack().routes.at(-1).key;
  for (const pathname of ['/float-start', '/float-mode']) {
    push(floatPlanDestination());
    if (pathname === '/float-mode') { back(); push(pathname); }
    else state = apply(getNavigateAction(resolveHref({ pathname, params: { riverSlug: 'current', putInId: 'a', takeOutId: 'b' } }), {}, 'REPLACE'));
    assert.equal(activeTab(), `(${origin})`);
    if (pathname === '/float-mode') {
      assert.equal(recording().state.routes.at(-1).name, 'float-mode');
      back(appState().key);
    } else { assert.equal(activeStack().routes.at(-1).name, 'float-start'); back(); }
    assert.equal(activeStack().routes.at(-1).key, collectionKey, 'A closed planner must not remain behind readiness or resume');
  }
}
console.log('Starting and resuming from standalone planners preserve all tab origins.');
