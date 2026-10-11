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
// a delivery that finds no float stops the task.

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ensureFloatSessionLoaded, floatRemindersSettled, flushFloatSessionIfStale, getFloatSession, recordFixes } from '@/lib/floatSessionStore';
import { warn } from '@/lib/monitoring';
import { flushHazardReports } from './hazardReports';
import { floatActivitySettled } from './liveActivity';

export const FLOAT_LOCATION_TASK = 'eddy-float-location';

/** Persist at least this often from the background; see flushFloatSessionIfStale. */
const BACKGROUND_WRITE_MS = 30_000;

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
  recordFixes(fixes);
  // Let a reminder reach the notifier before iOS suspends Eddy again.
  await floatRemindersSettled();
  await flushFloatSessionIfStale(BACKGROUND_WRITE_MS);
  // Finish the local ActivityKit handover before spending time on the network.
  await floatActivitySettled();
  // A hazard report written with no signal goes out when the locked phone
  // finds some. Tracking/persistence finish first; allow five seconds for
  // reports, then cancel unfinished network work without growing backoff.
  await flushHazardReports(5_000);
});

/** Start locked-screen tracking if "Always" is granted. False when it is not. */
export async function startBackgroundTracking(): Promise<boolean> {
  try {
    const permission = await Location.getBackgroundPermissionsAsync();
    if (permission.status !== 'granted') return false;
    if (await Location.hasStartedLocationUpdatesAsync(FLOAT_LOCATION_TASK)) return true;
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

export async function stopBackgroundTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(FLOAT_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(FLOAT_LOCATION_TASK);
    }
  } catch (error) {
    warn('float', 'could not stop background location', error);
  }
}
