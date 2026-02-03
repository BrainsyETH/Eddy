import React from "react";
import { interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../lib/constants";

interface GaugeMeterProps {
  label: string;
  value: number; // 0-100
  status: "optimal" | "low" | "high" | "too_low" | "dangerous";
  delay?: number;
}

const STATUS_COLORS = {
  optimal: "#22C55E",
  low: "#84CC16",
  high: "#F97316",
  too_low: "#9CA3AF",
  dangerous: "#EF4444",
};

const STATUS_LABELS = {
  optimal: "Optimal",
  low: "Okay",
  high: "High",
  too_low: "Too Low",
  dangerous: "Flood",
};

/**
 * Animated gauge meter bar
 */
export const GaugeMeter: React.FC<GaugeMeterProps> = ({
  label,
  value,
  status,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Spring animation for the bar fill
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, mass: 1, stiffness: 80 },
  });

  const fillWidth = interpolate(progress, [0, 1], [0, value]);
  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const color = STATUS_COLORS[status];
  const statusLabel = STATUS_LABELS[status];

  return (
    <div
      style={{
        opacity,
        marginBottom: 20,
      }}
    >
      {/* Label row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            color: COLORS.white,
            fontSize: 18,
            fontFamily: FONTS.body,
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        <span
          style={{
            color,
            fontSize: 14,
            fontFamily: FONTS.body,
            fontWeight: 600,
            padding: "4px 12px",
            backgroundColor: `${color}20`,
            borderRadius: 20,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Gauge bar */}
      <div
        style={{
          width: "100%",
          height: 12,
          backgroundColor: `${COLORS.white}15`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${fillWidth}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: 6,
            boxShadow: `0 0 10px ${color}50`,
          }}
        />
      </div>
    </div>
  );
};
