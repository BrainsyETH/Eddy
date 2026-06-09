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
import { GaugeBar } from "../../components/GaugeBar";
import { Watermark } from "../../components/Watermark";
import { ENTRANCE, SNAPPY } from "../../lib/spring-presets";
import { REEL_SAFE, reelLoopOpacity } from "../../lib/reel-safe";
import {
  CONDITION_COLORS,
  getOtterVariant,
  type GaugeAnimationProps,
} from "../../lib/social-props";
import { colors } from "../../design-tokens/colors";

const FPS = 30;

/**
 * Single-river gauge highlight animation.
 * 12 seconds (360 frames @ 30fps). 1080x1920 portrait.
 *
 * Timeline:
 *   0-20:    Background fade in
 *   0-30:    River name entrance
 *  15-45:    Date fades in
 *  30-60:    Gauge fills, Eddy bounces in, condition badge slides in (parallel)
 *  60-80:    Quote fades in (no typewriter — readable at 2.67s)
 *  80-290:   Quote held at full opacity (~7s of reading time)
 * 290-310:   "Full report below ▼" CTA fades in
 * 330-360:   Loop-out handled by reelLoopOpacity wrapper
 */
export const GaugeAnimation: React.FC<GaugeAnimationProps> = ({
  riverName,
  conditionCode,
  gaugeHeightFt,
  optimalMin,
  optimalMax,
  quoteText,
  dateLabel,
  warningMode,
  previousCondition,
  format,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const condition = CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;
  const previous = previousCondition
    ? CONDITION_COLORS[previousCondition] ?? CONDITION_COLORS.unknown
    : null;
  const isPortrait = format === "portrait";

  // Warning headline copy — swapped by severity
  const warningLabel =
    conditionCode === 'dangerous' ? 'DANGEROUS' :
    conditionCode === 'high' ? 'HIGH WATER' :
    'CAUTION';
  const warningCta =
    conditionCode === 'dangerous'
      ? 'DO NOT FLOAT — Wait for levels to drop'
      : 'Use extreme caution — Experienced paddlers only';

  // Pulsing warning chrome (warning mode only)
  const warningPulse = 0.75 + 0.25 * Math.sin(frame / 10);

  // Global fade for seamless Reels auto-loop (portrait only; square/
  // landscape previews in Studio keep constant opacity).
  const loopOpacity = isPortrait ? reelLoopOpacity(frame, durationInFrames) : 1;

  // ─── Animations ──────────────────────────────────────────

  const bgOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const nameEntrance = spring({ frame, fps, config: ENTRANCE });
  const nameY = interpolate(nameEntrance, [0, 1], [40, 0]);

  // Date arrives just after the name settles.
  const dateEntrance = spring({ frame: frame - 15, fps, config: ENTRANCE });

  // Data cluster (badge + gauge + Eddy) all enter in one ~30-frame window
  // starting at frame 30, so the eye doesn't wait through three cascades.
  const badgeEntrance = spring({ frame: frame - 45, fps, config: SNAPPY });
  const badgeX = interpolate(badgeEntrance, [0, 1], [60, 0]);

  // Quote: fade in over frames 60-80 (2.0s-2.67s) and hold. Replaces the old
  // typewriter which burned 2s of unreadable partial text before the viewer
  // could read anything.
  const quoteOpacity = interpolate(frame, [60, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "Full report below ▼" CTA
  const ctaEntrance = spring({
    frame: frame - 290,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 100 },
  });
  const arrowBounce = frame > 290 ? Math.sin((frame - 290) / 8) * 4 : 0;

  const watermarkOpacity = interpolate(frame, [290, 310], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowPulse = 0.7 + 0.3 * Math.sin(frame / 20);

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

      {/* Fade-in overlay */}
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
          gap: isPortrait ? 28 : 20,
        }}
      >
        {/* Warning eyebrow (warningMode only) — pulsing WARNING banner */}
        {warningMode && (
          <div
            style={{
              opacity: nameEntrance * warningPulse,
              display: "flex",
              alignItems: "center",
              gap: 16,
              backgroundColor: condition.bg,
              border: `2px solid ${condition.solid}`,
              borderRadius: 999,
              padding: isPortrait ? "12px 36px" : "10px 28px",
              boxShadow: `0 0 30px ${condition.glow}`,
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: isPortrait ? 40 : 30 }}>⚠️</span>
            <span
              style={{
                fontFamily: "'Fredoka', system-ui, sans-serif",
                fontSize: isPortrait ? 44 : 32,
                fontWeight: 700,
                letterSpacing: 4,
                color: condition.solid,
              }}
            >
              {warningLabel}
            </span>
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

        {/* Transition arrow (warningMode only) — old → new */}
        {warningMode && previous && (
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

        {/* Gauge + Eddy side by side */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: isPortrait ? 36 : 32,
            justifyContent: "center",
          }}
        >
          <GaugeBar
            currentHeight={gaugeHeightFt}
            optimalMin={optimalMin}
            optimalMax={optimalMax}
            conditionColor={condition.solid}
            conditionGlow={condition.glow}
            delay={30}
            width={isPortrait ? 100 : 85}
            height={isPortrait ? 420 : 300}
          />
          <div style={{ marginBottom: 12 }}>
            <EddyMascot
              variant={getOtterVariant(conditionCode)}
              size={isPortrait ? 220 : 170}
              delay={30}
            />
          </div>
        </div>

        {/* Condition Badge */}
        <div
          style={{
            opacity: badgeEntrance,
            transform: `translateX(${badgeX}px)`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            backgroundColor: condition.bg,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: "10px 24px",
            borderRadius: 999,
            border: `1.5px solid ${condition.solid}`,
            boxShadow: `0 0 16px ${condition.glow}`,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: condition.solid,
              boxShadow: `0 0 8px ${condition.solid}`,
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

        {/* Quote teaser */}
        <div
          style={{
            maxWidth: isPortrait ? 920 : 800,
            textAlign: "center",
            opacity: quoteOpacity,
          }}
        >
          <span
            style={{
              fontSize: isPortrait ? 32 : 24,
              color: "rgba(255,255,255,0.9)",
              lineHeight: 1.5,
              fontStyle: "italic",
            }}
          >
            &ldquo;{quoteText}&rdquo;
          </span>
        </div>

        {/* CTA — warning text in warningMode, "Full report below ▼" otherwise */}
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
              fontSize: warningMode ? (isPortrait ? 28 : 22) : 24,
              fontWeight: warningMode ? 700 : 400,
              color: condition.solid,
              letterSpacing: warningMode ? 1 : 0.5,
              textAlign: "center",
              maxWidth: isPortrait ? 900 : 700,
              textShadow: warningMode ? `0 0 24px ${condition.glow}` : undefined,
            }}
          >
            {warningMode ? warningCta : 'Full report below'}
          </span>
          {!warningMode && (
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
        </div>
      </div>

      {/* Watermark */}
      <div style={{ opacity: watermarkOpacity }}>
        <Watermark format={isPortrait ? "portrait" : "landscape"} />
      </div>
    </AbsoluteFill>
  );
};
