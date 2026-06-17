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
  type WeatherChipProps,
} from "../../lib/social-props";

interface RiverCardProps {
  riverName: string;
  conditionCode: ConditionCode;
  gaugeHeightFt: number | null;
  /** Optional forecast chip (Weekend Forecast variant) — drives the weather block. */
  weather?: WeatherChipProps | null;
  /** Delay before slide-in animation (frames) */
  delay?: number;
  /** Card width */
  width?: number;
}

const FREDOKA = "'Fredoka', system-ui, sans-serif";
const GEIST = "'Geist Sans', system-ui, sans-serif";
const MONO = "'Geist Mono', 'SF Mono', monospace";

/** Simple SVG weather glyph — no emoji, so it renders the same in any Chromium
 *  (the GH Actions render box has no color-emoji font). */
const WeatherIcon: React.FC<{ condition: string; size?: number }> = ({ condition, size = 58 }) => {
  const c = (condition || "").toLowerCase();
  const rainy = /rain|drizzle|thunder|storm|shower/.test(c);
  const snowy = /snow|sleet/.test(c);
  const cloudy = /cloud|overcast|mist|fog|haze|smoke/.test(c);
  const clear = /clear|sun/.test(c);

  const cloud = (fill: string) => (
    <g fill={fill}>
      <circle cx={23} cy={35} r={11} />
      <circle cx={37} cy={29} r={14} />
      <circle cx={46} cy={37} r={10} />
      <rect x={19} y={35} width={29} height={13} rx={6.5} />
    </g>
  );
  const sun = (cx: number, cy: number, r: number) => (
    <g>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const rad = (a * Math.PI) / 180;
        return (
          <line
            key={a}
            x1={cx + Math.cos(rad) * (r + 4)}
            y1={cy + Math.sin(rad) * (r + 4)}
            x2={cx + Math.cos(rad) * (r + 11)}
            y2={cy + Math.sin(rad) * (r + 11)}
            stroke="#fbbf24"
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r} fill="#fbbf24" />
    </g>
  );

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block" }}>
      {rainy || snowy ? (
        <>
          {cloud("#9aa6b2")}
          {[26, 34, 42].map((x) => (
            <line
              key={x}
              x1={x}
              y1={50}
              x2={x - 3}
              y2={58}
              stroke={snowy ? "#e0f2fe" : "#60a5fa"}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
        </>
      ) : cloudy ? (
        cloud("#cbd5e1")
      ) : clear ? (
        sun(32, 32, 13)
      ) : (
        <>
          {sun(23, 23, 9)}
          {cloud("#cbd5e1")}
        </>
      )}
    </svg>
  );
};

/**
 * Single river card for the digest / forecast reels.
 *
 * - Daily digest (no `weather`): name + gauge on the left, condition badge right.
 * - Weekend forecast (`weather` present): name + condition + gauge on the left,
 *   a prominent weather block (icon + high/low + rain) on the right.
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

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { ...SNAPPY, damping: 14 },
  });

  const translateX = interpolate(entrance, [0, 1], [80, 0]);
  const rotate = interpolate(entrance, [0, 1], [-2, 0]);
  const scale = interpolate(entrance, [0, 1], [0.95, 1]);

  const temp =
    weather && weather.highF !== null && weather.lowF !== null
      ? `${weather.highF}° / ${weather.lowF}°`
      : weather && weather.highF !== null
        ? `${weather.highF}°`
        : "";
  const showRain = !!weather && weather.precipChance >= 40;

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
          padding: "20px 30px",
        }}
      >
        {weather ? (
          <>
            {/* Left: name + condition + gauge */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontFamily: FREDOKA, fontSize: 40, fontWeight: 600, color: "#fff" }}>
                {riverName}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: "50%",
                    backgroundColor: condition.solid,
                    boxShadow: `0 0 6px ${condition.solid}`,
                  }}
                />
                <span style={{ fontFamily: FREDOKA, fontSize: 26, fontWeight: 600, color: condition.solid }}>
                  {condition.label}
                </span>
                {gaugeHeightFt !== null && (
                  <span style={{ fontFamily: MONO, fontSize: 22, color: "rgba(255,255,255,0.5)" }}>
                    · {gaugeHeightFt.toFixed(1)} ft
                  </span>
                )}
              </div>
            </div>

            {/* Right: prominent weather block */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 16,
                padding: "12px 22px",
                flexShrink: 0,
              }}
            >
              <WeatherIcon condition={weather.condition} size={58} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <span style={{ fontFamily: FREDOKA, fontSize: 34, fontWeight: 600, color: "#fff", lineHeight: 1.05 }}>
                  {temp}
                </span>
                <span
                  style={{
                    fontFamily: GEIST,
                    fontSize: 20,
                    fontWeight: 500,
                    color: showRain ? "#60a5fa" : "rgba(255,255,255,0.55)",
                  }}
                >
                  {showRain ? `${weather.precipChance}% rain` : weather.condition}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Left: River name + gauge height */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <div style={{ fontFamily: FREDOKA, fontSize: 40, fontWeight: 600, color: "#fff" }}>
                {riverName}
              </div>
              {gaugeHeightFt !== null && (
                <span style={{ fontFamily: MONO, fontSize: 24, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                  {gaugeHeightFt.toFixed(1)} ft
                </span>
              )}
            </div>

            {/* Right: Condition badge */}
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
              <span style={{ fontFamily: FREDOKA, fontSize: 28, fontWeight: 600, color: condition.solid }}>
                {condition.label}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
