import { compactShareDuration, floatShareLayout } from '../../shared/float-share-layout';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { CleanupError, completeCleanup } from '../../../eddy-ios/src/lib/completeCleanup';
import { tripOptionsSummary } from '../../../eddy-ios/src/lib/tripOptionsSummary';

const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const read = (path: string) => readFileSync(`../eddy-ios/${path}`, 'utf8');

test('account deletion attempts history, reports and maps after a preferences or image cleanup failure', async () => {
  // Execute the actual cleanup functions, replacing their storage/native boundaries.
  const sessionFile = ts.createSourceFile('store.ts', read('src/lib/floatSessionStore.ts'), ts.ScriptTarget.Latest, true);
  const discard = sessionFile.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'discardFloat');
  assert.ok(discard);
  const providerFile = ts.createSourceFile('provider.tsx', read('src/hooks/useFloatArchive.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let clearBody = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(providerFile) === 'clear' && node.initializer && ts.isCallExpression(node.initializer)) {
      const fn = node.initializer.arguments[0];
      if (ts.isArrowFunction(fn)) clearBody = fn.body.getText(providerFile);
    }
    ts.forEachChild(node, visit);
  };
  visit(providerFile);
  assert.ok(clearBody);
  for (const failure of ['preferences', 'images', null]) {
    const calls: string[] = [];
    const step = (name: string) => async () => {
      calls.push(name);
      if (failure === name) throw new Error(name);
      await Promise.resolve();
    };
    const exports: { clear?: () => Promise<void> } = {};
    runInNewContext(compile(`${discard.getText(sessionFile)}\nexports.clear = async () => ${clearBody};`), {
      exports, completeCleanup, scope: 'account', snapshot: { scopeToken: 'guest' },
      stopRecordingNow: step('stop'), deleteAllFloatTracks: step('tracks'),
      store: { discard: step('session') }, pickupContact: { clear: step('pickup') },
      savedReminderPreferences: { clear: step('preferences') },
      syncFloatActivity: step('activity'), dismissFloatNotifications: step('notifications'),
      floatArchive: { clear: step('history') }, clearHazardReports: step('reports'), removeAllTripDownloads: step('maps'),
      require: (name: string) => {
        assert.equal(name, './shareImageCache');
        return { clearFloatShareImages: () => { calls.push('images'); if (failure === 'images') throw new Error('images'); } };
      },
    });
    if (failure) await assert.rejects(exports.clear!(), CleanupError, 'Profile must still offer Retry cleanup');
    else await exports.clear!();
    assert.deepEqual(calls, ['stop', 'tracks', 'session', 'pickup', 'preferences', 'activity', 'notifications', 'images', 'history', 'reports', 'maps']);
  }
});

test('trip summary reflects the selected stretch without erasing the hazard preference', () => {
  const value = { takeOut: true, hazards: true, stops: [] };
  assert.equal(tripOptionsSummary(value, 0), 'Take-out reminder');
  assert.equal(tripOptionsSummary({ ...value, takeOut: false }, 0), 'No reminders for this stretch');
  assert.equal(tripOptionsSummary(value, 2), 'Take-out and hazard reminders');
  assert.equal(tripOptionsSummary(value, null), 'Take-out and hazard reminders');
  assert.equal(tripOptionsSummary({ ...value, takeOut: false, hazards: false }, 2), 'Reminders off');
  assert.equal(value.hazards, true);
});

type Node = { type: string | ((props: Record<string, unknown>) => unknown); props: Record<string, unknown> };
const jsx = (type: Node['type'], props: Node['props']): Node => ({ type, props });
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('type' in value)) return [];
  const node = value as Node;
  if (typeof node.type === 'function') return nodes(node.type(node.props));
  return [node, ...nodes(node.props.children)];
}
const theme = { useTheme: () => ({ colors: {}, elevation: () => ({}) }) };
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: (styles: unknown) => styles } };

