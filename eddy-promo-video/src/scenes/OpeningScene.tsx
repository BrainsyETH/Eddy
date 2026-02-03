import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, staticFile } from "remotion";
import { COLORS, FONTS } from "../lib/constants";
import { FloatingParticles } from "../components/FloatingParticles";
import { WaterRipple } from "../components/WaterRipple";
import { useFadeIn, useKenBurns } from "../lib/animations";

/**
 * Scene 1: Opening Hook (0-6s)
 * Cinematic river gradient with floating particles
 * Narration: "Missouri's Ozark rivers are some of the most beautiful..."
 */
export const OpeningScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = useFadeIn(0, 30);
  const fadeOut = interpolate(frame, [150, 180], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title animation
  const titleOpacity = interpolate(frame, [30, 50, 130, 150], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [30, 50], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: opacity * fadeOut }}>
      {/* Gradient background - river/sky colors */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `linear-gradient(180deg, 
            ${COLORS.deepWater} 0%, 
            ${COLORS.riverBlue} 40%, 
            ${COLORS.skyBlue} 70%, 
            ${COLORS.shallowBlue} 100%
          )`,
        }}
      />

      {/* Screenshot background with Ken Burns (optional - run npm run capture to generate) */}
      {/* Uncomment when screenshots are available:
      <div style={{ ...useKenBurns(1.05, 1.15, 0, -2, 0, 2), opacity: 0.3 }}>
        <Img
          src={staticFile("screenshots/homepage.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>
      */}

      {/* Floating particles */}
      <FloatingParticles color={COLORS.shallowBlue} />

      {/* Water ripples */}
      <WaterRipple x={30} y={70} delay={0} />
      <WaterRipple x={70} y={60} delay={30} />

      {/* Title text */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) translateY(${titleY}px)`,
          opacity: titleOpacity,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            color: COLORS.white,
            fontSize: 72,
            fontFamily: FONTS.display,
            fontWeight: 700,
            textShadow: "0 4px 40px rgba(0, 0, 0, 0.4)",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Missouri's Ozark Rivers
        </h1>
        <p
          style={{
            color: COLORS.warmGold,
            fontSize: 32,
            fontFamily: FONTS.body,
            fontWeight: 400,
            marginTop: 20,
            textShadow: "0 2px 20px rgba(0, 0, 0, 0.3)",
          }}
        >
          Some of the most beautiful waterways in America
        </p>
      </div>
    </AbsoluteFill>
  );
};
