import assert from 'node:assert/strict';
import { favoriteAlerts } from '../../../eddy-ios/src/lib/favoriteAlerts';
import test from 'node:test';
import { alertAnchor, alertDraftChanged, createAlertSaveTask, type AlertDraft } from '../../../eddy-ios/src/lib/alertCreation';
import { hourLabel, quietDraftChanged, quietWindowValid } from '../../../eddy-ios/src/lib/quietHours';
import { alertCheckedLabel, shouldRefreshAlerts, ALERT_STALE_MS } from '../../../eddy-ios/src/lib/alertFreshness';
import type { NotificationPreferences } from '@eddy/types';

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

// The management sheet keeps the stored switch state and wall-clock minutes.
const quiet: NotificationPreferences = {
  quietHoursEnabled: false, quietStartMinute: 22 * 60 + 7, quietEndMinute: 7 * 60,
  timezone: 'America/Denver', safetyOverridesQuiet: true,
};
test('opening quiet hours preserves off state, zone and off-grid saved minutes', () => {
  const draft = { ...quiet };
  assert.equal(quietDraftChanged(draft, quiet), false);
  assert.equal(draft.quietHoursEnabled, false);
  assert.equal(draft.quietStartMinute, 1327);
  assert.equal(quietWindowValid(draft), true);
  assert.match(hourLabel(1327), /07/);
  assert.notEqual(hourLabel(1327), hourLabel(1320));
});
test('equal times are invalid without mutating either bound, even when disabled', () => {
  const draft = { ...quiet, quietEndMinute: quiet.quietStartMinute };
  assert.equal(quietWindowValid(draft), false);
  assert.equal(draft.quietEndMinute, 1327);
  assert.equal(quietWindowValid({ ...quiet, quietStartMinute: null }), false);
  assert.equal(quietWindowValid({ ...quiet, quietStartMinute: 1440 }), false);
});
test('quiet edits include timezone and exception; reverting clears dirty state', () => {
  for (const patch of [{ quietHoursEnabled: true }, { quietStartMinute: 1320 }, { quietEndMinute: 480 }, { timezone: 'America/Chicago' }, { safetyOverridesQuiet: false }]) {
    assert.equal(quietDraftChanged({ ...quiet, ...patch }, quiet), true);
  }
  assert.equal(quietDraftChanged({ ...quiet }, quiet), false);
  assert.equal(quietDraftChanged(null, quiet), false);
});
test('public sources independently expire after 15 minutes, not every focus', () => {
  const now = 10_000_000;
  assert.equal(shouldRefreshAlerts(null, now), true);
  assert.equal(shouldRefreshAlerts(now - ALERT_STALE_MS + 1, now), false);
  assert.equal(shouldRefreshAlerts(now - ALERT_STALE_MS, now), true);
  assert.equal(shouldRefreshAlerts(now, now), false);
  assert.equal(alertCheckedLabel(null, now), null);
  assert.equal(alertCheckedLabel(now, now), 'Last checked just now');
  assert.equal(alertCheckedLabel(now - 7_200_000, now), 'Last checked 2h ago');
});


test('Favorites respects station identity, paused parents and spent one-time alerts', () => {
  const parent = { id: 'parent', source: 'river_condition', scope: 'river', riverId: 'river', enabled: false, parentId: null } as import('@eddy/types').AlertRule;
  const child = { id: 'child', source: 'gauge', scope: 'gauge', riverId: 'river', gaugeId: 'station', usgsSiteId: '07012345', enabled: true, parentId: 'parent', oneShot: false } as import('@eddy/types').AlertRule;
  assert.equal(favoriteAlerts([parent, child], 'gauge', 'station').active, false);
  assert.equal(favoriteAlerts([{ ...parent, enabled: true }, child], 'gauge', 'station').active, true);
  assert.equal(favoriteAlerts([child], 'gauge', 'other-station').matches.length, 0);
  assert.equal(favoriteAlerts([parent, child], 'dam', 'dam-slug', '07012345').matches.length, 1);
  assert.equal(favoriteAlerts([parent, child], 'river', 'river').matches.length, 2);
  assert.equal(favoriteAlerts([{ ...child, parentId: null, oneShot: true, firedAt: '2026-10-01' }], 'gauge', 'station').active, false);
});
