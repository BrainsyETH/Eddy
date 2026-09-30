import assert from 'node:assert/strict';
import test from 'node:test';
import { alertAnchor, alertDraftChanged, createAlertSaveTask, type AlertDraft } from '../../../eddy-ios/src/lib/alertCreation';

const initial: AlertDraft = {
  mode: 'threshold', conditionKind: 'safety', metric: 'gauge_height_ft',
  comparator: 'above', value: '3.40', valueMax: '', oneShot: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('untouched defaults and reverted edits do not require discard confirmation', () => {
  assert.equal(alertDraftChanged({ ...initial }, initial), false);
  assert.equal(alertDraftChanged({ ...initial, value: '4.20' }, initial), true);
  assert.equal(alertDraftChanged({ ...initial, value: '3.40' }, initial), false);
});

test('unit, trigger, range, mode and repeat changes are protected', () => {
  for (const change of [
    { metric: 'discharge_cfs' as const }, { comparator: 'below' as const },
    { comparator: 'between' as const, valueMax: '5' },
    { mode: 'condition' as const }, { oneShot: true },
  ]) assert.equal(alertDraftChanged({ ...initial, ...change }, initial), true);
});

test('hidden controls do not create phantom unsaved changes', () => {
  const condition: AlertDraft = { ...initial, mode: 'condition' };
  assert.equal(alertDraftChanged({ ...condition, metric: 'discharge_cfs', value: '700', valueMax: '900' }, condition), false);
  assert.equal(alertDraftChanged({ ...condition, conditionKind: 'all' }, condition), true);
  assert.equal(alertDraftChanged({ ...initial, valueMax: '5' }, initial), false);
});

test('unit switches use the new reading, never convert existing digits', () => {
  assert.equal(alertAnchor(3.4, 'gauge_height_ft'), '3.40');
  assert.equal(alertAnchor(1024.7, 'discharge_cfs'), '1025');
  assert.equal(alertAnchor(null, 'discharge_cfs'), '');
});

test('rapid saves produce one write even before React can render busy', async () => {
  const task = createAlertSaveTask();
  const pending = deferred<void>();
  let writes = 0;
  const write = async (commit: () => void) => { writes++; await pending.promise; commit(); return 'saved'; };
  const first = task.run(write);
  assert.equal(task.busy, true);
  assert.equal(await task.run(write), null);
  assert.equal(writes, 1);
  pending.resolve();
  assert.equal(await first, 'saved');
  assert.equal(task.saved, true);
  assert.equal(task.busy, false);
  assert.equal(await task.run(write), null);
  assert.equal(writes, 1);
});

test('a rejected write leaves the draft retryable', async () => {
  const task = createAlertSaveTask();
  const draft = { ...initial, value: '4.20', oneShot: true };
  const pending = deferred<void>();
  const attempt = task.run(async () => { await pending.promise; });
  pending.reject(new Error('offline'));
  await assert.rejects(attempt, /offline/);
  assert.equal(task.busy, false);
  assert.equal(task.saved, false);
  assert.equal(draft.value, '4.20');
  assert.equal(await task.run(async (commit) => { commit(); return draft; }), draft);
});

test('sign-in cancellation does not commit; a later signed-in save can run', async () => {
  const task = createAlertSaveTask();
  assert.deepEqual(await task.run(async () => ({ wrote: false, primed: false })), { wrote: false, primed: false });
  assert.equal(task.saved, false);
  assert.equal(task.busy, false);
  assert.deepEqual(await task.run(async (commit) => {
    commit();
    return { wrote: true, primed: true };
  }), { wrote: true, primed: true });
});

test('post-write failure cannot unlock a second create request', async () => {
  const task = createAlertSaveTask();
  await assert.rejects(task.run(async (commit) => { commit(); throw new Error('refresh failed'); }), /refresh failed/);
  assert.equal(task.saved, true);
  assert.equal(task.busy, false);
  let repeated = false;
  assert.equal(await task.run(async () => { repeated = true; }), null);
  assert.equal(repeated, false);
});
