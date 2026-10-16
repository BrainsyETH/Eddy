// eddy-ios/src/lib/floatPermissions.ts
// Whether the location permission lets a float start, and what to ask for.
//
// Pure, so the web suite tests it. This decides whether a float can START;
// what River Mode says once one is running comes from the native recorder's
// own diagnostics (floatTrackerStatus.ts). No prompt loops.

export interface ForegroundPermission {
  status: string;
  canAskAgain?: boolean;
  ios?: { accuracy?: 'full' | 'reduced' } | null;
}

export type StartLocationState = 'checking' | 'request' | 'settings' | 'precise' | 'services' | 'ready';

/** A manual river choice never bypasses the permission needed to track. */
export function startLocationState(
  permission: ForegroundPermission | null,
  servicesEnabled: boolean,
): StartLocationState {
  if (!permission) return 'checking';
  if (!servicesEnabled) return 'services';
  if (permission.status !== 'granted') return permission.canAskAgain ? 'request' : 'settings';
  return permission.ios?.accuracy === 'reduced' ? 'precise' : 'ready';
}

/**
 * How Start gets precise location when it is off: Apple's in-app prompt
 * first, so the paddler can allow it without leaving Eddy; Settings only once
 * that was declined on this visit, or in a build that cannot show it.
 */
export function preciseLocationAction(declinedThisVisit: boolean, canAskInApp: boolean): 'ask' | 'settings' {
  return canAskInApp && !declinedThisVisit ? 'ask' : 'settings';
}
