// eddy-ios/src/lib/floatPermissions.ts
// What the location permission allows a float to do, and what to say about it.
//
// Pure, so the web suite tests it. What Float Mode says about tracking is
// trackingLine in floatTrackerStatus.ts, which also weighs what the stream is
// actually doing: no prompt loops, and no promise of locked-screen tracking
// that the permission, or the stream, does not provide.

export type TrackingMode =
  /** "Always": tracks with the screen locked. */
  | 'locked'
  /** "While Using" or "Allow Once": tracks only while Eddy is on screen. */
  | 'screen-on'
  /** Precise Location off: positions are too coarse to place you on a river. */
  | 'approximate'
  /** Denied, or never answered. */
  | 'none'
  /** Not read yet. */
  | 'unknown';

export interface ForegroundPermission {
  status: string;
  canAskAgain?: boolean;
  ios?: { accuracy?: 'full' | 'reduced' } | null;
}

export function trackingMode(
  foreground: ForegroundPermission | null,
  background: { status: string } | null,
): TrackingMode {
  if (!foreground) return 'unknown';
  if (foreground.status !== 'granted') return 'none';
  if (foreground.ios?.accuracy === 'reduced') return 'approximate';
  return background?.status === 'granted' ? 'locked' : 'screen-on';
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
