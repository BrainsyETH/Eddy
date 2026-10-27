// eddy-ios/src/hooks/useAnnounce.ts
// Speak a change to VoiceOver. `accessibilityLiveRegion` is Android-only, so
// on iOS a status line that changes under the user says nothing unless the
// app announces it. Announces when the message changes to a new, non-empty
// value; the same message is not repeated, and clearing it is silent.

import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useAnnounce(message: string | null | undefined): void {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!message || message === last.current) {
      if (!message) last.current = null;
      return;
    }
    last.current = message;
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}
