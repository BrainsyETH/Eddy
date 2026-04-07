import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { SMOOTH } from "../lib/spring-presets";

interface GaugeBarProps {
  /** Current gauge reading in feet */
  currentHeight: number;
  /** Bottom of optimal range */
  optimalMin: number;
  /** Top of optimal range */
  optimalMax: number;
  /** Max value for the gauge scale (auto-calculated if omitted) */
  maxHeight?: number;
  /** Condition accent color */
  conditionColor: string;
  /** Delay before fill animation starts (in frames) */
  delay?: number;
  /** Bar width */
  width?: number;
  /** Bar height */
  height?: number;
}

/**
 * Animated vertical gauge bar with optimal range highlight.
 * The fill rises from 0 to the current reading via spring animation.
 */
export const GaugeBar: React.FC<GaugeBarProps> = ({
  currentHeight,
  optimalMin,
  optimalMax,
  maxHeight: maxHeightProp,
  conditionColor,
  delay = 30,
  width = 80,
  height = 400,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Auto-scale: max is at least 1.3x the current reading or 1.2x optimalMax
  const maxHeight =
    maxHeightProp ?? Math.max(currentHeight * 1.3, optimalMax * 1.2, 5);

  // Spring-animated fill progress (0 → 1)
  const fillProgress = spring({
    frame: frame - delay,
    fps,
    config: SMOOTH,
  });

  const fillFraction = (currentHeight / maxHeight) * fillProgress;
  const optMinFraction = optimalMin / maxHeight;
  const optMaxFraction = optimalMax / maxHeight;

  // Animated height reading counter
  const displayHeight = interpolate(fillProgress, [0, 1], [0, currentHeight]);

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.08)",
        border: "2px solid rgba(255,255,255,0.15)",
      }}
    >
      {/* Optimal range highlight band */}
      <div
        style={{
          position: "absolute",
          bottom: `${optMinFraction * 100}%`,
          height: `${(optMaxFraction - optMinFraction) * 100}%`,
          width: "100%",
          backgroundColor: "rgba(5,150,105,0.2)",
          borderTop: "1px dashed rgba(5,150,105,0.5)",
          borderBottom: "1px dashed rgba(5,150,105,0.5)",
        }}
      />

      {/* Animated fill */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          height: `${fillFraction * 100}%`,
          background: `linear-gradient(to top, ${conditionColor}, ${conditionColor}cc)`,
          borderRadius: "0 0 10px 10px",
          transition: "none",
        }}
      />

      {/* Current reading label */}
      <div
        style={{
          position: "absolute",
          bottom: `${fillFraction * 100}%`,
          left: "50%",
          transform: "translate(-50%, 50%)",
          backgroundColor: conditionColor,
          color: "#fff",
          padding: "4px 10px",
          borderRadius: 8,
          fontFamily: "'Fredoka', system-ui, sans-serif",
          fontSize: 18,
          fontWeight: 600,
          whiteSpace: "nowrap",
          opacity: fillProgress,
        }}
      >
        {displayHeight.toFixed(1)} ft
      </div>

      {/* Optimal range label */}
      <div
        style={{
          position: "absolute",
          right: -4,
          bottom: `${((optMinFraction + optMaxFraction) / 2) * 100}%`,
          transform: "translateX(100%) translateY(50%)",
          color: "rgba(255,255,255,0.6)",
          fontSize: 11,
          fontFamily: "'Geist Sans', system-ui, sans-serif",
          whiteSpace: "nowrap",
          paddingLeft: 8,
        }}
      >
        optimal
      </div>
    </div>
  );
};
