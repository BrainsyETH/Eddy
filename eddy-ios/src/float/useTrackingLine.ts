// eddy-ios/src/float/useTrackingLine.ts
// What Float Mode says about tracking, and what tapping it does: the location
// permission (re-read when it may have changed) plus what FloatTracker actually
// started (floatTrackerStatus.ts). Shared by Float Mode and Float options.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import { onForeground } from '@/lib/foreground';
import { trackingMode, type TrackingMode } from '@/lib/floatPermissions';
import { trackerStatus, trackingLine, type TrackingLine } from '@/lib/floatTrackerStatus';

/** Permission can change in Settings without Eddy leaving the foreground. */
const RECHECK_MS = 15_000;

export function useTrackingLine(): { line: TrackingLine | null; act: () => void } {
  const [permission, setPermission] = useState<{ mode: TrackingMode; canAskAgain: boolean }>({
    mode: 'unknown',
    canAskAgain: false,
  });
  const tracker = useSyncExternalStore(trackerStatus.subscribe, trackerStatus.get, trackerStatus.get);
  useEffect(() => {
    const refresh = () => {
      void Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()])
        .then(([foreground, background]) =>
          setPermission({ mode: trackingMode(foreground, background), canAskAgain: foreground.canAskAgain }),
        )
        .catch(() => {});
    };
    refresh();
    const offForeground = onForeground(refresh);
    const timer = setInterval(refresh, RECHECK_MS);
    return () => {
      clearInterval(timer);
      offForeground();
    };
  }, []);

  const line = trackingLine(permission.mode, tracker, permission.canAskAgain);
  const act = () => {
    if (!line) return;
    switch (line.action) {
      case 'request':
        // The answer starts tracking; the foreground recheck updates the line.
        void Location.requestForegroundPermissionsAsync()
          .catch(() => null)
          .finally(() => trackerStatus.retry());
        return;
      case 'retry':
        trackerStatus.retry();
        return;
      case 'settings':
        void Linking.openSettings();
        return;
      case 'info':
        return;
    }
  };
  return { line, act };
}
