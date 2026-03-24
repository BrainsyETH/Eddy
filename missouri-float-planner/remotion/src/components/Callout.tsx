import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";

interface CalloutProps {
  /** Text label */
  text: string;
  /** Position as percentage of container */
  x: number;
  y: number;
  /** Delay in frames before appearing */
  delay?: number;
  /** Arrow direction pointing toward the UI element */
  arrow?: "left" | "right" | "up" | "down";
}

/**
 * Animated annotation callout that points to a UI element.
 * Springs in with staggered timing.
 */
export const Callout: React.FC<CalloutProps> = ({
  text,
  x,
  y,
  delay = 0,
  arrow = "down",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, mass: 0.6, stiffness: 120 },
  });

  const scale = interpolate(progress, [0, 1], [0.5, 1]);
  const opacity = progress;

  const arrowChar =
    arrow === "down" ? "\u25BC" :
    arrow === "up" ? "\u25B2" :
    arrow === "left" ? "\u25C0" :
    "\u25B6";

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
      }}
    >
      <div
        className="px-4 py-2 rounded-lg border-2 border-accent-500 bg-accent-500 text-white text-sm font-semibold whitespace-nowrap"
        style={{
          fontFamily: "'Geist Sans', system-ui, sans-serif",
          boxShadow: "3px 3px 0 #E5573F",
        }}
      >
        {text}
      </div>
      <span className="text-accent-500 text-lg -mt-1">{arrowChar}</span>
    </div>
  );
};
