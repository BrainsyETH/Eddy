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

interface ForegroundPermission {
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
        text: 'Tracking pauses while your screen is locked. To keep it going in a dry bag, set Eddy’s location to Always in Settings, or keep the screen on.',
        action: 'settings',
      };
    case 'approximate':
      return {
        text: 'Precise Location is off for Eddy, so Float Mode can’t place you on the river. Turn it on in Settings.',
        action: 'settings',
      };
    case 'none':
      return canAskAgain
        ? { text: 'Float Mode needs your location to show how far you have left. It stays on your phone.', action: 'request' }
        : { text: 'Location is off for Eddy. Turn it on in Settings to track this float.', action: 'settings' };
  }
}
