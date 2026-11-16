import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { CompletedFloat } from '@shared/float-archive';
import { damReadFailure, damReadStillCurrent, damRefreshSlot } from '../../../eddy-ios/src/lib/damReadFreshness';
import { startEstimateMessage } from '../../../eddy-ios/src/lib/startEstimateStatus';
import { createReminderPreferences, reminderPreferences, REMINDER_PREFERENCES_KEY } from '../../../eddy-ios/src/lib/reminderPreferencesCore';
import { localFloatShare, shareTextLines } from '../../../eddy-ios/src/lib/localFloatShare';
import { spokenGeneration } from '../../../eddy-ios/src/lib/damFavoriteDisplay';
import { offlineBadge } from '../../../eddy-ios/src/lib/tripDownload';

test('dam refresh runs on focus, resume and five-minute boundaries and cancels on blur', () => {
  let now = Date.parse('2026-11-04T18:00:00Z');
  const state = { currentState: 'active' };
  const callbacks: { tick?: () => void; foreground?: () => void; cleanup?: () => void } = {};
  let removed = false, cleared = false;
  const signals: AbortSignal[] = [];
  const dependencies: Record<string, unknown> = {
    react: { useCallback: (fn: unknown) => fn },
    'react-native': { AppState: state },
    'expo-router': { useFocusEffect: (fn: () => () => void) => { callbacks.cleanup = fn(); } },
    '@/lib/foreground': { onForeground: (fn: () => void) => { callbacks.foreground = fn; return () => { removed = true; }; } },
    '@/lib/damReadFreshness': { damRefreshSlot },
  };
  const exports: { useDamRefresh?: (load: (signal: AbortSignal) => void) => void } = {};
  runInNewContext(ts.transpileModule(readFileSync('../eddy-ios/src/hooks/useDamRefresh.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, AbortController, Date: { now: () => now },
    setInterval: (fn: () => void) => { callbacks.tick = fn; return 1; },
    clearInterval: () => { cleared = true; },
    require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; },
  });
  exports.useDamRefresh!(signal => { signals.push(signal); });
  assert.equal(signals.length, 1);
  now += 60_000; callbacks.tick!();
  assert.equal(signals.length, 1);
  now += 4 * 60_000; callbacks.tick!();
  assert.equal(signals.length, 2);
  assert.ok(signals[0].aborted);
  state.currentState = 'background'; now += 5 * 60_000; callbacks.tick!();
  assert.equal(signals.length, 2);
  state.currentState = 'active'; callbacks.foreground!();
  assert.equal(signals.length, 3);
  assert.ok(signals[1].aborted);
  callbacks.cleanup!();
  assert.ok(signals[2].aborted);
  assert.ok(removed && cleared);
});

test('a dam Read expires at the next hour, Central midnight, and the repeated DST hour', () => {
  const rendered = Date.parse('2026-11-04T18:55:00Z');
  assert.ok(damReadStillCurrent('2026-11-04T16:00:00Z', rendered, rendered + 4 * 60_000));
  assert.equal(damReadStillCurrent('2026-11-04T16:00:00Z', rendered, rendered + 5 * 60_000), false);
  assert.equal(damReadStillCurrent('2026-11-05T05:59:00Z', Date.parse('2026-11-05T05:59:00Z'), Date.parse('2026-11-05T06:00:00Z')), false);
  assert.equal(damReadStillCurrent('2026-11-01T06:00:00Z', Date.parse('2026-11-01T06:59:00Z'), Date.parse('2026-11-01T07:00:00Z')), false);
  assert.equal(damReadStillCurrent('invalid', rendered, rendered), false);
  assert.equal(damReadStillCurrent('2026-11-05T16:00:00Z', rendered, rendered), false);
  assert.equal(damRefreshSlot(rendered), damRefreshSlot(rendered + 4 * 60_000));
  assert.notEqual(damRefreshSlot(rendered), damRefreshSlot(rendered + 5 * 60_000));
});

test('unsupported dam Reads stay absent and entitlement failures cannot retain prose', () => {
  assert.equal(damReadFailure(404), 'unavailable');
  assert.equal(damReadFailure(402), 'premium');
  for (const status of [401, 403]) assert.equal(damReadFailure(status), 'sign-in');
  for (const status of [undefined, 429, 500, 503]) assert.equal(damReadFailure(status), 'retry');
});

test('start timing explains withheld estimates and failed requests separately', () => {
  const state = { loading: false, failed: false, typical: false };
  assert.match(startEstimateMessage({ ...state, reason: 'dangerous' }), /Flood conditions/);
  assert.match(startEstimateMessage({ ...state, reason: 'regulated' }), /Dam-controlled flow/);
  assert.match(startEstimateMessage({ ...state, failed: true }), /Couldn’t check/);
  assert.match(startEstimateMessage({ ...state, typical: true }), /water data unavailable/);
  assert.match(startEstimateMessage(state), /learn your pace/);
  assert.match(startEstimateMessage({ ...state, loading: true }), /Checking/);
});

