import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { COLORS, FONTS, EDDY_IMAGES } from "../lib/constants";
import { FloatingParticles } from "../components/FloatingParticles";

/**
 * Scene 2: Introduce Eddy (6-11s)
 * Mascot reveal with logo and tagline
 * Narration: "Meet Eddy — your Ozark float trip companion."
 */
export const IntroEddyScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [130, 150], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Eddy bounce in
  const eddyScale = spring({
    frame: frame - 10,
    fps,
    config: { damping: 12, mass: 0.8, stiffness: 100 },
  });
  const eddyY = interpolate(eddyScale, [0, 1], [100, 0]);

  // Logo animation
  const logoOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoScale = spring({
    frame: frame - 40,
    fps,
    config: { damping: 15, mass: 0.5, stiffness: 120 },
  });

  // Tagline
  const taglineOpacity = interpolate(frame, [70, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Feature badges
  const badgeDelays = [85, 95, 105];
  const badges = ["30+ Access Points", "Live USGS Gauges", "Float Time Calculator"];

  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      {/* Background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `radial-gradient(ellipse at center, ${COLORS.riverBlue} 0%, ${COLORS.deepWater} 100%)`,
        }}
      />

      <FloatingParticles color={COLORS.skyBlue} />

      {/* Centered content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 60,
        }}
      >
        {/* Eddy mascot */}
        <Img
          src={EDDY_IMAGES.main}
          style={{
            width: 280,
            height: 280,
            objectFit: "contain",
            transform: `scale(${eddyScale}) translateY(${eddyY}px)`,
            filter: "drop-shadow(0 10px 40px rgba(240, 112, 82, 0.3))",
          }}
        />

        {/* Logo text */}
        <h1
          style={{
            color: COLORS.sunsetOrange,
            fontSize: 96,
            fontFamily: FONTS.display,
            fontWeight: 700,
            margin: "10px 0",
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
            textShadow: "0 4px 30px rgba(240, 112, 82, 0.3)",
          }}
        >
          Eddy
        </h1>

        {/* Tagline */}
        <p
          style={{
            color: COLORS.lightText,
            fontSize: 32,
            fontFamily: FONTS.body,
            fontWeight: 400,
            opacity: taglineOpacity,
            marginTop: 0,
          }}
        >
          Your Ozark Float Trip Companion
        </p>

        {/* Feature badges */}
        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 40,
          }}
        >
          {badges.map((badge, i) => {
            const badgeOpacity = interpolate(
              frame,
              [badgeDelays[i], badgeDelays[i] + 15],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            const badgeY = interpolate(
              frame,
              [badgeDelays[i], badgeDelays[i] + 15],
              [20, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <div
                key={i}
                style={{
                  backgroundColor: `${COLORS.skyBlue}30`,
                  padding: "12px 24px",
                  borderRadius: 30,
                  border: `1px solid ${COLORS.skyBlue}50`,
                  opacity: badgeOpacity,
                  transform: `translateY(${badgeY}px)`,
                }}
              >
                <span
                  style={{
                    color: COLORS.white,
                    fontSize: 18,
                    fontFamily: FONTS.body,
                    fontWeight: 500,
                  }}
                >
                  {badge}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
