// eddy-ios/src/hooks/useReducedMotion.ts
// Whether the OS has been told to cut animation down.
//
// Shared by animated sheets, splash, and programmatic map camera moves.
// New app-driven animations should read the same preference.
//
// ── What "reduced" means here, and what it does NOT ───────────────────────
// It does not mean "hold still". Dragging a sheet with your finger is DIRECT
// MANIPULATION — the sheet is following the touch, not playing an animation —
// and freezing that would break the gesture rather than calm it. What reduces
// is the part the app plays on its own: the settle after release, the entry,
// the tab indicator's slide, the camera's fly-to. Those become instant.
//
// ── Why a subscription and not a one-shot read ────────────────────────────
// The setting is toggled in Settings, which is another app: a user who turns it
// on mid-session comes back to a screen that would otherwise keep springing at
// them until the process restarts. `reduceMotionChanged` is the event for
// exactly that, and the initial read is async, so a one-shot would also be
// wrong for the first frame.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(initialValue = false): boolean {
  // Existing callers animate until the async query answers. Camera navigation
  // opts into a conservative first frame so a cold deep link never sweeps.
  const [reduced, setReduced] = useState(initialValue);

  useEffect(() => {
    let alive = true;
    let changed = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive && !changed) setReduced(value);
      })
      // Keep the caller’s initial preference if the OS query is unavailable.
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      changed = true;
      setReduced(value);
    });

    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
