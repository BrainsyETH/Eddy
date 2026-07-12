import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { GaugeBar, gaugeFillModel } from "../../components/GaugeBar";
import { Watermark } from "../../components/Watermark";
import { ENTRANCE, SNAPPY } from "../../lib/spring-presets";
import { REEL_SAFE, reelLoopOpacity } from "../../lib/reel-safe";
import {
  CONDITION_COLORS,
  getOtterVariant,
  warningCopy,
  recoveryCopy,
  type GaugeAnimationProps,
} from "../../lib/social-props";
import { colors } from "../../design-tokens/colors";

const FPS = 30;

// Legibility scrims used when a full-bleed backgroundUrl is supplied.
const WARNING_SCRIM =
  "linear-gradient(160deg, rgba(42,13,13,0.82), rgba(13,42,44,0.8) 60%, rgba(13,42,44,0.92))";
const NEUTRAL_SCRIM =
  "linear-gradient(160deg, rgba(13,42,44,0.86), rgba(26,61,64,0.78), rgba(13,42,44,0.94))";

/**
 * Single-river gauge highlight animation.
 * Default highlight: 12 seconds (360 frames @ 30fps). 1080x1920 portrait.
 * Alert / recovery reels run tighter (240 frames / 8s) via Root's
 * calculateMetadata; the internal timeline below scales off durationInFrames.
 *
 * Timeline (default 360f; alert 240f is proportionally tighter):
 *   frame 0:  branded background + severity eyebrow already visible
 *   0-30:     River name entrance
 *  15-45:     Date fades in
 *  30-60:     Gauge fills, Eddy bounces in, condition badge slides in (parallel)
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
  // The CTA enters ~70 frames before the end and the quote fades in early, so
  // the same choreography works for both the 12s default and the tighter 8s
  // alert reel.
  const ctaStart = Math.max(60, durationInFrames - 70);

  // Background chrome (glow + accent bar) is now fully opaque from frame 0 — no
  // fade-from-black — so the first autoplay frame / grid thumbnail is branded.
  const bgOpacity = 1;

  const nameEntrance = spring({ frame, fps, config: ENTRANCE });
  const nameY = interpolate(nameEntrance, [0, 1], [40, 0]);

  // Date arrives just after the name settles.
  const dateEntrance = spring({ frame: frame - 15, fps, config: ENTRANCE });

  // Data cluster (badge + gauge + Eddy) all enter in one ~30-frame window
  // starting at frame 30, so the eye doesn't wait through three cascades.
  const badgeEntrance = spring({ frame: frame - 45, fps, config: SNAPPY });
  const badgeX = interpolate(badgeEntrance, [0, 1], [60, 0]);

  // Quote: fade in over frames 40-60 (~1.3s-2.0s) and hold. Replaces the old
  // typewriter which burned 2s of unreadable partial text before the viewer
  // could read anything.
  const quoteOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // CTA — enters ~70 frames before the end so it lands late on both the 12s
  // default and the tighter 8s alert reel.
  const ctaEntrance = spring({
    frame: frame - ctaStart,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 100 },
  });
  const arrowBounce = frame > ctaStart ? Math.sin((frame - ctaStart) / 8) * 4 : 0;

  const glowPulse = 0.7 + 0.3 * Math.sin(frame / 20);

  // Shared fill model — the big counting numeral reads the SAME math as the
  // bar's fill (see GaugeBar.gaugeFillModel) so the two can never disagree.
  const RISE_START = 15;
  const RISE_DURATION = 90;
  const fill = gaugeFillModel(frame, fps, {
    currentHeight: gaugeHeightFt,
    series,
    levelHigh,
    riseStartFrame: RISE_START,
    riseDurationFrames: RISE_DURATION,
    delay: 30,
  });
  const crossedHigh = fill.crossingFrame != null && frame >= fill.crossingFrame;

  // Field-instrument chip chrome — solid panel, condition border, hard shadow
  // (replaces the old glow + glassmorphism).
  const chipStyle = (borderColor: string): React.CSSProperties => ({
    backgroundColor: "rgba(15,45,53,0.92)",
    border: `3px solid ${borderColor}`,
    boxShadow: "8px 8px 0 rgba(0,0,0,0.45)",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], opacity: loopOpacity }}>
      {/* Background music — volume as callback for Remotion CLI compatibility */}
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={(f) =>
          interpolate(f, [0, FPS, durationInFrames - FPS, durationInFrames], [0, 0.5, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      {/* Full-bleed background image + legibility scrim (backgroundUrl only).
          Renders from frame 0 so the grid thumbnail / first autoplay frame is
          branded, not black. Absent → the solid brand background above shows. */}
      {backgroundUrl && (
        <AbsoluteFill>
          <Img
            src={backgroundUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <AbsoluteFill
            style={{ background: warningMode ? WARNING_SCRIM : NEUTRAL_SCRIM }}
          />
        </AbsoluteFill>
      )}

      {/* Ambient chrome layer (glow + accent bar) — visible from frame 0 */}
      <AbsoluteFill style={{ opacity: bgOpacity }}>
        {/* Ambient condition glow */}
        <div
          style={{
            position: "absolute",
            top: "25%",
            left: "40%",
            transform: "translate(-50%, -50%)",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${condition.glow} 0%, transparent 70%)`,
            opacity: glowPulse * 0.5,
          }}
        />

        {/* Accent bar at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(to right, ${condition.solid}, ${condition.solid}88)`,
            boxShadow: `0 0 20px ${condition.glow}`,
          }}
        />
      </AbsoluteFill>

      {/* Content — centered in Reels-safe zone */}
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
          // Alert packs more rows (numeral/citation/rise) — tighter rhythm.
          gap: isPortrait ? (alertMode ? 22 : 28) : 20,
        }}
      >
        {/* Severity eyebrow (warning OR recovery). Rendered from frame 0 (no
            entrance dependency) so the thumbnail / first autoplay frame is
            branded. Warning pulses + shows ⚠️; recovery is calm + shows ✓ in
            the condition's own green/teal color. */}
        {alertMode && (
          <div
            style={{
              opacity: warningPulse,
              display: "flex",
              alignItems: "center",
              gap: 16,
              ...chipStyle(condition.solid),
              borderRadius: 999,
              padding: isPortrait ? "12px 36px" : "10px 28px",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: isPortrait ? 40 : 30 }}>
              {isRecovery ? "✅" : "⚠️"}
            </span>
            <span
              style={{
                fontFamily: "'Fredoka', system-ui, sans-serif",
                fontSize: isPortrait ? 44 : 32,
                fontWeight: 700,
                letterSpacing: 4,
                color: condition.solid,
              }}
            >
              {severityLabel}
            </span>
          </div>
        )}

        {/* Eyebrow (e.g. "Eddy Says") — quote-forward / Eddy Says reel only */}
        {eyebrow && (
          <div
            style={{
              opacity: nameEntrance,
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontFamily: "'Fredoka', system-ui, sans-serif",
              fontSize: isPortrait ? 30 : 24,
              fontWeight: 600,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: condition.solid,
              textShadow: `0 0 24px ${condition.glow}`,
            }}
          >
            {eyebrow}
          </div>
        )}

        {/* River Name */}
        <div
          style={{
            opacity: nameEntrance,
            transform: `translateY(${nameY}px)`,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 60 : 48,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
            textShadow: `0 0 30px ${condition.glow}`,
          }}
        >
          {riverName}
        </div>

        {/* Transition arrow (warning or recovery) — old → new */}
        {alertMode && previous && (
          <div
            style={{
              opacity: dateEntrance,
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontFamily: "'Fredoka', system-ui, sans-serif",
              fontSize: isPortrait ? 28 : 22,
              fontWeight: 500,
              marginTop: -14,
            }}
          >
            <span style={{ color: previous.solid }}>{previous.label}</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: isPortrait ? 34 : 26 }}>→</span>
            <span style={{ color: condition.solid, fontWeight: 700 }}>{condition.label}</span>
          </div>
        )}

        {/* Date — matches the OG thumbnail's timestamp so the grid cover
            and the reel content stay in sync */}
        {dateLabel && (
          <div
            style={{
              opacity: dateEntrance,
              marginTop: -18,
              fontFamily: "'Geist Sans', system-ui, sans-serif",
              fontSize: isPortrait ? 30 : 22,
              color: "rgba(255,255,255,0.6)",
              textAlign: "center",
            }}
          >
            {dateLabel}
          </div>
        )}

        {/* Gauge + Eddy. In alert/recovery mode the bar is the HERO — enlarged
            and centered, the focal instrument — with Eddy shrunk to a small
            companion. Quote-forward (Eddy Says) drops the big gauge bar so the
            quote can be the hero. Otherwise the normal side-by-side layout. */}
        <div
          style={{
            display: "flex",
            // Alert: Eddy floats beside the instrument's midline; default
            // keeps him planted at the bar's base.
            alignItems: alertMode ? "center" : "flex-end",
            gap: isPortrait ? (alertMode ? 24 : 36) : 32,
            justifyContent: "center",
          }}
        >
          {!quoteForward && (
            <GaugeBar
              currentHeight={gaugeHeightFt}
              optimalMin={optimalMin}
              optimalMax={optimalMax}
              levelHigh={levelHigh}
              levelDangerous={levelDangerous}
              conditionColor={condition.solid}
              conditionGlow={condition.glow}
              delay={30}
              emphasis={alertMode}
              series={alertMode ? series : undefined}
              riseStartFrame={RISE_START}
              riseDurationFrames={RISE_DURATION}
              width={alertMode ? (isPortrait ? 140 : 110) : isPortrait ? 100 : 85}
              // Alert bar cedes ~100px to the counting numeral + citation
              // below it so the whole instrument column stays in REEL_SAFE.
              height={alertMode ? (isPortrait ? 460 : 320) : isPortrait ? 420 : 300}
            />
          )}
          <div style={{ marginBottom: alertMode ? 0 : 12 }}>
            <EddyMascot
              variant={getOtterVariant(conditionCode)}
              size={
                isPortrait
                  ? alertMode
                    ? 165
                    : quoteForward
                      ? 180
                      : 220
                  : alertMode
                    ? 120
                    : 170
              }
              delay={30}
            />
          </div>
        </div>

        {/* Big counting numeral — a direct child of the centered column so it
            shares ONE axis with the name/quote/CTA (nesting it under the bar
            left it off-center beside Eddy). Reads the same fill model as the
            bar, so the number and the water level always agree; white below
            the high threshold, condition-colored the moment it crosses. */}
        {alertMode && !quoteForward && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: isPortrait ? 118 : 88,
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: -3,
                  color: crossedHigh ? condition.solid : "#fff",
                }}
              >
                {fill.value.toFixed(1)}
              </span>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: isPortrait ? 40 : 30,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                ft
              </span>
            </div>

            {/* Instrument citation — where this number comes from. */}
            {stationLabel && (
              <div
                style={{
                  fontFamily: "'Geist Sans', system-ui, sans-serif",
                  fontSize: isPortrait ? 22 : 17,
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                USGS · {stationLabel}
              </div>
            )}

            {/* Rise pill — the urgency signal, right under the gauge reading.
                Orange/red in warning, teal/green (condition color) in recovery. */}
            {riseText && (
              <div
                style={{
                  opacity: warningPulse,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  ...chipStyle(condition.solid),
                  borderRadius: 999,
                  padding: isPortrait ? "10px 24px" : "8px 18px",
                  fontFamily: "'Fredoka', system-ui, sans-serif",
                  fontSize: isPortrait ? 34 : 26,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: condition.solid,
                  whiteSpace: "nowrap",
                  marginTop: 4,
                }}
              >
                {riseText}
              </div>
            )}
          </div>
        )}

        {/* Condition Badge — field-instrument chrome. Hidden in alert mode:
            the severity eyebrow + transition already say "High"; a third
            mention read as clutter. */}
        {!alertMode && (
          <div
            style={{
              opacity: badgeEntrance,
              transform: `translateX(${badgeX}px)`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              ...chipStyle(condition.solid),
              padding: "10px 24px",
              borderRadius: 999,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: condition.solid,
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
        )}

        {/* Quote — a teaser by default; the centered hero in quote-forward mode */}
        <div
          style={{
            maxWidth: isPortrait ? 920 : 800,
            textAlign: "center",
            opacity: quoteOpacity,
          }}
        >
          <span
            style={{
              fontSize: quoteForward ? (isPortrait ? 46 : 34) : isPortrait ? 32 : 24,
              color: quoteForward ? "#fff" : "rgba(255,255,255,0.9)",
              lineHeight: quoteForward ? 1.4 : 1.5,
              fontStyle: "italic",
              fontWeight: quoteForward ? 500 : 400,
              textShadow: quoteForward ? `0 0 30px ${condition.glow}` : undefined,
            }}
          >
            &ldquo;{quoteText}&rdquo;
          </span>
        </div>

        {/* CTA — alert/recovery copy in those modes, "Full report below ▼"
            otherwise. Optional smaller followCta line beneath (lower emphasis). */}
        <div
          style={{
            opacity: ctaEntrance,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontFamily: "'Fredoka', system-ui, sans-serif",
              fontSize: alertMode ? (isPortrait ? 28 : 22) : 24,
              fontWeight: alertMode ? 700 : 400,
              color: condition.solid,
              letterSpacing: alertMode ? 1 : 0.5,
              textAlign: "center",
              maxWidth: isPortrait ? 900 : 700,
              textShadow: alertMode ? `0 0 24px ${condition.glow}` : undefined,
            }}
          >
            {alertMode ? alertCta : 'Full report below'}
          </span>
          {!alertMode && (
            <span
              style={{
                fontSize: 28,
                color: condition.solid,
                opacity: 0.7,
                transform: `translateY(${arrowBounce}px)`,
              }}
            >
              ▼
            </span>
          )}
          {followCta && (
            <span
              style={{
                fontFamily: "'Fredoka', system-ui, sans-serif",
                fontSize: isPortrait ? 22 : 18,
                fontWeight: 500,
                color: "rgba(255,255,255,0.6)",
                letterSpacing: 0.5,
                textAlign: "center",
                marginTop: 2,
              }}
            >
              {followCta}
            </span>
          )}
        </div>
      </div>

      {/* Watermark — persistent so the eddy.guide source mark survives any
          mid-animation screenshot (under the global loop fade above). */}
      <Watermark format={isPortrait ? "portrait" : "landscape"} />
    </AbsoluteFill>
  );
};
