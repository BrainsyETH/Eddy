import React from "react";
import {
  Audio,
  Img,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
} from "remotion";
import { EddyMascot, eddyVariantFile } from "../../components/EddyMascot";
import { GaugeBar, gaugeFillModel } from "../../components/GaugeBar";
import { ReelPage } from "../../components/ReelPage";
import { ReelMasthead } from "../../components/ReelMasthead";
import { ReelDock } from "../../components/ReelDock";
import { BrandCard, BrandPill, StatTile } from "../../components/BrandCard";
import { ENTRANCE, SNAPPY } from "../../lib/spring-presets";
import { REEL_SAFE, reelLoopOpacity } from "../../lib/reel-safe";
import { fontFamilies } from "../../design-tokens/fonts";
import {
  CONDITION_COLORS,
  getOtterVariant,
  warningCopy,
  recoveryCopy,
  type GaugeAnimationProps,
} from "../../lib/social-props";
import {
  CTA,
  LABELS,
  MEDIA_SCRIM,
  SURFACES,
  TYPE,
  colors,
  conditionInk,
  type SocialTone,
} from "../../../../shared/social-brand";

const FPS = 30;

/**
 * Single-river gauge reel — the "Eddy Says" report, and the high-water /
 * all-clear alert family.
 *
 * Default highlight: 12 seconds (360 frames @ 30fps). 1080x1920 portrait.
 * Alert / recovery reels run tighter (240 frames / 8s) via Root's
 * calculateMetadata; the internal timeline below scales off durationInFrames.
 *
 * Tone: the report renders on the light page like every editorial reel. The
 * alert family renders on the SEVERITY SURFACE — the sanctioned dark tone,
 * washed toward the condition colour — because a cream card reads calmer than
 * high water deserves. Same masthead, same cards, same dock either way.
 *
 * Timeline (default 360f; alert 240f is proportionally tighter):
 *   frame 0:  masthead, instrument panel and dock already visible (thumbnail)
 *   0-30:     Title + condition pill settle
 *  30-60:     Gauge fills, Eddy bounces in
 *  40-60:     Quote fades in and holds
 *  ~D-70:     CTA fades in (D = durationInFrames)
 *  D-12→D:    Loop-out handled by reelLoopOpacity wrapper
 */
