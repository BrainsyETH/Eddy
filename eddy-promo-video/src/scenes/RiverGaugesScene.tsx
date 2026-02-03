import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, staticFile } from "remotion";
import { COLORS, FONTS, EDDY_IMAGES } from "../lib/constants";
import { GaugeMeter } from "../components/GaugeMeter";

/**
 * Scene 4: Live River Gauges (17-23s)
 * Dashboard with animated gauge bars
 * Narration: "Check real-time water levels powered by USGS gauges."
 */
export const RiverGaugesScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Fades
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [160, 180], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Screenshot Ken Burns
  const scale = interpolate(frame, [0, 180], [1.05, 1.12], {
    extrapolateRight: "clamp",
  });
  const translateX = interpolate(frame, [0, 180], [0, -3], {
    extrapolateRight: "clamp",
  });

  // Title animation
  const titleOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      {/* Background gradient (screenshot optional - run npm run capture) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `linear-gradient(135deg, ${COLORS.deepWater} 0%, ${COLORS.riverBlue} 50%, ${COLORS.eddyTeal} 100%)`,
        }}
      />
      {/* Uncomment when screenshots are available:
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <Img
          src={staticFile("screenshots/gauges.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale}) translateX(${translateX}%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(90deg, ${COLORS.deepWater}F0 0%, ${COLORS.deepWater}80 50%, transparent 100%)`,
          }}
        />
      </div>
      */}

      {/* Left panel with gauges */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: "50%",
          padding: 80,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 40,
            opacity: titleOpacity,
          }}
        >
          <Img
            src={EDDY_IMAGES.flood}
            style={{
              width: 70,
              height: 70,
              objectFit: "contain",
            }}
          />
          <div>
            <h2
              style={{
                color: COLORS.white,
                fontSize: 42,
                fontFamily: FONTS.heading,
                fontWeight: 700,
                margin: 0,
              }}
            >
              River Levels
            </h2>
            <p
              style={{
                color: COLORS.skyBlue,
                fontSize: 18,
                fontFamily: FONTS.body,
                margin: "4px 0 0 0",
              }}
            >
              Powered by USGS
            </p>
          </div>
        </div>

        {/* Gauge meters */}
        <div
          style={{
            backgroundColor: `${COLORS.deepWater}90`,
            borderRadius: 20,
            padding: 30,
            backdropFilter: "blur(10px)",
            border: `1px solid ${COLORS.skyBlue}30`,
          }}
        >
          <GaugeMeter label="Akers, Current River" value={72} status="optimal" delay={40} />
          <GaugeMeter label="Alley Spring, Jacks Fork" value={45} status="low" delay={55} />
          <GaugeMeter label="Bardley, Eleven Point" value={85} status="high" delay={70} />
        </div>

        {/* Live indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 24,
            opacity: interpolate(frame, [90, 110], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: "#22C55E",
              boxShadow: "0 0 10px #22C55E",
              animation: "pulse 2s infinite",
            }}
          />
          <span
            style={{
              color: COLORS.lightText,
              fontSize: 16,
              fontFamily: FONTS.body,
            }}
          >
            Live data updated hourly
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
