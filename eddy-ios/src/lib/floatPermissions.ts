// eddy-ios/src/lib/floatPermissions.ts
// What the location permission allows a float to do, and what to say about it.
//
// Pure, so the web suite tests it. Every state gets an honest sentence: no
// prompt loops, and no promise of locked-screen tracking that the permission
// does not allow.

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

export interface TrackingNotice {
  text: string;
  /** 'request' only while iOS will still show its prompt; otherwise Settings. */
  action: 'request' | 'settings';
}

export function trackingNotice(mode: TrackingMode, canAskAgain = false): TrackingNotice | null {
  switch (mode) {
    case 'locked':
    case 'unknown':
      return null;
    case 'screen-on':
      return {
        text: 'Tracking pauses while your phone is locked.',
        action: 'settings',
      };
    case 'approximate':
      return {
        text: 'Turn on Precise Location to track your float.',
        action: 'settings',
      };
    case 'none':
      return canAskAgain
        ? { text: 'Eddy uses your location to track your float.', action: 'request' }
        : { text: 'Turn on location to track your float.', action: 'settings' };
  }
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
