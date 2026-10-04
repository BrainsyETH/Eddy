import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { FloatPlan } from '@eddy/types';
import { createPlanActions, planShareMessage } from '../../../eddy-ios/src/lib/planActions';
import { createSavedFloatLoader, type SavedFloatLoadState } from '../../../eddy-ios/src/lib/savedFloatLoader';

const link = { shortCode: 'float1', url: 'https://eddy.guide/float/float1' };
const plan = {
  river: { name: 'Current River', slug: 'current', id: 'current' },
  putIn: { id: 'akers', name: 'Akers' },
  takeOut: { id: 'pulltite', name: 'Pulltite' },
  distance: { formatted: '9.5 mi' },
  floatTime: { formatted: '3–5 hours' },
} as FloatPlan;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function saver(savePlan: () => Promise<typeof link>) {
  const remembered: FloatPlan[] = [];
  return {
    remembered,
    savePlan,
    isSaved: (value: FloatPlan) => remembered.includes(value),
    forgetPlan: (value: FloatPlan) => { remembered.splice(remembered.indexOf(value), 1); },
    remember: (value: FloatPlan) => { remembered.push(value); },
  };
}

test('rapid Save taps produce one request and remember only after success', async () => {
  const actions = createPlanActions();
  const pending = deferred<typeof link>();
  let calls = 0;
  const save = saver(() => { calls++; return pending.promise; });
  const first = actions.toggleSave(plan, save);
  assert.equal(await actions.toggleSave(plan, save), undefined, 'a repeated tap has no completion feedback');
  assert.equal(calls, 1);
  assert.equal(actions.stateFor(plan).saving, true);
  assert.deepEqual(save.remembered, []);
  pending.resolve(link);
  assert.equal(await first, 'saved');
  assert.equal(actions.stateFor(plan).saving, false);
  assert.deepEqual(save.remembered, [plan]);
  assert.equal(await actions.toggleSave(plan, save), 'removed');
  assert.equal(calls, 1, 'removing a saved float must not POST again');
  assert.deepEqual(save.remembered, []);
});

test('failed Save remains unsaved and can be retried', async () => {
  const actions = createPlanActions();
  let calls = 0;
  const save = saver(async () => { if (++calls === 1) throw new Error('offline'); return link; });
  assert.equal(await actions.toggleSave(plan, save), undefined, 'failed saves never produce success feedback');
  assert.equal(actions.stateFor(plan).saving, false);
  assert.match(actions.stateFor(plan).saveError!, /Could not save/);
  assert.deepEqual(save.remembered, []);
  await actions.toggleSave(plan, save);
  assert.equal(actions.stateFor(plan).saveError, null);
  assert.deepEqual(save.remembered, [plan]);
});

test('a previous plan completion cannot change the new plan busy or error state', async () => {
  const actions = createPlanActions();
  const next = { ...plan, takeOut: { ...plan.takeOut, id: 'round-spring', name: 'Round Spring' } };
  const first = deferred<typeof link>();
  const second = deferred<typeof link>();
  const saves = saver(() => first.promise);
  const a = actions.toggleSave(plan, saves);
  const b = actions.toggleSave(next, { ...saves, savePlan: () => second.promise });
  first.reject(new Error('offline'));
  await a;
  assert.match(actions.stateFor(plan).saveError!, /Could not save/);
  assert.deepEqual(actions.stateFor(next), { saving: true, saveError: null, shareError: null });
  second.resolve(link);
  await b;
  assert.deepEqual(saves.remembered, [next]);
});

test('Share does not save to favorites or block an independent Save', async () => {
  const actions = createPlanActions();
  const dialog = deferred<void>();
  const messages: string[] = [];
  const share = actions.share(plan, {
    savePlan: async () => link,
    present: (message) => { messages.push(message); return dialog.promise; },
  });
  const saves = saver(async () => link);
  await actions.toggleSave(plan, saves);
  assert.equal(actions.isSharing(), true);
  assert.equal(messages.length, 1);
  assert.ok(messages[0].endsWith(link.url));
  assert.deepEqual(saves.remembered, [plan], 'only the explicit Save keeps a float');
  dialog.resolve();
  await share;
  assert.equal(actions.isSharing(), false);
});

