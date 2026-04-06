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
 * Slides in from right with condition-colored left border.
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
    config: SNAPPY,
  });

  const translateX = interpolate(entrance, [0, 1], [80, 0]);

  return (
    <div
      style={{
        opacity: entrance,
        transform: `translateX(${translateX}px)`,
        width,
        display: "flex",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/* Condition color bar */}
      <div
        style={{
          width: 8,
          alignSelf: "stretch",
          backgroundColor: condition.solid,
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
          padding: "18px 24px",
        }}
      >
        {/* River name */}
        <div
          style={{
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: 26,
            fontWeight: 600,
            color: "#fff",
          }}
        >
          {riverName}
        </div>

        {/* Badge + gauge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          {/* Condition badge pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              backgroundColor: condition.bg,
              padding: "6px 16px",
              borderRadius: 999,
              border: `1.5px solid ${condition.solid}`,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: condition.solid,
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

          {/* Gauge height */}
          {gaugeHeightFt !== null && (
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 20,
                color: "rgba(255,255,255,0.7)",
                fontWeight: 500,
              }}
            >
              {gaugeHeightFt.toFixed(1)} ft
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
