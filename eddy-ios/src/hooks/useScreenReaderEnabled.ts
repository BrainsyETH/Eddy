import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Follow VoiceOver changes without letting a late initial query undo an event. */
export function useScreenReaderEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (value) => {
      changed = true;
      setEnabled(value);
    });
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (alive && !changed) setEnabled(value);
    }).catch(() => {});
    return () => { alive = false; subscription.remove(); };
  }, []);
  return enabled;
}
