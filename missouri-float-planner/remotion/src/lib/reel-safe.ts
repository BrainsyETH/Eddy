// src/lib/reel-safe.ts
// Shared geometry + loop helpers for all social reel compositions.

import { interpolate } from "remotion";

/**
 * The cross-posted master must survive Instagram, Facebook and TikTok Reel
 * chrome. Platform-specific Reel and Story profiles live in social-brand;
 * cover crop geometry is deliberately independent from both.
 */
export { REEL_SAFE, STORY_SAFE, SOCIAL_VIDEO_SAFE } from "../../../shared/social-brand";

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
