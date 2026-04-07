import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { SNAPPY } from "../../lib/spring-presets";
import {
  CONDITION_COLORS,
  type ConditionCode,
} from "../../lib/social-props";

interface RiverCardProps {
  riverName: string;
  conditionCode: ConditionCode;
  gaugeHeightFt: number | null;
  /** Delay before slide-in animation (frames) */
  delay?: number;
  /** Card width */
  width?: number;
}

/**
 * Single river condition card for the digest reel.
 * Glassmorphism card with condition-colored left border.
 * Cascade animation: slide in + slight rotation + scale.
 * Data hierarchy: name + gauge on left, status badge on right.
 */
export const RiverCard: React.FC<RiverCardProps> = ({
  riverName,
  conditionCode,
  gaugeHeightFt,
  delay = 0,
  width = 700,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const condition = CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { ...SNAPPY, damping: 14 },
  });

  const translateX = interpolate(entrance, [0, 1], [80, 0]);
  const rotate = interpolate(entrance, [0, 1], [-2, 0]);
  const scale = interpolate(entrance, [0, 1], [0.95, 1]);

  return (
    <div
      style={{
        opacity: entrance,
        transform: `translateX(${translateX}px) rotate(${rotate}deg) scale(${scale})`,
        width,
        display: "flex",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.05)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Condition color bar */}
      <div
        style={{
          width: 6,
          alignSelf: "stretch",
          backgroundColor: condition.solid,
          boxShadow: `0 0 8px ${condition.glow}`,
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
        }}
      >
        {/* Left: River name + gauge height (identity group) */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: "'Fredoka', system-ui, sans-serif",
              fontSize: 24,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            {riverName}
          </div>
          {gaugeHeightFt !== null && (
            <span
              style={{
                fontFamily: "'Geist Mono', 'SF Mono', monospace",
                fontSize: 16,
                color: "rgba(255,255,255,0.5)",
                fontWeight: 500,
              }}
            >
              {gaugeHeightFt.toFixed(1)} ft
            </span>
          )}
        </div>

        {/* Right: Condition badge (status CTA) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            backgroundColor: condition.bg,
            padding: "6px 16px",
            borderRadius: 999,
            border: `1.5px solid ${condition.solid}`,
            boxShadow: `0 0 10px ${condition.glow}`,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: condition.solid,
              boxShadow: `0 0 6px ${condition.solid}`,
            }}
          />
          <span
            style={{
              fontFamily: "'Fredoka', system-ui, sans-serif",
              fontSize: 18,
              fontWeight: 600,
              color: condition.solid,
            }}
          >
            {condition.label}
          </span>
        </div>
      </div>
    </div>
  );
};