export const GaugeAnimation: React.FC<GaugeAnimationProps> = ({
  riverName,
  conditionCode,
  gaugeHeightFt,
  optimalMin,
  optimalMax,
  levelHigh,
  levelDangerous,
  quoteText,
  dateLabel,
  warningMode,
  previousCondition,
  eyebrow,
  quoteForward,
  backgroundUrl,
  riseText,
  recovery,
  followCta,
  series,
  stationLabel,
  flowText,
  format,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const condition = CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;
  const previous = previousCondition
    ? CONDITION_COLORS[previousCondition] ?? CONDITION_COLORS.unknown
    : null;
  const isPortrait = format === "portrait";

  // Recovery is mutually exclusive with warningMode; if both are set, warning
  // wins (the more urgent framing). `alertMode` = either elevated-water reel.
  const isRecovery = !!recovery && !warningMode;
  const alertMode = !!warningMode || isRecovery;
  const tone: SocialTone = alertMode ? "dark" : "light";
  const s = SURFACES[tone];

  // Canonical copy shared with the caption + OG cover (shared/condition-copy.ts)
  // so all three surfaces read identically. Recovery uses the "ALL CLEAR" copy.
  const { severityLabel, cta: alertCta } = isRecovery
    ? recoveryCopy(conditionCode, riverName)
    : warningCopy(conditionCode, riverName);

  // Pulsing chrome — warning only. Recovery is calm (no pulse → steady 1).
  const warningPulse = warningMode ? 0.75 + 0.25 * Math.sin(frame / 10) : 1;

  // Global fade for seamless Reels auto-loop (portrait only; square/
  // landscape previews in Studio keep constant opacity).
  const loopOpacity = isPortrait ? reelLoopOpacity(frame, durationInFrames) : 1;

  // ─── Proportional timeline ───────────────────────────────
  const ctaStart = Math.max(60, durationInFrames - 70);
  // Everything a viewer needs is on screen at frame 0 (the grid thumbnail):
  // the entrances below only SETTLE elements by a few px. The animation the
  // reel is for is the gauge filling and the numeral counting.
  const settle = spring({ frame, fps, config: ENTRANCE });
  const settleY = interpolate(settle, [0, 1], [14, 0]);
  const pillEntrance = spring({ frame: frame - 20, fps, config: SNAPPY });
  const pillX = interpolate(pillEntrance, [0, 1], [40, 0]);
  const quoteSettle = spring({ frame: frame - 12, fps, config: ENTRANCE });
  const quoteY = interpolate(quoteSettle, [0, 1], [18, 0]);
  const ctaEntrance = spring({
    frame: frame - ctaStart,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 100 },
  });

  // Shared fill model — the big counting numeral reads the SAME math as the
  // bar's fill (see GaugeBar.gaugeFillModel) so the two can never disagree.
  const RISE_START = 15;
  const RISE_DURATION = 90;
  const fill = gaugeFillModel(frame, fps, {
    currentHeight: gaugeHeightFt,
    series,
    levelHigh: optimalMax ?? levelHigh,
    riseStartFrame: RISE_START,
    riseDurationFrames: RISE_DURATION,
    delay: 30,
  });
  const crossedHigh = fill.crossingFrame != null && frame >= fill.crossingFrame;

  const mastheadTop = isPortrait ? REEL_SAFE.top : 48;
  const stageTop = mastheadTop + 200;
  const stageH = isPortrait ? 1240 - stageTop : 1080 - 48 - 240 - stageTop;
  const accentInk = conditionInk(condition.solid, tone);

  const label = alertMode ? severityLabel : eyebrow ?? LABELS.eddySays;
  const subtitle = alertMode
    ? stationLabel
      ? `USGS · ${stationLabel}`
      : undefined
    : dateLabel;

  return (
    <ReelPage
      tone={tone}
      severity={alertMode ? condition.solid : undefined}
      backdrop={
        backgroundUrl
          ? { src: backgroundUrl, opacity: tone === "light" ? 0.08 : 1, scrim: tone === "dark" ? (warningMode ? MEDIA_SCRIM.warning : MEDIA_SCRIM.neutral) : undefined }
          : undefined
      }
      opacity={loopOpacity}
    >
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
          tone={tone}
          label={label}
          labelFill={alertMode ? condition.solid : undefined}
          labelOpacity={warningPulse}
          title={riverName}
          subtitle={subtitle}
          aside={
            alertMode ? (
              // Eddy's CONDITION MOOD otter fronts the alert (red-flag for high,
              // flood otter for dangerous, green for the all-clear) — the same
              // otter shown everywhere else for this level.
              <Img
                src={staticFile(eddyVariantFile(getOtterVariant(conditionCode)))}
                style={{ height: 72, width: "auto", objectFit: "contain" }}
              />
            ) : undefined
          }
        />
      </div>

      {/* ── Stage ─────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: stageTop,
          left: REEL_SAFE.left,
          right: REEL_SAFE.right,
          height: stageH,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 20,
        }}
      >
        {/* Transition (alert only): old → new */}
        {alertMode && previous && (
          <div
            style={{
              transform: `translateY(${settleY}px)`,
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontFamily: fontFamilies.display,
              fontSize: 32,
              fontWeight: 600,
            }}
          >
            <span style={{ color: previous.solid }}>{previous.label}</span>
            <span style={{ color: s.inkMuted }}>→</span>
            <span style={{ color: condition.solid, fontWeight: 700 }}>{condition.label}</span>
          </div>
        )}

        {alertMode ? (
          // Alert instrument: the labeled gauge scale beside the counting
          // numeral, its citation, the flow context and the rise pill.
          <div style={{ display: "flex", alignItems: "center", gap: 36, alignSelf: "stretch" }}>
            <GaugeBar
              tone="dark"
              currentHeight={gaugeHeightFt}
              optimalMin={optimalMin}
              optimalMax={optimalMax}
              levelHigh={levelHigh}
              levelDangerous={levelDangerous}
              conditionColor={condition.solid}
              delay={30}
              emphasis
              series={series}
              riseStartFrame={RISE_START}
              riseDurationFrames={RISE_DURATION}
              width={150}
              height={isPortrait ? 400 : 300}
            />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  style={{
                    fontFamily: fontFamilies.mono,
                    fontSize: isPortrait ? TYPE.numeral.size : 82,
                    fontWeight: TYPE.numeral.weight,
                    lineHeight: TYPE.numeral.lineHeight,
                    letterSpacing: TYPE.numeral.tracking,
                    color: crossedHigh ? condition.solid : s.ink,
                  }}
                >
                  {fill.value.toFixed(1)}
                </span>
                <span style={{ fontFamily: fontFamilies.mono, fontSize: 40, fontWeight: 700, color: s.inkMuted }}>ft</span>
              </div>
              {flowText && (
                <div style={{ fontFamily: fontFamilies.display, fontSize: 26, fontWeight: 600, color: condition.solid }}>
                  {flowText}
                </div>
              )}
              {riseText && (
                <div style={{ opacity: warningPulse, alignSelf: "flex-start" }}>
                  <BrandPill tone="dark" fill={condition.solid} size={26} style={{ textTransform: "none", letterSpacing: 0 }}>
                    {riseText}
                  </BrandPill>
                </div>
              )}
            </div>
          </div>
        ) : (
          // The report: the compact instrument beside Eddy's mood otter, then
          // the condition pill. Quote-forward drops the bar so the quote leads.
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 40 }}>
            {!quoteForward && (
              <GaugeBar
                tone="light"
                currentHeight={gaugeHeightFt}
                optimalMin={optimalMin}
                optimalMax={optimalMax}
                levelHigh={levelHigh}
                levelDangerous={levelDangerous}
                conditionColor={condition.solid}
                delay={30}
                width={isPortrait ? 120 : 95}
                height={isPortrait ? 400 : 300}
              />
            )}
            <div style={{ marginBottom: 8 }}>
              <EddyMascot
                variant={getOtterVariant(conditionCode)}
                size={isPortrait ? (quoteForward ? 200 : 240) : 170}
                delay={-30}
              />
            </div>
          </div>
        )}

        {!alertMode && (
          <div style={{ transform: `translateX(${pillX}px)` }}>
            <BrandPill
              fill={condition.solid}
              size={26}
              leading={<span style={{ width: 12, height: 12, borderRadius: "50%", background: colors.neutral[900], opacity: 0.55 }} />}
            >
              {condition.label}
            </BrandPill>
          </div>
        )}

        {/* Quote — a teaser by default; the hero in quote-forward mode */}
        <div style={{ transform: `translateY(${quoteY}px)`, width: "100%" }}>
          <BrandCard tone={tone} accent={alertMode ? condition.solid : undefined} padding={isPortrait ? "22px 30px" : "16px 22px"}>
            <div
              style={{
                fontSize: quoteForward ? (isPortrait ? 38 : 30) : isPortrait ? 27 : 22,
                fontWeight: quoteForward ? 520 : 500,
                lineHeight: quoteForward ? 1.3 : 1.4,
                fontStyle: "italic",
                color: s.ink,
                textAlign: "center",
              }}
            >
              &ldquo;{quoteText}&rdquo;
            </div>
          </BrandCard>
        </div>
      </div>

      {/* ── Dock ──────────────────────────────────────────────── */}
      <ReelDock
        tone={tone}
        accent={alertMode ? condition.solid : undefined}
        bottom={isPortrait ? undefined : 88}
        followBottom={isPortrait ? undefined : 48}
        tiles={[
          <StatTile key="reading" tone={tone} value={gaugeHeightFt.toFixed(1)} unit="FT" label="Gauge" />,
          <StatTile key="condition" tone={tone} value={condition.label} label="Conditions" color={condition.solid} compact />,
        ]}
        detail={alertMode ? alertCta : undefined}
        detailColor={alertMode ? accentInk : undefined}
        cta={alertMode ? CTA.gauge : CTA.reportBelow}
        ctaFill={alertMode ? condition.solid : undefined}
        ctaVariant={alertMode ? "button" : "text"}
        // The report's CTA points at the caption, not the site — it is a fact
        // about the post, so it is on screen from frame 0. The alert's button
        // lands late, like every other reel's.
        ctaProgress={alertMode ? ctaEntrance : 1}
        followCta={followCta}
      />
    </ReelPage>
  );
};
