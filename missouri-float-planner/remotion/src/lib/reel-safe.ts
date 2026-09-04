// src/lib/reel-safe.ts
// Shared geometry + loop helpers for all social reel compositions.

import { interpolate } from "remotion";

/**
 * Instagram Reels overlays chrome on the rendered 1080x1920 canvas:
 *   - Top ~230 px: handle, sound indicator, follow button
 *   - Bottom ~380 px: caption, like/comment/share, "original audio",
 *     progress bar
 * The inset is owned by shared/social-brand.ts (the covers use the same
 * numbers for their grid-crop band); re-exported here for the reels.
 */
export { REEL_SAFE } from "../../../shared/social-brand";

/**
 * Global opacity envelope for a looping reel. Opens at FULL brightness from
 * frame 0 so the first frame (the grid thumbnail / first autoplay frame the
 * scroller sees) is branded content, NOT a fade-from-black — then dips gently
 * toward the end so the loop seam isn't a hard cut. (We deliberately do NOT
 * fade in: "own the first second" beats a symmetric black breath.)
 */
export function reelLoopOpacity(
  frame: number,
  durationInFrames: number,
  fadeOutFrames = 14,
): number {
  return interpolate(
    frame,
    [0, durationInFrames - fadeOutFrames, durationInFrames],
    [1, 1, 0.35],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}
