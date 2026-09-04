import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { SNAPPY } from "../../lib/spring-presets";
import { fontFamilies } from "../../design-tokens/fonts";
import { BrandPill } from "../../components/BrandCard";
import {
  CONDITION_COLORS,
  type ConditionCode,
  type WeatherChipProps,
} from "../../lib/social-props";
import { SURFACES, TYPE, colors, conditionInk, tileStyle } from "../../../../shared/social-brand";

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
  /** Card height — the type inside scales with it so ten rivers still fit. */
  height?: number;
}

const LIGHT = SURFACES.light;
const RAIN_BLUE = "#2563EB";

/** Simple SVG weather glyph — no emoji, so it renders the same in any Chromium
 *  (the GH Actions render box has no color-emoji font). */
const WeatherIcon: React.FC<{ condition: string; size?: number }> = ({ condition, size = 58 }) => {
  const c = (condition || "").toLowerCase();
  const rainy = /rain|drizzle|thunder|storm|shower/.test(c);
  const snowy = /snow|sleet/.test(c);
  const cloudy = /cloud|overcast|mist|fog|haze|smoke/.test(c);
  const clear = /clear|sun/.test(c);

  const cloud = (fill: string) => (
    <g fill={fill} stroke={colors.neutral[900]} strokeWidth={2} strokeLinejoin="round">
      <circle cx={23} cy={35} r={11} />
      <circle cx={37} cy={29} r={14} />
      <circle cx={46} cy={37} r={10} />
      <rect x={19} y={35} width={29} height={13} rx={6.5} stroke="none" />
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
            stroke="#E5A000"
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r} fill="#FBBF24" stroke={colors.neutral[900]} strokeWidth={2} />
    </g>
  );

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block" }}>
      {rainy || snowy ? (
        <>
          {cloud(colors.neutral[300])}
          {[26, 34, 42].map((x) => (
            <line
              key={x}
              x1={x}
              y1={50}
              x2={x - 3}
              y2={58}
              stroke={snowy ? colors.primary[200] : RAIN_BLUE}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
        </>
      ) : cloudy ? (
        cloud(colors.neutral[200])
      ) : clear ? (
        sun(32, 32, 13)
      ) : (
        <>
          {sun(23, 23, 9)}
          {cloud(colors.neutral[200])}
        </>
      )}
    </svg>
  );
};

/**
 * Single river row for the digest / forecast reels — a white, ruled, shadowed
 * card from the social design system.
 *
 * - Daily digest (no `weather`): swatch + name on the left, condition pill and
 *   gauge reading on the right.
 * - Weekend forecast (`weather` present): name + condition pill on the left, a
 *   weather tile (icon + high/low + rain) on the right.
 */
export const RiverCard: React.FC<RiverCardProps> = ({
  riverName,
  conditionCode,
  gaugeHeightFt,
  weather,
  delay = 0,
  width = 960,
  height = 96,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const condition = CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;
  const k = Math.max(0.6, Math.min(1, height / 96));

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { ...SNAPPY, damping: 14 },
  });
  const translateX = interpolate(entrance, [0, 1], [60, 0]);

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
        transform: `translateX(${translateX}px)`,
        width,
        height,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: `0 ${Math.round(22 * k)}px 0 ${Math.round(20 * k)}px`,
        background: LIGHT.surface,
        border: `4px solid ${LIGHT.rule}`,
        borderRadius: 16,
        boxShadow: `6px 6px 0 ${LIGHT.shadow}`,
      }}
    >
      {/* Left: condition swatch + river name (+ condition pill on the forecast) */}
      <div style={{ display: "flex", alignItems: "center", gap: Math.round(16 * k), minWidth: 0 }}>
        <div
          style={{
            flexShrink: 0,
            width: Math.round(20 * k),
            height: Math.round(20 * k),
            borderRadius: "50%",
            backgroundColor: condition.solid,
            border: `3px solid ${LIGHT.chipRule}`,
          }}
        />
        <div
          style={{
            fontFamily: fontFamilies.display,
            fontSize: Math.round(TYPE.rowTitle.size * k),
            fontWeight: TYPE.rowTitle.weight,
            lineHeight: TYPE.rowTitle.lineHeight,
            color: LIGHT.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {riverName}
        </div>
        {weather ? (
          <BrandPill fill={condition.solid} size={Math.round(17 * k)}>
            {condition.label}
          </BrandPill>
        ) : null}
      </div>

      {/* Right */}
      {weather ? (
        <div
          style={{
            ...tileStyle("light"),
            display: "flex",
            alignItems: "center",
            gap: Math.round(12 * k),
            padding: `${Math.round(6 * k)}px ${Math.round(16 * k)}px`,
            flexShrink: 0,
          }}
        >
          <WeatherIcon condition={weather.condition} size={Math.round(50 * k)} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <span style={{ fontFamily: fontFamilies.display, fontSize: Math.round(28 * k), fontWeight: 650, color: LIGHT.ink, lineHeight: 1.05 }}>
              {temp}
            </span>
            <span
              style={{
                fontSize: Math.round(17 * k),
                fontWeight: 620,
                color: showRain ? RAIN_BLUE : LIGHT.inkMuted,
                whiteSpace: "nowrap",
              }}
            >
              {showRain ? `${weather.precipChance}% rain` : weather.condition}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: Math.round(16 * k), flexShrink: 0 }}>
          {gaugeHeightFt !== null && (
            <span style={{ fontFamily: fontFamilies.mono, fontSize: Math.round(22 * k), fontWeight: 650, color: LIGHT.inkMuted }}>
              {gaugeHeightFt.toFixed(1)} ft
            </span>
          )}
          <BrandPill fill={condition.solid} size={Math.round(20 * k)}>
            {condition.label}
          </BrandPill>
        </div>
      )}
    </div>
  );
};

/** Condition colour as text on the light surface (for a headline count). */
export const conditionTextColor = (code: ConditionCode) =>
  conditionInk((CONDITION_COLORS[code] ?? CONDITION_COLORS.unknown).solid);
