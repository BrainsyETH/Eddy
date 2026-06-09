import React from "react";
import {
  AbsoluteFill,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { Watermark } from "../../components/Watermark";
import { ENTRANCE, SNAPPY } from "../../lib/spring-presets";
import { REEL_SAFE, reelLoopOpacity } from "../../lib/reel-safe";
import {
  CONDITION_COLORS,
  getOtterVariant,
  type TrendReelProps,
} from "../../lib/social-props";
import { colors } from "../../design-tokens/colors";

const FPS = 30;
const CHART_WIDTH = 900;
const CHART_HEIGHT = 320;
const CHART_PADDING = 40;

const DIRECTION_META = {
  rising: { arrow: "▲", label: "Rising", color: "#10b981" },
  falling: { arrow: "▼", label: "Falling", color: "#f97316" },
  flat: { arrow: "—", label: "Steady", color: "#84cc16" },
} as const;

/**
 * 7-Day Trend reel — shows a sparkline of the last week's gauge readings for
 * the most-notable river, with a direction arrow and delta callout.
 *
 * 12s / 360 frames / 1080x1920.
 */
export const TrendReel: React.FC<TrendReelProps> = ({
  riverName,
  conditionCode,
  currentHeightFt,
  sevenDayFirstFt,
  sevenDayMinFt,
  sevenDayMaxFt,
  deltaFt,
  direction,
  series,
  dateLabel,
  format,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const condition = CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;
  const isPortrait = format === "portrait";
  const loopOpacity = isPortrait ? reelLoopOpacity(frame, durationInFrames) : 1;
  const meta = DIRECTION_META[direction];

  const titleEntrance = spring({ frame, fps, config: ENTRANCE });
  const riverEntrance = spring({ frame: frame - 10, fps, config: ENTRANCE });
  const dateEntrance = spring({ frame: frame - 20, fps, config: ENTRANCE });
  const chartEntrance = spring({ frame: frame - 30, fps, config: SNAPPY });
  // Reveal the sparkline line from left to right across frames 40-120.
  const sparklineReveal = interpolate(frame, [40, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const deltaEntrance = spring({
    frame: frame - 120,
    fps,
    config: { damping: 10, mass: 0.6, stiffness: 130 },
  });
  const deltaScale = interpolate(deltaEntrance, [0, 1], [0.85, 1]);
  const ctaEntrance = spring({
    frame: frame - 290,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 100 },
  });

  const deltaAbs = Math.abs(deltaFt).toFixed(1);
  const deltaSign = deltaFt > 0 ? "+" : deltaFt < 0 ? "−" : "";
  const range =
    sevenDayMinFt !== null && sevenDayMaxFt !== null
      ? `${sevenDayMinFt.toFixed(1)}–${sevenDayMaxFt.toFixed(1)} ft`
      : null;

  // Build normalized sparkline points (0..1 in both axes).
  const chartMinFt = sevenDayMinFt ?? 0;
  const chartMaxFt = sevenDayMaxFt ?? chartMinFt + 1;
  const ftRange = chartMaxFt - chartMinFt || 1;
  const validSeries = series.filter((p) => p.gaugeHeightFt !== null) as Array<{
    hoursAgo: number;
    gaugeHeightFt: number;
  }>;
  const minHoursAgo = validSeries.length > 0 ? validSeries[0].hoursAgo : -168;
  const hoursRange = validSeries.length > 0 ? 0 - minHoursAgo : 168;

  const points = validSeries.map((p) => {
    const x = ((p.hoursAgo - minHoursAgo) / (hoursRange || 1)) * (CHART_WIDTH - CHART_PADDING * 2) + CHART_PADDING;
    const y =
      CHART_HEIGHT -
      CHART_PADDING -
      ((p.gaugeHeightFt - chartMinFt) / ftRange) * (CHART_HEIGHT - CHART_PADDING * 2);
    return { x, y };
  });

  // SVG path with the reveal factor clamping how much of the line shows.
  const visibleCount = Math.max(2, Math.floor(points.length * sparklineReveal));
  const visiblePoints = points.slice(0, visibleCount);
  const pathD = visiblePoints.length > 0
    ? visiblePoints.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ")
    : "";
  // Area fill below the line.
  const areaD = visiblePoints.length > 0
    ? `${pathD} L ${visiblePoints[visiblePoints.length - 1].x} ${CHART_HEIGHT - CHART_PADDING} L ${visiblePoints[0].x} ${CHART_HEIGHT - CHART_PADDING} Z`
    : "";

  const lastPoint = visiblePoints[visiblePoints.length - 1];

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], opacity: loopOpacity }}>
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={(f) =>
          interpolate(f, [0, FPS, durationInFrames - FPS, durationInFrames], [0, 0.5, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          top: "35%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${meta.color}33 0%, transparent 65%)`,
          opacity: 0.5,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: isPortrait ? REEL_SAFE.top : 48,
          bottom: isPortrait ? REEL_SAFE.bottom : 48,
          left: isPortrait ? REEL_SAFE.left : 48,
          right: isPortrait ? REEL_SAFE.right : 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
        }}
      >
        {/* Title */}
        <div
          style={{
            opacity: titleEntrance,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 42 : 32,
            fontWeight: 500,
            color: colors.accent[400],
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          7-Day Trend
        </div>

        {/* River name */}
        <div
          style={{
            opacity: riverEntrance,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 76 : 56,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
            textShadow: `0 0 30px ${condition.glow}`,
            marginTop: -6,
          }}
        >
          {riverName}
        </div>

        {/* Date */}
        {dateLabel && (
          <div
            style={{
              opacity: dateEntrance,
              fontFamily: "'Geist Sans', system-ui, sans-serif",
              fontSize: isPortrait ? 28 : 22,
              color: "rgba(255,255,255,0.55)",
              marginTop: -12,
            }}
          >
            {dateLabel}
          </div>
        )}

        {/* Sparkline */}
        <div
          style={{
            opacity: chartEntrance,
            marginTop: 4,
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
            padding: "18px 12px",
          }}
        >
          <svg width={CHART_WIDTH} height={CHART_HEIGHT} style={{ display: "block" }}>
            {/* Baseline */}
            <line
              x1={CHART_PADDING}
              y1={CHART_HEIGHT - CHART_PADDING}
              x2={CHART_WIDTH - CHART_PADDING}
              y2={CHART_HEIGHT - CHART_PADDING}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={1}
            />
            {/* Area fill */}
            {areaD && <path d={areaD} fill={meta.color} fillOpacity={0.15} />}
            {/* Line */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke={meta.color}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 0 6px ${meta.color})` }}
              />
            )}
            {/* Current-point marker */}
            {lastPoint && (
              <circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r={10}
                fill={meta.color}
                style={{ filter: `drop-shadow(0 0 10px ${meta.color})` }}
              />
            )}
            {/* Axis labels */}
            {sevenDayFirstFt !== null && (
              <text
                x={CHART_PADDING}
                y={CHART_HEIGHT - 10}
                fill="rgba(255,255,255,0.4)"
                fontSize={18}
                fontFamily="'Geist Mono', monospace"
              >
                {`7d ago · ${sevenDayFirstFt.toFixed(1)} ft`}
              </text>
            )}
            {currentHeightFt !== null && (
              <text
                x={CHART_WIDTH - CHART_PADDING}
                y={CHART_HEIGHT - 10}
                fill="rgba(255,255,255,0.7)"
                fontSize={18}
                fontFamily="'Geist Mono', monospace"
                textAnchor="end"
              >
                {`Now · ${currentHeightFt.toFixed(1)} ft`}
              </text>
            )}
          </svg>
        </div>

        {/* Delta callout */}
        <div
          style={{
            opacity: deltaEntrance,
            transform: `scale(${deltaScale})`,
            display: "flex",
            alignItems: "center",
            gap: 16,
            backgroundColor: `${meta.color}22`,
            border: `2px solid ${meta.color}`,
            borderRadius: 999,
            padding: "14px 32px",
            boxShadow: `0 0 20px ${meta.color}66`,
            marginTop: 4,
          }}
        >
          <span
            style={{
              fontFamily: "'Fredoka', system-ui, sans-serif",
              fontSize: isPortrait ? 36 : 28,
              color: meta.color,
              fontWeight: 700,
            }}
          >
            {meta.arrow} {meta.label}
          </span>
          <span
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: isPortrait ? 32 : 24,
              color: "#fff",
              fontWeight: 600,
            }}
          >
            {deltaSign}{deltaAbs} ft
          </span>
        </div>

        {/* Range */}
        {range && (
          <div
            style={{
              opacity: deltaEntrance,
              fontFamily: "'Geist Sans', system-ui, sans-serif",
              fontSize: isPortrait ? 22 : 18,
              color: "rgba(255,255,255,0.5)",
              marginTop: -4,
            }}
          >
            Week range: {range}
          </div>
        )}

        {/* Eddy + CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginTop: 6,
          }}
        >
          <EddyMascot
            variant={getOtterVariant(conditionCode)}
            size={isPortrait ? 130 : 100}
            delay={120}
          />
          <span
            style={{
              opacity: ctaEntrance,
              fontFamily: "'Fredoka', system-ui, sans-serif",
              fontSize: isPortrait ? 28 : 22,
              color: meta.color,
              letterSpacing: 0.5,
            }}
          >
            Full 7-day chart at eddy.guide
          </span>
        </div>
      </div>

      <div style={{ opacity: interpolate(frame, [270, 300], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <Watermark format={isPortrait ? "portrait" : "landscape"} />
      </div>
    </AbsoluteFill>
  );
};
