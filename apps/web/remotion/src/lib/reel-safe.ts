// src/lib/reel-safe.ts
// Shared geometry + loop helpers for all social reel compositions.

import { interpolate } from "remotion";

/**
 * Instagram Reels overlays chrome on the rendered 1080x1920 canvas:
 *   - Top ~230 px: handle, sound indicator, follow button
 *   - Bottom ~380 px: caption, like/comment/share, "original audio",
 *     progress bar
 * Meta's published "safe zone" guidance is conservative but accurate.
 * Symmetric horizontal padding keeps `alignItems: "center"` flex
 * containers on the true video centerline (x=540).
 */
export const REEL_SAFE = {
  top: 250,
  bottom: 420,
  left: 60,
  right: 60,
} as const;

/**
 * Global opacity envelope: fade-in over `fadeInFrames`, hold, fade-out
 * over `fadeOutFrames`. Wrap a composition's root AbsoluteFill with this
 * so Reels auto-loop cleanly — end state matches start state (both
 * faded to transparent).
 */
export function reelLoopOpacity(
  frame: number,
  durationInFrames: number,
  fadeInFrames = 15,
  fadeOutFrames = 12,
): number {
  return interpolate(
    frame,
    [0, fadeInFrames, durationInFrames - fadeOutFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}
