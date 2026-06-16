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
  formatWeatherChipLabel,
  type ConditionCode,
  type WeatherChipProps,
} from "../../lib/social-props";

interface RiverCardProps {
  riverName: string;
  conditionCode: ConditionCode;
  gaugeHeightFt: number | null;
  /** Optional forecast chip (Weekend Forecast variant). */
  weather?: WeatherChipProps | null;
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
  weather,
  delay = 0,
  width = 700,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const condition = CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;
  const weatherLabel = formatWeatherChipLabel(weather);

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
          width: 8,
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
          padding: "22px 32px",
        }}
      >
        {/* Left: River name + gauge height, with an optional forecast sub-line */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <div
              style={{
                fontFamily: "'Fredoka', system-ui, sans-serif",
                fontSize: 40,
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
                  fontSize: 24,
                  color: "rgba(255,255,255,0.5)",
                  fontWeight: 500,
                }}
              >
                {gaugeHeightFt.toFixed(1)} ft
              </span>
            )}
          </div>
          {weatherLabel && (
            <span
              style={{
                fontFamily: "'Geist Sans', system-ui, sans-serif",
                fontSize: 22,
                color: "rgba(255,255,255,0.55)",
                fontWeight: 500,
              }}
            >
              {weatherLabel}
            </span>
          )}
        </div>

        {/* Right: Condition badge (status CTA) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            backgroundColor: condition.bg,
            padding: "10px 22px",
            borderRadius: 999,
            border: `1.5px solid ${condition.solid}`,
            boxShadow: `0 0 10px ${condition.glow}`,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              backgroundColor: condition.solid,
              boxShadow: `0 0 6px ${condition.solid}`,
            }}
          />
          <span
            style={{
              fontFamily: "'Fredoka', system-ui, sans-serif",
              fontSize: 28,
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