test('duplicate Share taps cannot launch two native dialogs, including while one is open', async () => {
  const actions = createPlanActions();
  const dialog = deferred<void>();
  let links = 0;
  let dialogs = 0;
  const sharing = {
    savePlan: async () => { links++; return link; },
    present: async () => { dialogs++; await dialog.promise; },
  };
  const first = actions.share(plan, sharing);
  await actions.share(plan, sharing);
  assert.equal(links, 1);
  assert.equal(dialogs, 1);
  await actions.share(plan, sharing);
  assert.equal(dialogs, 1);
  dialog.resolve();
  await first;
  assert.equal(actions.stateFor(plan).shareError, null);
  await actions.share(plan, sharing);
  assert.equal(dialogs, 2, 'a dismissed dialog must allow another explicit Share');
});

test('a link failure shares plain details once without a false save or error state', async () => {
  const actions = createPlanActions();
  const messages: string[] = [];
  await actions.share(plan, {
    savePlan: async () => { throw new Error('offline'); },
    present: async (message) => { messages.push(message); },
  });
  assert.deepEqual(messages, [planShareMessage(plan)]);
  assert.equal(actions.stateFor(plan).shareError, null);
  assert.equal(actions.isSharing(), false);
});

test('native share failure is handled once and releases the guard for retry', async () => {
  const actions = createPlanActions();
  let dialogs = 0;
  await actions.share(plan, {
    savePlan: async () => link,
    present: async () => { dialogs++; throw new Error('cannot present'); },
  });
  assert.equal(dialogs, 1, 'presentation failure must not trigger a fallback dialog');
  assert.match(actions.stateFor(plan).shareError!, /Could not open sharing/);
  assert.equal(actions.isSharing(), false);
  await actions.share(plan, { savePlan: async () => link, present: async () => { dialogs++; } });
  assert.equal(dialogs, 2);
  assert.equal(actions.stateFor(plan).shareError, null);
});

test('closing or editing cancels late share presentation on link success and failure', async () => {
  for (const fails of [false, true]) {
    const actions = createPlanActions();
    const pending = deferred<typeof link>();
    let dialogs = 0;
    const share = actions.share(plan, {
      savePlan: () => pending.promise,
      present: async () => { dialogs++; },
    });
    actions.cancelShare();
    if (fails) pending.reject(new Error('offline')); else pending.resolve(link);
    await share;
    assert.equal(dialogs, 0);
    assert.equal(actions.isSharing(), false);
  }
});

test('a canceled request cannot release a newer share request when it completes', async () => {
  const actions = createPlanActions();
  const old = deferred<typeof link>();
  const next = deferred<typeof link>();
  const messages: string[] = [];
  const present = async (message: string) => { messages.push(message); };
  const a = actions.share(plan, { savePlan: () => old.promise, present });
  actions.cancelShare();
  const b = actions.share(plan, { savePlan: () => next.promise, present });
  old.resolve(link);
  await a;
  assert.equal(actions.isSharing(), true);
  assert.deepEqual(messages, []);
  next.resolve(link);
  await b;
  assert.equal(messages.length, 1);
  assert.equal(actions.isSharing(), false);
});

test('canceling Share does not cancel an explicit Save of the original plan', async () => {
  const actions = createPlanActions();
  const pending = deferred<typeof link>();
  const saves = saver(() => pending.promise);
  const save = actions.toggleSave(plan, saves);
  actions.cancelShare();
  pending.resolve(link);
  await save;
  assert.deepEqual(saves.remembered, [plan]);
});

