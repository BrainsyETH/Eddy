import type { SpringConfig } from "remotion";

/**
 * Reusable spring configurations matching Eddy's motion design.
 */

/** Default entrance animation — smooth with slight overshoot */
export const ENTRANCE: SpringConfig = {
  damping: 15,
  mass: 0.8,
  stiffness: 120,
};

/** Bouncy entrance for playful elements (Eddy mascot, badges) */
export const BOUNCY: SpringConfig = {
  damping: 10,
  mass: 0.6,
  stiffness: 100,
};

/** Gentle fade/slide for subtitles and text */
export const GENTLE: SpringConfig = {
  damping: 20,
  mass: 0.5,
  stiffness: 100,
};

/** Snappy for quick UI element appearances */
export const SNAPPY: SpringConfig = {
  damping: 18,
  mass: 0.4,
  stiffness: 200,
};

/** Slow and smooth for large transitions */
export const SMOOTH: SpringConfig = {
  damping: 20,
  mass: 1,
  stiffness: 80,
};
