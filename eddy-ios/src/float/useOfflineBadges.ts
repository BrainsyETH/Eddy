// eddy-ios/src/float/useOfflineBadges.ts
// Offline status lines for a list of saved floats, re-read whenever the screen
// comes back into view (a download may have finished, or been removed, on the
// float's own page). Empty while Float Mode is off: downloads live there.

import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { readOfflineBadges } from './tripDownloads';

export function useOfflineBadges(tripKeys: readonly string[], enabled: boolean | undefined): ReadonlyMap<string, string> {
  const [badges, setBadges] = useState<ReadonlyMap<string, string>>(new Map());
  const key = tripKeys.join('|');
  const latest = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || key === '') {
        setBadges(new Map());
        return;
      }
      const request = ++latest.current;
      void readOfflineBadges(key.split('|')).then((next) => {
        if (request === latest.current) setBadges(next);
      });
    }, [enabled, key]),
  );

  return badges;
}