test('shared details retain regulated-water and withheld-time wording', () => {
  assert.match(planShareMessage({ ...plan, floatTime: null, floatTimeWithheldReason: 'regulated' }), /time depends on dam releases/);
  assert.match(planShareMessage({ ...plan, floatTime: null, floatTimeWithheldReason: undefined }), /no estimate in this water/);
  assert.match(planShareMessage(plan), /Akers → Pulltite.*9.5 mi.*3–5 hours/);
});

function savedLoader(fetchPlan: (code: string, signal: AbortSignal) => Promise<FloatPlan>, isOffline = async () => false) {
  const states: SavedFloatLoadState<FloatPlan>[] = [];
  const saved: { code: string; plan: FloatPlan }[] = [];
  const loader = createSavedFloatLoader({
    fetchPlan, isOffline,
    publish: state => states.push(state),
    onSuccess: (code, plan) => saved.push({ code, plan }),
    errorMessage: error => (error as Error).message,
  });
  return { ...loader, states, saved, latest: () => states.at(-1)! };
}

test('a fast saved float open never publishes fallback details', async () => {
  const loader = savedLoader(async () => plan);
  await loader.load('float1');
  assert.equal(loader.latest().plan, plan);
  assert.equal(loader.latest().loading, false);
  assert.ok(loader.latest().checkedAt);
  assert.ok(loader.states.every(state => !state.showSaved));
  assert.deepEqual(loader.saved, [{ code: 'float1', plan }]);
  loader.dispose();
});

test('a slow saved float reveals logistics after the grace period while continuing the request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred<FloatPlan>();
  const loader = savedLoader(() => pending.promise);
  const loading = loader.load('float1');
  t.mock.timers.tick(1199);
  assert.equal(loader.latest().showSaved, false);
  t.mock.timers.tick(1);
  assert.equal(loader.latest().showSaved, true);
  assert.equal(loader.latest().loading, true);
  pending.resolve(plan);
  await loading;
  assert.equal(loader.latest().plan, plan);
  assert.equal(loader.latest().showSaved, false);
  assert.equal(loader.latest().loading, false);
  loader.dispose();
});

test('an offline hint exposes saved details immediately without cancelling a successful request', async () => {
  const pending = deferred<FloatPlan>();
  let signal!: AbortSignal;
  const loader = savedLoader((_code, requestSignal) => { signal = requestSignal; return pending.promise; }, async () => true);
  const loading = loader.load('float1');
  await Promise.resolve();
  assert.equal(loader.latest().showSaved, true);
  assert.equal(loader.latest().loading, true);
  assert.equal(loader.latest().error, null, 'reachability alone must not claim the request failed');
  assert.equal(signal.aborted, false);
  pending.resolve(plan);
  await loading;
  assert.equal(loader.latest().plan, plan);
  assert.equal(loader.latest().loading, false);
  assert.equal(loader.latest().showSaved, false);
  assert.deepEqual(loader.saved, [{ code: 'float1', plan }]);
  loader.dispose();
});

test('a truly offline request keeps logistics visible and permits retry after the transport fails', async () => {
  const pending = deferred<FloatPlan>();
  let calls = 0;
  const loader = savedLoader(() => ++calls === 1 ? pending.promise : Promise.resolve(plan), async () => true);
  const loading = loader.load('float1');
  await Promise.resolve();
  assert.equal(loader.latest().showSaved, true);
  assert.equal(loader.latest().loading, true);
  pending.reject(new Error('No connection'));
  await loading;
  assert.equal(loader.latest().showSaved, true);
  assert.equal(loader.latest().loading, false);
  assert.equal(loader.latest().error, 'No connection');
  assert.deepEqual(loader.saved, []);
  await loader.load('float1');
  assert.equal(loader.latest().plan, plan);
  assert.equal(loader.latest().error, null);
  assert.equal(loader.latest().showSaved, false);
  loader.dispose();
});

