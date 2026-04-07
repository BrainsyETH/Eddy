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
  /** Condition glow color for bloom effect */
  conditionGlow?: string;
  /** Delay before fill animation starts (in frames) */
  delay?: number;
  /** Bar width */
  width?: number;
  /** Bar height */
  height?: number;
}

const TICK_MARKS = [0.2, 0.4, 0.6, 0.8];

/**
 * Animated vertical gauge bar with glassmorphism, tick marks, and glow.
 * The fill rises from 0 to the current reading via spring animation.
 */
export const GaugeBar: React.FC<GaugeBarProps> = ({
  currentHeight,
  optimalMin,
  optimalMax,
  maxHeight: maxHeightProp,
  conditionColor,
  conditionGlow = "transparent",
  delay = 30,
  width = 85,
  height = 420,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const maxHeight =
    maxHeightProp ?? Math.max(currentHeight * 1.3, optimalMax * 1.2, 5);

  const fillProgress = spring({
    frame: frame - delay,
    fps,
    config: SMOOTH,
  });

  const fillFraction = (currentHeight / maxHeight) * fillProgress;
  const optMinFraction = optimalMin / maxHeight;
  const optMaxFraction = optimalMax / maxHeight;

  const displayHeight = interpolate(fillProgress, [0, 1], [0, currentHeight]);

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
      }}
    >
      {/* Tick marks */}
      {TICK_MARKS.map((tick) => (
        <div
          key={tick}
          style={{
            position: "absolute",
            bottom: `${tick * 100}%`,
            left: 0,
            width: 10,
            height: 1,
            backgroundColor: "rgba(255,255,255,0.15)",
          }}
        />
      ))}

      {/* Optimal range highlight band */}
      <div
        style={{
          position: "absolute",
          bottom: `${optMinFraction * 100}%`,
          height: `${(optMaxFraction - optMinFraction) * 100}%`,
          width: "100%",
          backgroundColor: "rgba(255,255,255,0.05)",
          borderTop: "1px dashed rgba(255,255,255,0.2)",
          borderBottom: "1px dashed rgba(255,255,255,0.2)",
        }}
      />

      {/* Animated fill with glow */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          height: `${fillFraction * 100}%`,
          background: `linear-gradient(to top, ${conditionColor}, ${conditionColor}aa)`,
          boxShadow: `0 0 40px ${conditionGlow}`,
          borderRadius: "0 0 18px 18px",
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
          padding: "6px 12px",
          borderRadius: 10,
          fontFamily: "'Geist Mono', monospace",
          fontSize: 18,
          fontWeight: 700,
          whiteSpace: "nowrap",
          opacity: fillProgress,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
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
          color: "rgba(255,255,255,0.5)",
          fontSize: 11,
          fontFamily: "'Geist Sans', system-ui, sans-serif",
          whiteSpace: "nowrap",
          paddingLeft: 8,
          letterSpacing: 0.5,
        }}
      >
        optimal
      </div>
    </div>
  );
};
