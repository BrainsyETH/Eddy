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

// Reel-safe content zones (1080x1920 portrait)
const SAFE = {
  top: 150,    // Instagram username + follow button
  bottom: 400, // Caption + music bar + action buttons
  right: 100,  // Like/comment/share/save icons
  left: 20,
};

/**
 * Single-river gauge highlight animation with glassmorphism and glow.
 * 12 seconds (360 frames @ 30fps). 1080x1920 portrait.
 *
 * Timeline:
 *   0-30:    Background fade + river name entrance
 *  30-120:   Gauge bar fills to current reading
 *  90-140:   Condition badge slides in
 * 100-160:   Eddy otter bounces in
 * 140-200:   Quote typewriter (2 seconds to type)
 * 200-320:   Quote fully visible (4 seconds to read)
 * 300-340:   "Full report below" CTA fades in
 * 340-360:   Hold CTA + watermark
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

  const badgeEntrance = spring({
    frame: frame - 90,
    fps,
    config: SNAPPY,
  });
  const badgeX = interpolate(badgeEntrance, [0, 1], [60, 0]);

  // Quote: 2s to type (frames 140-200), 4s visible (200-320)
  const typewriterProgress = interpolate(frame, [140, 200], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const visibleChars = Math.floor(typewriterProgress * quoteText.length);
  const displayQuote = quoteText.slice(0, visibleChars);

  // Quote stays fully visible until near the end
  const quoteOpacity = interpolate(frame, [140, 155, 330, 350], [0, 1, 1, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "Full report below ▼" CTA (fades in at frame 300)
  const ctaEntrance = spring({
    frame: frame - 300,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 100 },
  });
  // Bouncing arrow
  const arrowBounce = frame > 300
    ? Math.sin((frame - 300) / 8) * 4
    : 0;

  // Watermark
  const watermarkOpacity = interpolate(frame, [300, 320], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Ambient glow pulse
  const glowPulse = 0.7 + 0.3 * Math.sin(frame / 20);

  // Background music volume
  const musicVolume = interpolate(
    frame,
    [0, 15, durationInFrames - 30, durationInFrames],
    [0, 0.12, 0.12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        opacity: bgOpacity,
        backgroundColor: colors.primary[900],
        fontFamily: "'Geist Sans', system-ui, sans-serif",
      }}
    >
      {/* Background music */}
      <Audio
        src={staticFile("audio/background-music.mp3")}
        volume={musicVolume}
      />

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

      {/* Accent gradient bar at bottom (full bleed) */}
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

      {/* Safe zone content container */}
      <div
        style={{
          position: "absolute",
          top: isPortrait ? SAFE.top : 48,
          bottom: isPortrait ? SAFE.bottom : 48,
          left: isPortrait ? SAFE.left : 48,
          right: isPortrait ? SAFE.right : 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: isPortrait ? 28 : 24,
        }}
      >
        {/* River Name */}
        <div
          style={{
            opacity: nameEntrance,
            transform: `translateY(${nameY}px)`,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 52 : 48,
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
            gap: isPortrait ? 40 : 36,
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
            width={isPortrait ? 85 : 80}
            height={isPortrait ? 380 : 300}
          />

          <div style={{ marginBottom: 16 }}>
            <EddyMascot
              variant={getOtterVariant(conditionCode)}
              size={isPortrait ? 200 : 170}
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
              fontSize: 24,
              fontWeight: 600,
              color: condition.solid,
            }}
          >
            {condition.label}
          </span>
        </div>

        {/* Quote (teaser — full quote is in the caption) */}
        <div
          style={{
            maxWidth: isPortrait ? 900 : 800,
            textAlign: "center",
            minHeight: isPortrait ? 100 : 70,
            opacity: quoteOpacity,
          }}
        >
          <span
            style={{
              fontSize: isPortrait ? 28 : 24,
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
            gap: 4,
          }}
        >
          <span
            style={{
              fontFamily: "'Fredoka', system-ui, sans-serif",
              fontSize: 16,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: 0.5,
            }}
          >
            Full report below
          </span>
          <span
            style={{
              fontSize: 20,
              color: "rgba(255,255,255,0.4)",
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