test('a transient offline hint during foreground refresh preserves the plan and accepts recovery', async () => {
  const pending = deferred<FloatPlan>();
  let calls = 0;
  let signal!: AbortSignal;
  const loader = savedLoader((_code, requestSignal) => {
    signal = requestSignal;
    return ++calls === 1 ? Promise.resolve(plan) : pending.promise;
  }, async () => true);
  await loader.load('float1');
  const checkedAt = loader.latest().checkedAt;
  const refreshing = loader.load('float1');
  await Promise.resolve();
  assert.equal(loader.latest().plan, plan);
  assert.equal(loader.latest().checkedAt, checkedAt);
  assert.equal(loader.latest().loading, true);
  assert.equal(loader.latest().error, null);
  assert.equal(signal.aborted, false);
  const updated = { ...plan, distance: { ...plan.distance, formatted: '9.6 mi' } };
  pending.resolve(updated);
  await refreshing;
  assert.equal(loader.latest().plan, updated);
  assert.equal(loader.latest().loading, false);
  assert.equal(loader.latest().error, null);
  loader.dispose();
});

test('foreground refresh keeps the loaded plan and its checked time through failure and retry', async () => {
  const refresh = deferred<FloatPlan>();
  const updated = { ...plan, distance: { ...plan.distance, formatted: '9.6 mi' } };
  let calls = 0;
  const loader = savedLoader(() => ++calls === 1 ? Promise.resolve(plan) : calls === 2 ? refresh.promise : Promise.resolve(updated));
  await loader.load('float1');
  const checkedAt = loader.latest().checkedAt;
  const refreshing = loader.load('float1');
  assert.equal(loader.latest().plan, plan);
  assert.equal(loader.latest().loading, true);
  assert.equal(loader.latest().checkedAt, checkedAt);
  refresh.reject(new Error('No connection'));
  await refreshing;
  assert.equal(loader.latest().plan, plan);
  assert.equal(loader.latest().loading, false);
  assert.equal(loader.latest().error, 'No connection');
  assert.equal(loader.latest().checkedAt, checkedAt);
  await loader.load('float1');
  assert.equal(loader.latest().plan, updated);
  assert.equal(loader.latest().error, null);
  loader.dispose();
});

test('an offline answer that arrives after success cannot replace the current plan', async () => {
  const offline = deferred<boolean>();
  const loader = savedLoader(async () => plan, () => offline.promise);
  await loader.load('float1');
  const before = loader.latest();
  offline.resolve(true);
  await Promise.resolve();
  assert.equal(loader.latest(), before);
  assert.equal(loader.latest().error, null);
  loader.dispose();
});

test('switching saved floats cancels old requests and ignores their connectivity checks', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = deferred<FloatPlan>(), second = deferred<FloatPlan>(), offline = deferred<boolean>();
  const signals: AbortSignal[] = [];
  const loader = savedLoader((code, signal) => {
    signals.push(signal);
    return code === 'float1' ? first.promise : second.promise;
  }, () => signals.length === 0 ? offline.promise : Promise.resolve(false));
  const a = loader.load('float1');
  t.mock.timers.tick(1000);
  const b = loader.load('float2');
  assert.equal(signals[0].aborted, true);
  t.mock.timers.tick(200);
  assert.equal(loader.latest().showSaved, false, 'the first float’s timer must not expose the next fallback early');
  offline.resolve(true);
  first.resolve(plan);
  await a;
  assert.equal(loader.latest().shortCode, 'float2');
  assert.equal(loader.latest().plan, null);
  assert.equal(loader.latest().loading, true);
  const next = { ...plan, putIn: { ...plan.putIn, id: 'next' } };
  second.resolve(next);
  await b;
  assert.equal(loader.latest().plan, next);
  assert.deepEqual(loader.saved, [{ code: 'float2', plan: next }]);
  loader.dispose();
});