test('member Read distinguishes access failures and unverified schedules', async () => {
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, react: {}, 'react-native': native,
    '@/hooks/useDamRefresh': {}, '@/hooks/useObservationClock': {}, '@/lib/damReadFreshness': {},
    '@eddy/conditions/dam-schedule-copy': {}, '@/api/client': {}, '@/hooks/useSession': {},
    '@/theme/layout': { radii: {} }, '@/theme/ThemeProvider': theme, '@/theme/typography': { fonts: {}, type: {} },
    '@/components/ReadHeading': { ReadHeading: 'ReadHeading' },
    '@/components/AppleSignInButton': { AppleSignInButton: 'AppleSignInButton' },
    '@/components/PremiumLock': { BlurredProse: 'BlurredProse', PremiumLockRow: 'PremiumLockRow', ReadSkeleton: 'ReadSkeleton' },
  };
  const exports: { MemberRead?: (props: Record<string, unknown>) => unknown } = {};
  runInNewContext(compile(read('src/components/dam/DamEddyRead.tsx') + '\nexports.MemberRead = MemberRead;'), {
    exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  for (const state of ['premium', 'sign-in', 'failed']) {
    const calls: string[] = [];
    const tree = nodes(exports.MemberRead!({ current: { key: 'user:dam', state }, loadingLabel: 'Loading',
      onUnlock: () => { calls.push('unlock'); }, onRetry: () => { calls.push('retry'); },
      onRefreshAccount: async () => { calls.push('refresh'); },
    }));
    const lock = tree.find(node => node.type === 'PremiumLockRow');
    const signIn = tree.find(node => node.type === 'AppleSignInButton');
    if (state === 'premium') {
      assert.ok(lock); assert.equal(signIn, undefined);
      (lock.props.onPress as () => void)();
      assert.deepEqual(calls, ['refresh', 'unlock']);
    } else if (state === 'sign-in') {
      assert.ok(signIn); assert.equal(lock, undefined);
      (signIn.props.onSignedIn as () => void)();
      await Promise.resolve();
      assert.deepEqual(calls, ['refresh', 'retry']);
    } else {
      assert.equal(lock, undefined); assert.equal(signIn, undefined);
      (tree.find(node => node.type === 'Pressable')!.props.onPress as () => void)();
      assert.deepEqual(calls, ['retry']);
    }
  }
  // Both the standalone card and river-tab Read use this renderer.
  for (const mayBeOutdated of [false, true]) {
    const tree = nodes(exports.MemberRead!({ current: { key: 'user:dam', state: 'ready', read: {
      takeaway: { headline: 'No more generation scheduled today', summary: 'Today’s posted windows have ended.' },
      mayBeOutdated,
    } } }));
    assert.equal(tree.some(node => node.type === 'Text' && node.props.children === 'Schedule couldn’t be verified'), mayBeOutdated);
    assert.ok(tree.some(node => node.props.children === 'Today’s posted windows have ended.'), 'fallback keeps the advanced Read visible');
  }
});

test('the standalone dam Read waits until the river outlook has settled', () => {
  const source = read('app/(tabs)/(today,map,floats,favorites,alerts)/river/[slug].tsx');
  assert.match(source, /\) : damTab && !outlookPending \? \(\s*<DamEddyRead/);
  assert.match(source, /outlookFor\?\.key !== activeOutlookKey/, 'a station switch is pending before its effect runs');
});

// Hook harness: effects and native callbacks are driven explicitly. This tests
// the art timeout and export lifecycle, not iOS bitmap drawing or custom fonts.
function localImageHarness() {
  let cursor = 0, nextTimer = 1;
  const values: unknown[] = [];
  const effects = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  let pending: (() => void)[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  const frames = new Map<number, () => void>();
  const completed: string[] = [], failed: Error[] = [];
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    react: {
      useRef: (current: unknown) => { const index = cursor++; return values[index] ??= { current }; },
      useState: (initial: unknown) => {
        const index = cursor++; if (!(index in values)) values[index] = initial;
        return [values[index], (value: unknown) => { values[index] = typeof value === 'function' ? value(values[index]) : value; }];
      },
      useEffect: (fn: () => (() => void) | undefined, deps: unknown[]) => {
        const index = cursor++, previous = effects.get(index);
        if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
        pending.push(() => { previous?.cleanup?.(); effects.set(index, { deps, cleanup: fn() }); });
      },
    },
    'react-native-svg': { __esModule: true, default: 'Svg', Image: 'Image', Path: 'Path', Line: 'Line', Rect: 'Rect', Text: 'SvgText' },
    '@/lib/localFloatShare': { localFloatShare: () => ({ river: 'Current River', from: 'Akers', to: 'Pulltite', date: '2026-11-04', duration: '1 hr' }), shareTextLines: (s: string) => [s] },
    '@eddy/conditions/float-share-layout': { compactShareDuration, floatShareLayout }, '@/theme/typography': { fonts: {} }, '../../assets/otter/standard.png': 1,
  };
  const exports: { LocalFloatShareImage?: (props: unknown) => unknown } = {};
  runInNewContext(compile(read('src/float/LocalFloatShareImage.tsx') + '\nexports.LocalFloatShareImage = LocalFloatShareImage;'), {
    exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
    setTimeout: (fn: () => void, ms: number) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
    requestAnimationFrame: (fn: () => void) => { const id = nextTimer++; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const props = { trip: {}, ready: (data: string) => completed.push(data), failed: (error: Error) => failed.push(error) };
  const render = () => {
    cursor = 0;
    const tree = nodes(exports.LocalFloatShareImage!(props));
    const svg = tree.find(node => node.type === 'Svg')!;
    (svg.props.ref as { current: unknown }).current = { toDataURL: (done: (data: string) => void) => done('png') };
    const run = pending; pending = []; run.forEach(effect => effect());
    return tree;
  };
  return { render, completed, failed, timers,
    draw: () => { const run = [...frames.values()]; frames.clear(); run.forEach(fn => fn()); },
    unmount: () => { for (const effect of effects.values()) effect.cleanup?.(); },
  };
}

test('an otter that never loads is removed before the local image exports', () => {
  const app = localImageHarness();
  const initial = app.render();
  const lateLoad = initial.find(node => node.type === 'Image')!.props.onLoad as () => void;
  (initial.find(node => node.type === 'Svg')!.props.onLayout as () => void)();
  app.render(); app.draw(); assert.equal(app.completed.length, 0);
  [...app.timers.values()].find(timer => timer.ms === 1500)!.fn();
  const fallback = app.render();
  assert.equal(fallback.some(node => node.type === 'Image'), false);
  assert.ok(fallback.some(node => node.type === 'SvgText' && node.props.children === 'Eddy'));
  app.draw(); assert.deepEqual(app.completed, ['png']); assert.equal(app.failed.length, 0);
  lateLoad(); app.render(); app.draw(); assert.equal(app.completed.length, 1);
  app.unmount(); assert.equal(app.timers.size, 0);
});

test('an otter that loads normally is retained in the local share', () => {
  const app = localImageHarness();
  const initial = app.render();
  (initial.find(node => node.type === 'Svg')!.props.onLayout as () => void)();
  (initial.find(node => node.type === 'Image')!.props.onLoad as () => void)();
  assert.ok(app.render().some(node => node.type === 'Image'));
  app.draw(); assert.deepEqual(app.completed, ['png']); assert.equal(app.failed.length, 0);
  app.unmount(); assert.equal(app.timers.size, 0);
});
