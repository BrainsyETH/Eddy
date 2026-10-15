// eddy-ios/src/float/backgroundTracking.ts
// Locked-screen tracking for Float Mode (#1448 Phase 4).
//
// ── Defined at module scope, imported from the root layout ──────────────────
// iOS can relaunch Eddy in the background to deliver locations, with no
// screen mounted. The task must already be defined when that happens, so
// defineTask runs when this module is imported, and app/_layout.tsx imports it
// for that side effect. Nothing here may depend on a component.
//
// ── One stream ──────────────────────────────────────────────────────────────
// When "Always" is granted, this task is THE location stream for the float,
// in the foreground too; FloatTracker does not also watch. Without it,
// FloatTracker falls back to a foreground watch and the screen says tracking
// pauses when the phone locks.
//
// ── Settings, and why ───────────────────────────────────────────────────────
//   High accuracy, no distance filter: a filter would starve the tracker
//     during a stop and force a reacquire after every lunch.
//   pausesUpdatesAutomatically false: iOS's own pause guesses at stops and
//     may not resume on a slow river.
//   OtherNavigation: non-automobile navigation, which is what a float is.
//   The blue background-location indicator stays on: it is the honest signal
//     that Eddy is using location while locked, and tapping it returns here.
// Battery cost is measured on a real river before release; these are the
// starting point, not the answer.
//
// Tracking stops when the float ends, and never runs without an active float:
// a delivery that finds no float stops the task. A float nobody ended ends
// itself after arriving or leaving the river (floatEnding.ts), which stops
// tracking the same way.
//
// ── Closing Eddy mid-float ──────────────────────────────────────────────────
// Assume people swipe Eddy away on the water. Standard location updates stop
// when they do, and iOS does not relaunch an app for them. Two services do
// relaunch a closed app into the background, and Apple's guidance is to use
// them for exactly this:
//   significant location changes   expo-location already starts these with
//     the task (EXLocationTaskConsumer), and expo-task-manager re-registers
//     the task on relaunch, which restarts full-accuracy updates.
//   region monitoring              a "wake fence" around the latest fix
//     (WAKE_FENCE_RADIUS_M), moved as the paddler moves. Leaving it relaunches
//     Eddy, whose wake task restarts tracking.
// Both lean on cell and Wi-Fi more than GPS, so in a dead zone the wake can
// come late; the gap is then reacquired like any other (river-progress.ts).
// Neither needs a new permission: both run under the "Always" grant tracking
// already has, and the blue indicator stays the honest signal. Device-proven:
// unconfirmed (docs/ios-release-runbook.md).

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ensureFloatSessionLoaded, floatRemindersSettled, flushFloatSessionIfStale, getFloatSession, recordFixes } from '@/lib/floatSessionStore';
import { warn } from '@/lib/monitoring';
import { createSerialQueue } from '@/lib/serialQueue';
import { flushHazardReports } from './hazardReports';
import { floatActivitySettled } from './liveActivity';

export const FLOAT_LOCATION_TASK = 'eddy-float-location';
export const FLOAT_WAKE_TASK = 'eddy-float-wake';

/** Persist at least this often from the background; see flushFloatSessionIfStale. */
const BACKGROUND_WRITE_MS = 30_000;

/**
 * Radius of the wake fence. Region monitoring is unreliable much below about
 * 150 m; a float covers this in a few minutes, so a closed Eddy wakes soon
 * after the paddler moves on.
 */
