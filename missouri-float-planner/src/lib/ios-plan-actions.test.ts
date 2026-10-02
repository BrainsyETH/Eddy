import assert from 'node:assert/strict';
import test from 'node:test';
import type { FloatPlan } from '@eddy/types';
import { createPlanActions, planShareMessage } from '../../../eddy-ios/src/lib/planActions';

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