test('navigation to another saved float clears the previous float’s plan', async () => {
  const pending = deferred<FloatPlan>();
  const loader = savedLoader(code => code === 'float1' ? Promise.resolve(plan) : pending.promise);
  await loader.load('float1');
  const loading = loader.load('float2');
  assert.equal(loader.latest().plan, null);
  assert.equal(loader.latest().checkedAt, null);
  assert.equal(loader.latest().shortCode, 'float2');
  pending.reject(new Error('Missing float'));
  await loading;
  assert.equal(loader.latest().plan, null);
  loader.dispose();
});

test('unknown connectivity falls back to the grace period and a failed request stays retryable', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred<FloatPlan>();
  const loader = savedLoader(() => pending.promise, async () => { throw new Error('Unknown network'); });
  const loading = loader.load('float1');
  await Promise.resolve();
  t.mock.timers.tick(1200);
  assert.equal(loader.latest().showSaved, true);
  assert.equal(loader.latest().loading, true);
  pending.reject(new Error('Timed out'));
  await loading;
  assert.equal(loader.latest().loading, false);
  assert.equal(loader.latest().error, 'Timed out');
  loader.dispose();
});

test('disposing a saved float cancels its timer and prevents late publications', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred<FloatPlan>(), offline = deferred<boolean>();
  let signal!: AbortSignal;
  const loader = savedLoader((_code, requestSignal) => { signal = requestSignal; return pending.promise; }, () => offline.promise);
  const loading = loader.load('float1');
  const publications = loader.states.length;
  loader.dispose();
  assert.equal(signal.aborted, true);
  t.mock.timers.tick(2000);
  offline.resolve(true);
  pending.reject(new Error('Aborted'));
  await loading;
  assert.equal(loader.states.length, publications);
  assert.deepEqual(loader.saved, []);
});

// Execute the shipped adapter's module initialization with the native capability
// present or absent. Only Expo itself may load: a runtime expo-network import
// would throw in an older client before any request or fallback could start.
function networkHintFor(native: unknown): () => Promise<boolean> {
  const source = readFileSync(new URL('../../../eddy-ios/src/lib/networkHint.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports: { networkHintsOffline?: () => Promise<boolean> } = {};
  runInNewContext(compiled.outputText, {
    exports,
    require: (name: string) => {
      assert.equal(name, 'expo', 'the adapter must not eagerly import expo-network');
      return { requireOptionalNativeModule: (moduleName: string) => {
        assert.equal(moduleName, 'ExpoNetwork');
        return native;
      } };
    },
  });
  assert.ok(exports.networkHintsOffline);
  return exports.networkHintsOffline;
}

test('an older binary without ExpoNetwork loads the adapter and retains the timed logistics fallback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const isOffline = networkHintFor(null);
  assert.equal(await isOffline(), false, 'missing support is unknown connectivity');
  const pending = deferred<FloatPlan>();
  const loader = savedLoader(() => pending.promise, isOffline);
  const loading = loader.load('float1');
  await Promise.resolve();
  assert.equal(loader.latest().showSaved, false);
  t.mock.timers.tick(1200);
  assert.equal(loader.latest().showSaved, true);
  assert.equal(loader.latest().loading, true);
  assert.equal(loader.latest().error, null);
  pending.resolve(plan);
  await loading;
  assert.equal(loader.latest().plan, plan);
  loader.dispose();
});

test('the optional native network adapter recognizes only explicit offline readings', async () => {
  for (const [state, expected] of [
    [{ isConnected: false }, true],
    [{ isInternetReachable: false }, true],
    [{ isConnected: true, isInternetReachable: true }, false],
    [{}, false],
  ] as const) {
    const native = { getNetworkStateAsync: async () => state };
    assert.equal(await networkHintFor(native)(), expected);
  }
});

test('missing network methods and failed native queries are unknown connectivity', async () => {
  assert.equal(await networkHintFor({})(), false);
  assert.equal(await networkHintFor({ getNetworkStateAsync: async () => { throw new Error('Network query failed'); } })(), false);
  assert.equal(await networkHintFor({ getNetworkStateAsync: () => { throw new Error('Native method unavailable'); } })(), false);
});
