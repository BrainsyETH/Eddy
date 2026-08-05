// eddy-ios/src/hooks/useReducedMotion.ts
// Whether the OS has been told to cut animation down.
//
// Nothing in this app asked before now, so this hook creates an expectation as
// much as it answers a question: it is introduced for the map sheet, and the
// honest scope today is the map sheet. Anything else that grows a spring should
// read it too rather than leaving the setting half-honoured.
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

export function useReducedMotion(): boolean {
  // Starts false so the first frame animates normally on the overwhelmingly
  // common path. The async read below corrects it within a frame or two, which
  // costs at most one settle — the alternative, starting true, would flash
  // every animation off and on for everybody who has the setting off.
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduced(value);
      })
      // A device that cannot answer is not a device that wants less motion.
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduced(value);
    });

    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
