import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS, EDDY_IMAGES } from "../lib/constants";
import { useCounter } from "../lib/animations";
import { Img } from "remotion";

/**
 * Scene 7: Stats (34-38s)
 * Animated counters showing key metrics
 * Narration: "Trusted by Missouri floaters for live data and local knowledge."
 */
export const StatsScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Fades
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [100, 120], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Stats with animated counters
  const stats = [
    { value: useCounter(30, 20, 40), suffix: "+", label: "Access Points", delay: 20 },
    { value: useCounter(8, 30, 40), suffix: "", label: "Rivers", delay: 30 },
    { value: useCounter(15, 40, 40), suffix: "+", label: "USGS Gauges", delay: 40 },
  ];

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

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        {/* Eddy mascot */}
        <Img
          src={EDDY_IMAGES.green}
          style={{
            width: 150,
            height: 150,
            objectFit: "contain",
            marginBottom: 40,
            opacity: interpolate(frame, [10, 30], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            filter: "drop-shadow(0 8px 30px rgba(240, 112, 82, 0.3))",
          }}
        />

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: 100,
            justifyContent: "center",
          }}
        >
          {stats.map((stat, i) => {
            const opacity = interpolate(
              frame,
              [stat.delay, stat.delay + 15],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            const scale = interpolate(
              frame,
              [stat.delay, stat.delay + 20],
              [0.8, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <div
                key={i}
                style={{
                  textAlign: "center",
                  opacity,
                  transform: `scale(${scale})`,
                }}
              >
                <div
                  style={{
                    color: COLORS.warmGold,
                    fontSize: 96,
                    fontFamily: FONTS.display,
                    fontWeight: 700,
                    lineHeight: 1,
                    textShadow: `0 4px 30px ${COLORS.warmGold}40`,
                  }}
                >
                  {stat.value}
                  {stat.suffix}
                </div>
                <div
                  style={{
                    color: COLORS.lightText,
                    fontSize: 24,
                    fontFamily: FONTS.body,
                    fontWeight: 500,
                    marginTop: 12,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust message */}
        <p
          style={{
            color: COLORS.skyBlue,
            fontSize: 28,
            fontFamily: FONTS.body,
            fontWeight: 400,
            marginTop: 60,
            opacity: interpolate(frame, [60, 80], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Trusted by Missouri floaters
        </p>
      </div>
    </AbsoluteFill>
  );
};
