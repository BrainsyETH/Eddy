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
 *  30-120:   Gauge bar fills
 *  90-130:   Condition badge slides in
 * 100-150:   Eddy bounces in
 * 140-200:   Quote typewriter (2s)
 * 200-310:   Quote visible (3.7s reading time)
 * 290-330:   "Full report below ▼" CTA fades in
 * 330-360:   Hold everything
 */
export const GaugeAnimation: React.FC<GaugeAnimationProps> = ({
  riverName,
  conditionCode,
  gaugeHeightFt,
  optimalMin,
  optimalMax,
  quoteText,
  format,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const condition = CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;
  const isPortrait = format === "portrait";

  // ─── Animations ──────────────────────────────────────────

  const bgOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const nameEntrance = spring({ frame, fps, config: ENTRANCE });
  const nameY = interpolate(nameEntrance, [0, 1], [40, 0]);

  const badgeEntrance = spring({ frame: frame - 90, fps, config: SNAPPY });
  const badgeX = interpolate(badgeEntrance, [0, 1], [60, 0]);

  // Quote: 2s to type, visible until end
  const typewriterProgress = interpolate(frame, [140, 200], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const visibleChars = Math.floor(typewriterProgress * quoteText.length);
  const displayQuote = quoteText.slice(0, visibleChars);
  const quoteOpacity = interpolate(frame, [140, 155, 350, 360], [0, 1, 1, 0.8], {
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
    <AbsoluteFill style={{ backgroundColor: colors.primary[900] }}>
      {/* Background music — volume as callback for Remotion CLI compatibility */}
      <Audio
        src={staticFile("audio/background-music.mp3")}
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

      {/* Content — centered in safe zone */}
      <div
        style={{
          position: "absolute",
          top: isPortrait ? 200 : 48,
          bottom: isPortrait ? 200 : 48,
          left: isPortrait ? 20 : 48,
          right: isPortrait ? 80 : 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: isPortrait ? 28 : 20,
        }}
      >
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
              delay={100}
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
            &ldquo;{displayQuote}&rdquo;
          </span>
        </div>

        {/* "Full report below ▼" CTA */}
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
              fontSize: 24,
              color: condition.solid,
              letterSpacing: 0.5,
            }}
          >
            Full report below
          </span>
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
        </div>
      </div>

      {/* Watermark */}
      <div style={{ opacity: watermarkOpacity }}>
        <Watermark format={isPortrait ? "portrait" : "landscape"} />
      </div>
    </AbsoluteFill>
  );
};
