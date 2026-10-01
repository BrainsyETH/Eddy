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
const roots = { today: 'reports', map: 'index', alerts: 'alerts', favorites: 'favorites', settings: 'profile' };
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
