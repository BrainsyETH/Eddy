import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring, useVideoConfig, staticFile } from "remotion";
import { COLORS, FONTS } from "../lib/constants";

/**
 * Scene 5: Access Points (23-29s)
 * Stylized map with animated pin drops
 * Narration: "Over thirty curated access points across Missouri's best float rivers."
 */
export const AccessPointsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
  const scale = interpolate(frame, [0, 180], [1.1, 1.18], {
    extrapolateRight: "clamp",
  });

  // Access point pins (animated drops)
  const pins = [
    { x: 35, y: 40, label: "Cedargrove", delay: 30 },
    { x: 45, y: 35, label: "Akers Ferry", delay: 45 },
    { x: 55, y: 45, label: "Pulltite", delay: 60 },
    { x: 40, y: 55, label: "Round Spring", delay: 75 },
    { x: 60, y: 50, label: "Two Rivers", delay: 90 },
  ];

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
          background: `radial-gradient(ellipse at 60% 40%, ${COLORS.riverBlue} 0%, ${COLORS.deepWater} 70%)`,
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
          src={staticFile("screenshots/river-putin.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `radial-gradient(ellipse at center, transparent 20%, ${COLORS.deepWater}90 100%)`,
          }}
        />
      </div>
      */}

      {/* Animated pins */}
      {pins.map((pin, i) => {
        const pinScale = spring({
          frame: frame - pin.delay,
          fps,
          config: { damping: 10, mass: 0.5, stiffness: 150 },
        });
        const pinOpacity = interpolate(frame, [pin.delay, pin.delay + 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              transform: `translate(-50%, -100%) scale(${pinScale})`,
              opacity: pinOpacity,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Pin marker */}
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                backgroundColor: COLORS.sunsetOrange,
                border: `3px solid ${COLORS.white}`,
                boxShadow: `0 4px 15px ${COLORS.sunsetOrange}80`,
              }}
            />
            {/* Pin label */}
            <div
              style={{
                marginTop: 8,
                backgroundColor: `${COLORS.deepWater}E0`,
                padding: "6px 14px",
                borderRadius: 20,
                whiteSpace: "nowrap",
              }}
            >
              <span
                style={{
                  color: COLORS.white,
                  fontSize: 14,
                  fontFamily: FONTS.body,
                  fontWeight: 500,
                }}
              >
                {pin.label}
              </span>
            </div>
          </div>
        );
      })}

      {/* Title card */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 80,
          opacity: interpolate(frame, [20, 40], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            backgroundColor: `${COLORS.deepWater}E0`,
            padding: "30px 40px",
            borderRadius: 20,
            backdropFilter: "blur(10px)",
            border: `1px solid ${COLORS.skyBlue}30`,
          }}
        >
          <h2
            style={{
              color: COLORS.white,
              fontSize: 48,
              fontFamily: FONTS.heading,
              fontWeight: 700,
              margin: 0,
            }}
          >
            30+ Access Points
          </h2>
          <p
            style={{
              color: COLORS.warmGold,
              fontSize: 24,
              fontFamily: FONTS.body,
              margin: "8px 0 0 0",
            }}
          >
            Every launch mapped. Every detail covered.
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
};
