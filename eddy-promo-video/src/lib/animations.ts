import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// ─── Spring Presets ────────────────────────────────────────────────────

export const SPRINGS = {
  gentle: { damping: 20, mass: 0.5, stiffness: 80 },
  bouncy: { damping: 12, mass: 0.8, stiffness: 100 },
  snappy: { damping: 30, mass: 0.5, stiffness: 200 },
  slow: { damping: 30, mass: 1, stiffness: 50 },
} as const;

// ─── Animation Hooks ───────────────────────────────────────────────────

/**
 * Fade in animation
 */
export function useFadeIn(delay = 0, duration = 20) {
  const frame = useCurrentFrame();
  return interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/**
 * Fade out animation
 */
export function useFadeOut(startFrame: number, duration = 20) {
  const frame = useCurrentFrame();
  return interpolate(frame, [startFrame, startFrame + duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/**
 * Slide in from direction
 */
export function useSlideIn(
  delay = 0,
  direction: "up" | "down" | "left" | "right" = "up",
  distance = 50
) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: SPRINGS.gentle,
  });

  const offset = interpolate(progress, [0, 1], [distance, 0]);

  switch (direction) {
    case "up":
      return { transform: `translateY(${offset}px)` };
    case "down":
      return { transform: `translateY(-${offset}px)` };
    case "left":
      return { transform: `translateX(${offset}px)` };
    case "right":
      return { transform: `translateX(-${offset}px)` };
  }
}

/**
 * Scale in animation with spring
 */
export function useScaleIn(delay = 0, from = 0.8) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: SPRINGS.bouncy,
  });

  return interpolate(progress, [0, 1], [from, 1]);
}

/**
 * Counter animation (for stats)
 */
export function useCounter(target: number, delay = 0, duration = 60) {
  const frame = useCurrentFrame();
  
  const value = interpolate(
    frame,
    [delay, delay + duration],
    [0, target],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return Math.round(value);
}

/**
 * Staggered animation delay calculator
 */
export function staggerDelay(index: number, baseDelay = 0, staggerAmount = 10) {
  return baseDelay + index * staggerAmount;
}

/**
 * Typewriter effect for text
 */
export function useTypewriter(text: string, delay = 0, charsPerFrame = 0.5) {
  const frame = useCurrentFrame();
  const chars = Math.floor((frame - delay) * charsPerFrame);
  
  if (chars <= 0) return "";
  if (chars >= text.length) return text;
  
  return text.slice(0, chars);
}

/**
 * Pulse animation
 */
export function usePulse(speed = 0.1, intensity = 0.05) {
  const frame = useCurrentFrame();
  return 1 + Math.sin(frame * speed) * intensity;
}

/**
 * Ken Burns pan/zoom effect
 */
export function useKenBurns(
  startScale = 1,
  endScale = 1.1,
  startX = 0,
  endX = 0,
  startY = 0,
  endY = 0
) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = frame / durationInFrames;

  const scale = interpolate(progress, [0, 1], [startScale, endScale]);
  const x = interpolate(progress, [0, 1], [startX, endX]);
  const y = interpolate(progress, [0, 1], [startY, endY]);

  return {
    transform: `scale(${scale}) translate(${x}%, ${y}%)`,
  };
}
