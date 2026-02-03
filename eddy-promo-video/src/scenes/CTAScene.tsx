import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { COLORS, FONTS, EDDY_IMAGES } from "../lib/constants";
import { FloatingParticles } from "../components/FloatingParticles";
import { WaterRipple } from "../components/WaterRipple";

/**
 * Scene 8: CTA (38-45s)
 * Final call to action with eddy.guide URL
 * Narration: "Plan your next float trip today. eddy.guide. Your river. Your adventure."
 */
export const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in (no fade out - video ends)
  const fadeIn = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Eddy bounce
  const eddyScale = spring({
    frame: frame - 20,
    fps,
    config: { damping: 10, mass: 0.7, stiffness: 100 },
  });

  // URL glow animation
  const glowIntensity = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [0.3, 0.8]
  );

  // Tagline
  const taglineOpacity = interpolate(frame, [100, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      {/* Background gradient */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `linear-gradient(135deg, ${COLORS.deepWater} 0%, ${COLORS.riverBlue} 50%, ${COLORS.deepWater} 100%)`,
        }}
      />

      {/* Floating particles */}
      <FloatingParticles color={COLORS.warmGold} />

      {/* Water ripples */}
      <WaterRipple x={20} y={80} delay={0} color={COLORS.skyBlue} />
      <WaterRipple x={80} y={70} delay={45} color={COLORS.skyBlue} />

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          zIndex: 10,
          position: "relative",
        }}
      >
        {/* Eddy mascot */}
        <Img
          src={EDDY_IMAGES.main}
          style={{
            width: 280,
            height: 280,
            objectFit: "contain",
            transform: `scale(${eddyScale})`,
            filter: "drop-shadow(0 10px 50px rgba(240, 112, 82, 0.4))",
          }}
        />

        {/* Main CTA text */}
        <h1
          style={{
            color: COLORS.white,
            fontSize: 64,
            fontFamily: FONTS.heading,
            fontWeight: 700,
            margin: "20px 0",
            textAlign: "center",
            opacity: interpolate(frame, [50, 70], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Plan your next float trip today.
        </h1>

        {/* URL with glow */}
        <div
          style={{
            marginTop: 20,
            opacity: interpolate(frame, [80, 100], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              backgroundColor: `rgba(255, 255, 255, 0.1)`,
              padding: "20px 50px",
              borderRadius: 60,
              border: `2px solid ${COLORS.sunsetOrange}`,
              boxShadow: `0 0 ${40 * glowIntensity}px ${COLORS.sunsetOrange}${Math.round(glowIntensity * 100).toString(16).padStart(2, "0")}`,
            }}
          >
            <span
              style={{
                color: COLORS.sunsetOrange,
                fontSize: 48,
                fontFamily: FONTS.heading,
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              eddy.guide
            </span>
          </div>
        </div>

        {/* Tagline */}
        <p
          style={{
            color: COLORS.warmGold,
            fontSize: 32,
            fontFamily: FONTS.display,
            fontWeight: 400,
            fontStyle: "italic",
            marginTop: 40,
            opacity: taglineOpacity,
          }}
        >
          Your river. Your adventure.
        </p>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 40,
            opacity: interpolate(frame, [130, 150], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {["Free to Use", "Real-time Data", "Local Knowledge"].map((text, i) => (
            <div
              key={i}
              style={{
                backgroundColor: `${COLORS.skyBlue}25`,
                padding: "10px 24px",
                borderRadius: 30,
                border: `1px solid ${COLORS.skyBlue}40`,
              }}
            >
              <span
                style={{
                  color: COLORS.lightText,
                  fontSize: 18,
                  fontFamily: FONTS.body,
                  fontWeight: 500,
                }}
              >
                {text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