test('offline badges preserve verification failures, incomplete packs, and outdated routes', () => {
  const tiles = { kind: 'tiles-saved' as const, bytes: 100 };
  for (const reason of ['timeout', 'read-failed', 'module-missing']) {
    assert.equal(offlineBadge(tiles, true, { kind: 'unconfirmed', reason }), 'Couldn’t check offline map');
  }
  assert.equal(offlineBadge(tiles, true, { kind: 'unconfirmed', reason: 'native-unconfirmed' }), 'Download incomplete');
  assert.equal(offlineBadge(tiles, true, { kind: 'counts' }), 'Download incomplete');
  assert.equal(offlineBadge({ kind: 'ready', bytes: 100 }, true, undefined, false), 'Couldn’t check offline map');
  assert.equal(offlineBadge({ kind: 'partial', fraction: 0.5, bytes: 50 }, true), 'Map partly saved');
  assert.equal(offlineBadge({ kind: 'outdated', bytes: 100 }, true), 'Map needs update');
});

test('a dam glance speaks remaining windows without enumerating every hour', () => {
  const day = { date: '2026-11-04', capacityMw: 391, summary: null, hours: Array.from({ length: 24 }, (_, i) => ({
    hourEnding: i + 1, label: `${i}`, megawatts: [8, 9, 15, 16].includes(i) ? 100 : 0,
    fraction: [8, 9, 15, 16].includes(i) ? 100 / 391 : 0,
  })) };
  assert.equal(spokenGeneration(day, 'Today', 13), 'Today, Central time. Generation scheduled 3 PM to 5 PM.');
  assert.equal(spokenGeneration(day, 'Today', 18), 'Today, Central time. No more generation scheduled.');
  assert.match(spokenGeneration({ ...day, hours: day.hours.map(h => ({ ...h, megawatts: 7, minimumFlow: true })) }, 'Today'), /Only minimum flow/);
  assert.match(spokenGeneration({ ...day, hours: day.hours.map(h => ({ ...h, megawatts: null })) }, 'Today'), /schedule incomplete/);
  const incomplete = { ...day, hours: day.hours.map(h => h.hourEnding === 20 ? { ...h, megawatts: null } : h) };
  assert.match(spokenGeneration(incomplete, 'Today', 18), /Some hours unavailable/);
});

test('reminder defaults exclude river stops and cannot be resurrected after deletion', async () => {
  const values = new Map<string, string>();
  const prefs = createReminderPreferences({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  });
  assert.deepEqual(await prefs.read(), { takeOut: true, hazards: true, stops: [] });
  const revision = prefs.revision();
  await prefs.save({ takeOut: false, hazards: true, stops: ['another-river-stop'] }, revision);
  assert.deepEqual(await prefs.read(), { takeOut: false, hazards: true, stops: [] });
  assert.doesNotMatch(values.get(REMINDER_PREFERENCES_KEY)!, /stop/);
  const pending = prefs.save({ takeOut: false, hazards: false, stops: [] }, revision);
  await prefs.clear();
  await pending;
  await prefs.save({ takeOut: false, hazards: false, stops: [] }, revision);
  assert.equal(values.has(REMINDER_PREFERENCES_KEY), false);
  assert.deepEqual(reminderPreferences('broken'), { takeOut: true, hazards: true, stops: [] });
});

const trip: CompletedFloat = {
  version: 1, measurementVersion: 1, id: 'private-id', riverSlug: 'current', riverName: 'Current River',
  putInId: 'a', putInName: 'Akers', takeOutId: 'b', takeOutName: 'Pulltite', boatType: 'kayak',
  startedAt: Date.parse('2026-11-04T18:13:02Z'), endedAt: Date.parse('2026-11-04T19:13:02Z'),
  elapsedMs: 3_600_000, movingMs: 3_000_000, stoppedMs: 600_000, unknownMs: 0,
  firstMile: 0, lastMile: 4, distanceMiles: 4, movingMph: 4, plannerMph: 4, reachedTakeOut: false,
  startNote: 'Private trip note',
};
test('local shares retain honest trip measurements without private metadata or a condition claim', () => {
  const model = localFloatShare(trip);
  assert.equal(model.river, 'Current River');
  assert.equal(model.duration, '1 hr');
  assert.equal(model.arrival, 'Take-out wasn’t confirmed');
  assert.doesNotMatch(JSON.stringify(model), /private-id|Private trip note|18:13|condition|coordinate|account/);
  const noGps = localFloatShare({ ...trip, firstMile: null, lastMile: null });
  assert.equal(noGps.distance, null);
  assert.equal(noGps.tracking, 'GPS tracking unavailable');
  const lines = shareTextLines('An exceptionally long access point name with a very long road name and more words', 20, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines.every(line => line.length <= 20));
  assert.ok(lines.at(-1)!.endsWith('…'));
});
