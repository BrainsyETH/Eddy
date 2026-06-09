import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";

interface FeatureHighlightProps {
  /** Position and size as percentages of container */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Delay in frames */
  delay?: number;
  /** Border color */
  color?: string;
}

/**
 * Animated border highlight that draws around a region of a screenshot.
 */
export const FeatureHighlight: React.FC<FeatureHighlightProps> = ({
  x,
  y,
  width,
  height,
  delay = 0,
  color = "#F07052",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, mass: 0.6 },
  });

  const scale = interpolate(progress, [0, 1], [0.95, 1]);
  const opacity = progress;

  // Pulsing glow
  const pulse = Math.sin((frame - delay) / 8) * 0.15 + 0.85;

  return (
    <div
      className="absolute rounded-lg pointer-events-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
        border: `3px solid ${color}`,
        boxShadow: `0 0 20px ${color}40, inset 0 0 20px ${color}10`,
        opacity: opacity * pulse,
        transform: `scale(${scale})`,
      }}
    />
  );
};