const WAKE_FENCE_RADIUS_M = 200;
/** Move the fence once the latest fix is this far from its centre. */
const WAKE_FENCE_MOVE_M = 100;
let fenceCenter: { latitude: number; longitude: number } | null = null;

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(FLOAT_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    warn('float', 'background location error', error.message);
    return;
  }
  // Ask for the CURRENT session after loading, never the load's own result:
  // a float started after launch is not in what the launch-time load found.
  await ensureFloatSessionLoaded();
  if (!getFloatSession()) {
    await stopBackgroundTracking();
    return;
  }
  const fixes = (data?.locations ?? []).map((location) => ({
    lngLat: [location.coords.longitude, location.coords.latitude] as [number, number],
    accuracyMeters: location.coords.accuracy ?? null,
    timestamp: location.timestamp,
  }));
  const autoEnd = recordFixes(fixes);
  // Stop only if it actually ended: rechecked after any prompt landed, a
  // float the paddler has come back to keeps tracking.
  if (autoEnd && (await autoEnd)) {
    await stopBackgroundTracking();
    return;
  }
  // Let a reminder reach the notifier before iOS suspends Eddy again.
  await floatRemindersSettled();
  const latest = data?.locations?.[data.locations.length - 1];
  if (latest) await moveWakeFence(latest.coords);
  await flushFloatSessionIfStale(BACKGROUND_WRITE_MS);
  // Give ActivityKit up to one second after recording/persisting fixes. A stuck
  // native update must not hold this task or optional report delivery open.
  await floatActivitySettled();
  // A hazard report written with no signal goes out when the locked phone
  // finds some. Tracking/persistence finish first; allow five seconds for
  // reports, then cancel unfinished network work without growing backoff.
  await flushHazardReports(5_000);
});

// Relaunched by the wake fence (or woken by it while running): make sure the
// location stream is running again. The stream itself moves the fence.
TaskManager.defineTask(FLOAT_WAKE_TASK, async ({ error }) => {
  if (error) {
    warn('float', 'wake fence error', error.message);
    return;
  }
  await ensureFloatSessionLoaded();
  if (!getFloatSession()) {
    await stopBackgroundTracking();
    return;
  }
  await startBackgroundTracking(() => getFloatSession() != null);
});

/** Re-centre the wake fence on the paddler once they have moved away from it. */
async function moveWakeFence(coords: { latitude: number; longitude: number }): Promise<void> {
  if (fenceCenter && metersBetween(fenceCenter, coords) < WAKE_FENCE_MOVE_M) return;
  try {
    await Location.startGeofencingAsync(FLOAT_WAKE_TASK, [
      {
        identifier: 'float-wake',
        latitude: coords.latitude,
        longitude: coords.longitude,
        radius: WAKE_FENCE_RADIUS_M,
        notifyOnEnter: false,
        notifyOnExit: true,
      },
    ]);
    fenceCenter = { latitude: coords.latitude, longitude: coords.longitude };
  } catch (error) {
    warn('float', 'could not move the wake fence', error);
  }
}

function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const y = (b.latitude - a.latitude) * 111_320;
  const x = (b.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(x, y);
}

/**
 * Starts and stops run one at a time, in call order. Each is several native
 * awaits; unordered, a stop issued while a start was pending ran first, found
 * nothing to stop, and the start then left GPS running after End.
 */
const runInOrder = createSerialQueue();

/**
 * Start locked-screen tracking if "Always" is granted. False when it is not.
 *
 * `stillWanted` is re-checked once this start's turn in the queue comes, right
 * before the native start: a float ended while the start waited is not
 * restarted.
 */
export function startBackgroundTracking(stillWanted: () => boolean = () => true): Promise<boolean> {
  return runInOrder(() => startNow(stillWanted));
}

async function startNow(stillWanted: () => boolean): Promise<boolean> {
  try {
    if (!stillWanted()) return false;
    const permission = await Location.getBackgroundPermissionsAsync();
    if (permission.status !== 'granted') return false;
    if (await Location.hasStartedLocationUpdatesAsync(FLOAT_LOCATION_TASK)) return true;
    if (!stillWanted()) return false;
    await Location.startLocationUpdatesAsync(FLOAT_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 0,
      activityType: Location.ActivityType.OtherNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
    return true;
  } catch (error) {
    warn('float', 'could not start background location', error);
    return false;
  }
}

export function stopBackgroundTracking(): Promise<void> {
  return runInOrder(stopNow);
}

async function stopNow(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(FLOAT_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(FLOAT_LOCATION_TASK);
    }
  } catch (error) {
    warn('float', 'could not stop background location', error);
  }
  try {
    fenceCenter = null;
    if (await Location.hasStartedGeofencingAsync(FLOAT_WAKE_TASK)) await Location.stopGeofencingAsync(FLOAT_WAKE_TASK);
  } catch (error) {
    warn('float', 'could not stop the wake fence', error);
  }
}
