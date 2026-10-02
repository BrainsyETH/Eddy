import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Mount once in ThemeProvider so remounting controls reuse the resolved setting. */
export function useReduceTransparency(): boolean {
  // Stay opaque until the initial accessibility preference is known.
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let alive = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => {
      changed = true;
      if (alive) setEnabled(value);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (alive && !changed) setEnabled(value);
    }).catch(() => {});
    return () => { alive = false; subscription.remove(); };
  }, []);
  return enabled;
}
