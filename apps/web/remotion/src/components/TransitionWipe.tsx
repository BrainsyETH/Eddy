import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  AbsoluteFill,
} from "remotion";

interface TransitionWipeProps {
  /** Direction of wipe */
  direction?: "left" | "right";
  /** Duration of transition in frames */
  transitionFrames?: number;
  children: React.ReactNode;
}

/**
 * Slide transition — content slides in from right (default).
 * Wrap each scene in this for smooth transitions between scenes.
 */
export const TransitionWipe: React.FC<TransitionWipeProps> = ({
  direction = "right",
  transitionFrames = 15,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Entrance animation
  const entranceProgress = spring({
    frame,
    fps,
    config: { damping: 15, mass: 0.8 },
    durationInFrames: transitionFrames,
  });

  // Exit animation (starts near the end)
  const exitStart = durationInFrames - transitionFrames;
  const exitProgress = spring({
    frame: frame - exitStart,
    fps,
    config: { damping: 15, mass: 0.8 },
    durationInFrames: transitionFrames,
  });

  const sign = direction === "right" ? 1 : -1;
  const entranceX = interpolate(entranceProgress, [0, 1], [sign * 100, 0]);
  const exitX = interpolate(exitProgress, [0, 1], [0, -sign * 100]);

  const translateX = frame < exitStart ? entranceX : exitX;

  return (
    <AbsoluteFill
      style={{
        transform: `translateX(${translateX}%)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
