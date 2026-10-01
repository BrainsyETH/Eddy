import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

interface ContrastModule {
  isIncreaseContrastEnabled?: () => Promise<boolean>;
  addListener: (event: string, listener: (event: { enabled: boolean }) => void) => { remove: () => void };
}
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<ContrastModule>('EddyMapSheet') : null;

export function useIncreaseContrast() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    let changed = false;
    const update = (value: boolean) => { changed = true; if (alive) setEnabled(value); };
    const subscription = Platform.OS === 'ios' && native?.isIncreaseContrastEnabled
      ? native.addListener('onContrastChange', event => update(event.enabled))
      : Platform.OS === 'android' ? AccessibilityInfo.addEventListener('highTextContrastChanged', update) : null;
    const query = Platform.OS === 'ios' ? native?.isIncreaseContrastEnabled?.()
      : Platform.OS === 'android' ? AccessibilityInfo.isHighTextContrastEnabled() : undefined;
    void query?.then(value => { if (alive && !changed) setEnabled(value); }).catch(() => {});
    return () => { alive = false; subscription?.remove(); };
  }, []);
  return enabled;
}
