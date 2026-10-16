// eddy-ios/src/float/useTrackingLine.ts
// What Float Mode says about tracking, and what tapping it does: the native
// recorder's own report (floatTrackerStatus.ts), plus whether iOS will still
// show its location prompt, which only the permission read can say. Shared by
// Float Mode and Float options.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import { onForeground } from '@/lib/foreground';
import { trackerStatus, trackingLine, type TrackingLine, type TrackerState } from '@/lib/floatTrackerStatus';

export function useTrackingLine(): { line: TrackingLine | null; tracker: TrackerState; act: () => void } {
  const tracker = useSyncExternalStore(trackerStatus.subscribe, trackerStatus.get, trackerStatus.get);
  const [canAskAgain, setCanAskAgain] = useState(false);
  const denied = tracker.denied;
  useEffect(() => {
    if (!denied) return;
    const refresh = () => {
      void Location.getForegroundPermissionsAsync()
        .then((permission) => setCanAskAgain(permission.canAskAgain))
        .catch(() => {});
    };
    refresh();
    return onForeground(refresh);
  }, [denied]);

  const line = trackingLine(tracker, canAskAgain);
  const act = () => {
    if (!line) return;
    switch (line.action) {
      case 'request':
        // The recorder's next report says whether it worked.
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
  return { line, tracker, act };
}
