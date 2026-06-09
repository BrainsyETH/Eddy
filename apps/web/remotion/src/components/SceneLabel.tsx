import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";

interface SceneLabelProps {
  /** Feature name shown in the label */
  label: string;
  /** Delay before appearing, in frames */
  delay?: number;
  /** Format affects positioning and size */
  format?: "landscape" | "portrait";
}

/**
 * Animated lower-third scene label.
 * Slides in from the left with a colored accent bar.
 */
export const SceneLabel: React.FC<SceneLabelProps> = ({
  label,
  delay = 8,
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Entrance: slide in from left
  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, mass: 0.6, stiffness: 140 },
  });

  // Exit: fade out near end of scene
  const exit = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames - 10],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const translateX = interpolate(entrance, [0, 1], [-120, 0]);

  return (
    <div
      className="absolute z-30"
      style={{
        left: format === "portrait" ? 24 : 48,
        top: format === "portrait" ? 60 : 48,
        opacity: entrance * exit,
        transform: `translateX(${translateX}px)`,
      }}
    >
      <div className="flex items-center gap-3">
        {/* Accent bar */}
        <div
          className="rounded-full"
          style={{
            width: 4,
            height: format === "portrait" ? 28 : 32,
            background: "#F07052",
          }}
        />
        {/* Label text */}
        <span
          className="font-semibold tracking-wide text-primary-800"
          style={{
            fontFamily: "'Geist Sans', system-ui, sans-serif",
            fontSize: format === "portrait" ? 16 : 18,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};
