import React from "react";
import {
  Audio,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { ReelPage } from "../../components/ReelPage";
import { ReelMasthead } from "../../components/ReelMasthead";
import { ReelDock } from "../../components/ReelDock";
import { BrandCard, BrandPill, StatTile } from "../../components/BrandCard";
import { REEL_SAFE, reelLoopOpacity } from "../../lib/reel-safe";
import { fontFamilies } from "../../design-tokens/fonts";
import {
  DIRECTION_META,
  formatWeatherChipLabel,
  getOtterVariant,
  type TrendReelProps,
} from "../../lib/social-props";
import { CTA, LABELS, SURFACES, colors, conditionInk, hexAlpha } from "../../../../shared/social-brand";

const FPS = 30;
const LIGHT = SURFACES.light;
const CARD_W = 1080 - REEL_SAFE.left - REEL_SAFE.right;
const CHART_WIDTH = CARD_W - 2 * 5 - 2 * 18; // inside the card's rule + padding
const CHART_HEIGHT = 330;
const CHART_PADDING = 40;

/**
 * 7-Day Trend reel — the last week's gauge readings as a sparkline in a card,
 * with the direction pill and the delta, on the shared social page.
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
  weather,
  dateLabel,
  followCta,
  format,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const isPortrait = format === "portrait";
  const weatherLabel = formatWeatherChipLabel(weather);
  const loopOpacity = isPortrait ? reelLoopOpacity(frame, durationInFrames) : 1;
  const meta = DIRECTION_META[direction];
  const mastheadTop = isPortrait ? REEL_SAFE.top : 48;
  const stageTop = mastheadTop + 200;

  // CTA enters ~70 frames before the end so it lands late regardless of the
  // duration Root's calculateMetadata chooses (360 default, tighter otherwise).
  const ctaStart = Math.max(60, durationInFrames - 70);

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
    frame: frame - ctaStart,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 100 },
  });

  const deltaAbs = Math.abs(deltaFt).toFixed(1);
  const deltaSign = deltaFt > 0 ? "+" : deltaFt < 0 ? "−" : "";
  const range =
    sevenDayMinFt !== null && sevenDayMaxFt !== null
      ? `${sevenDayMinFt.toFixed(1)}–${sevenDayMaxFt.toFixed(1)}`
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

  // SVG path with the reveal factor clamping how much of the line shows. The
  // whole week is ghosted underneath from frame 0, so the thumbnail is a
  // complete chart and the reveal inks it in rather than drawing on nothing.
  const visibleCount = Math.max(2, Math.floor(points.length * sparklineReveal));
  const visiblePoints = points.slice(0, visibleCount);
  const toPath = (list: typeof points) =>
    list.length > 0 ? list.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ") : "";
  const ghostD = toPath(points);
  const pathD = toPath(visiblePoints);
  // Area fill below the line.
  const areaD = visiblePoints.length > 0
    ? `${pathD} L ${visiblePoints[visiblePoints.length - 1].x} ${CHART_HEIGHT - CHART_PADDING} L ${visiblePoints[0].x} ${CHART_HEIGHT - CHART_PADDING} Z`
    : "";

  const lastPoint = visiblePoints[visiblePoints.length - 1];
  const lineInk = conditionInk(meta.color);

  return (
    <ReelPage opacity={loopOpacity}>
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={(f) =>
          interpolate(f, [0, FPS, durationInFrames - FPS, durationInFrames], [0, 0.5, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      <div style={{ position: "absolute", top: mastheadTop, left: REEL_SAFE.left, right: REEL_SAFE.right, zIndex: 10 }}>
        <ReelMasthead
          label={LABELS.trend}
          title={riverName}
          subtitle={[dateLabel, weatherLabel].filter(Boolean).join(" · ") || undefined}
        />
      </div>

      {/* Chart card — visible from frame 0 (the thumbnail); the line draws on. */}
      <div style={{ position: "absolute", top: stageTop, left: REEL_SAFE.left, width: CARD_W }}>
        <BrandCard>
          <svg width={CHART_WIDTH} height={CHART_HEIGHT} style={{ display: "block" }}>
            {/* Baseline + a faint mid gridline */}
            <line x1={CHART_PADDING} y1={CHART_HEIGHT - CHART_PADDING} x2={CHART_WIDTH - CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} stroke={LIGHT.divider} strokeWidth={3} />
            <line x1={CHART_PADDING} y1={CHART_PADDING} x2={CHART_WIDTH - CHART_PADDING} y2={CHART_PADDING} stroke={LIGHT.divider} strokeWidth={2} strokeDasharray="6 8" />
            {/* The whole week, ghosted — the shape is there from frame 0 */}
            {ghostD && (
              <path d={ghostD} fill="none" stroke={LIGHT.divider} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 12" />
            )}
            {/* Area fill */}
            {areaD && <path d={areaD} fill={hexAlpha(meta.color, 0.18)} />}
            {/* Line */}
            {pathD && (
              <path d={pathD} fill="none" stroke={lineInk} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {/* Current-point marker */}
            {lastPoint && (
              <circle cx={lastPoint.x} cy={lastPoint.y} r={12} fill={meta.color} stroke={colors.neutral[900]} strokeWidth={4} />
            )}
            {/* Axis labels */}
            {sevenDayFirstFt !== null && (
              <text x={CHART_PADDING} y={CHART_HEIGHT - 10} fill={LIGHT.inkMuted} fontSize={18} fontWeight={650} fontFamily={fontFamilies.mono}>
                {`7d ago · ${sevenDayFirstFt.toFixed(1)} ft`}
              </text>
            )}
            {currentHeightFt !== null && (
              <text x={CHART_WIDTH - CHART_PADDING} y={CHART_HEIGHT - 10} fill={LIGHT.ink} fontSize={18} fontWeight={700} fontFamily={fontFamilies.mono} textAnchor="end">
                {`Now · ${currentHeightFt.toFixed(1)} ft`}
              </text>
            )}
          </svg>

          {/* Direction + delta — the one-line verdict */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginTop: 10,
              padding: "0 5px",
              opacity: deltaEntrance,
              transform: `scale(${deltaScale})`,
              transformOrigin: "left center",
            }}
          >
            <BrandPill fill={meta.color} size={26}>
              {meta.arrow} {meta.label}
            </BrandPill>
            <span style={{ fontFamily: fontFamilies.mono, fontSize: 34, fontWeight: 700, color: LIGHT.ink }}>
              {deltaSign}{deltaAbs} ft
            </span>
            <span style={{ fontSize: 22, fontWeight: 600, color: LIGHT.inkMuted }}>over 7 days</span>
          </div>
        </BrandCard>
      </div>

      {/* Eddy's condition mood, in the gap between the chart and the dock. */}
      <div style={{ position: "absolute", top: isPortrait ? stageTop + 500 : stageTop + 470, left: REEL_SAFE.left + 30 }}>
        <EddyMascot variant={getOtterVariant(conditionCode)} size={isPortrait ? 200 : 120} delay={120} />
      </div>

      <ReelDock
        bottom={isPortrait ? undefined : 88}
        followBottom={isPortrait ? undefined : 48}
        tiles={[
          <StatTile key="now" value={currentHeightFt !== null ? currentHeightFt.toFixed(1) : "—"} unit="FT" label="Right now" />,
          <StatTile key="delta" value={`${deltaSign}${deltaAbs}`} unit="FT" label="7-day change" color={meta.color} />,
          <StatTile key="range" value={range ?? "—"} unit={range ? "FT" : undefined} label="Week range" compact />,
        ]}
        detail={`${meta.label} over the last 7 days`}
        cta={CTA.chart}
        ctaProgress={ctaEntrance}
        followCta={followCta}
      />
    </ReelPage>
  );
};
