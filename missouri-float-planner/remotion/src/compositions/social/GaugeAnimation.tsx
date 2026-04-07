import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
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

/**
 * Single-river gauge highlight animation with glassmorphism and glow.
 * 8 seconds (240 frames @ 30fps). 1080x1080 or 1080x1920.
 *
 * Timeline:
 *   0-30:   Background fade + river name entrance
 *  30-120:  Gauge bar fills to current reading
 *  90-140:  Condition badge slides in
 * 100-160:  Eddy otter bounces in
 * 130-220:  Quote typewriter
 * 220-240:  Watermark fade
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
  const { fps } = useVideoConfig();
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

  const typewriterProgress = interpolate(frame, [130, 220], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const visibleChars = Math.floor(typewriterProgress * quoteText.length);
  const displayQuote = quoteText.slice(0, visibleChars);

  const watermarkOpacity = interpolate(frame, [220, 240], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Ambient glow pulse
  const glowPulse = 0.7 + 0.3 * Math.sin(frame / 20);

  return (
    <AbsoluteFill
      style={{
        opacity: bgOpacity,
        backgroundColor: colors.primary[900],
        fontFamily: "'Geist Sans', system-ui, sans-serif",
      }}
    >
      {/* Ambient condition glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: isPortrait ? 600 : 500,
          height: isPortrait ? 600 : 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${condition.glow} 0%, transparent 70%)`,
          opacity: glowPulse * 0.5,
        }}
      />

      {/* Accent gradient bar at bottom */}
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

      {/* Main content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: isPortrait ? "80px 48px" : "48px",
          gap: isPortrait ? 40 : 24,
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
            gap: isPortrait ? 48 : 40,
            justifyContent: "center",
          }}
        >
          {/* Gauge Bar */}
          <GaugeBar
            currentHeight={gaugeHeightFt}
            optimalMin={optimalMin}
            optimalMax={optimalMax}
            conditionColor={condition.solid}
            conditionGlow={condition.glow}
            delay={30}
            width={isPortrait ? 90 : 80}
            height={isPortrait ? 480 : 340}
          />

          {/* Eddy Mascot */}
          <div style={{ marginBottom: 20 }}>
            <EddyMascot
              variant={getOtterVariant(conditionCode)}
              size={isPortrait ? 220 : 180}
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

        {/* Quote */}
        <div
          style={{
            maxWidth: isPortrait ? 900 : 800,
            textAlign: "center",
            minHeight: isPortrait ? 120 : 80,
          }}
        >
          <span
            style={{
              fontSize: isPortrait ? 22 : 20,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.5,
              fontStyle: "italic",
            }}
          >
            &ldquo;{displayQuote}&rdquo;
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
