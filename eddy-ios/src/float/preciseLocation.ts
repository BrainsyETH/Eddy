// eddy-ios/src/float/preciseLocation.ts
// Apple's in-app prompt for precise location (temporary full accuracy, with
// the FloatTracking purpose text in app.json), via the float recorder module.
// Start asks this way first; Settings is the fallback once it is declined.

import { floatRecorder } from '../../modules/eddy-float-recorder';

/** Whether this build can show the in-app prompt. */
export const canAskPreciseInApp = floatRecorder != null;

/** Show the prompt; resolves whether precise location is on afterwards. */
export function requestPreciseLocation(): Promise<boolean> {
  return floatRecorder ? floatRecorder.requestPreciseLocation().catch(() => false) : Promise.resolve(false);
}
