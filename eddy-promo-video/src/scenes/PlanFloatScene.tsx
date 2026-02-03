import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, spring, useVideoConfig, staticFile } from "remotion";
import { COLORS, FONTS, EDDY_IMAGES } from "../lib/constants";

/**
 * Scene 3: Plan Your Float (11-17s)
 * Animated planner UI - river/put-in/take-out selectors
 * Narration: "Pick your river. Choose your put-in and take-out."
 */
export const PlanFloatScene: React.FC = () => {
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

  // Screenshot with Ken Burns
  const scale = interpolate(frame, [0, 180], [1.1, 1.2], {
    extrapolateRight: "clamp",
  });

  // Selector animations (simulating filling in the form)
  const riverDelay = 30;
  const putInDelay = 70;
  const takeOutDelay = 110;

  const riverFill = interpolate(frame, [riverDelay, riverDelay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const putInFill = interpolate(frame, [putInDelay, putInDelay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const takeOutFill = interpolate(frame, [takeOutDelay, takeOutDelay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
          background: `linear-gradient(135deg, ${COLORS.deepWater} 0%, ${COLORS.riverBlue} 100%)`,
        }}
      />

      {/* Split layout */}
      <div style={{ display: "flex", height: "100%" }}>
        {/* Left: Animated form mockup */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 80,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              marginBottom: 40,
            }}
          >
            <Img
              src={EDDY_IMAGES.canoe}
              style={{
                width: 80,
                height: 80,
                objectFit: "contain",
              }}
            />
            <h2
              style={{
                color: COLORS.white,
                fontSize: 48,
                fontFamily: FONTS.heading,
                fontWeight: 700,
                margin: 0,
              }}
            >
              Plan Your Float
            </h2>
          </div>

          {/* Selector mockups */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* River selector */}
            <div>
              <label
                style={{
                  color: COLORS.lightText,
                  fontSize: 16,
                  fontFamily: FONTS.body,
                  fontWeight: 500,
                  marginBottom: 8,
                  display: "block",
                }}
              >
                River
              </label>
              <div
                style={{
                  backgroundColor: `${COLORS.white}20`,
                  borderRadius: 12,
                  padding: "16px 24px",
                  border: `2px solid ${interpolate(riverFill, [0, 1], [0.3, 1]) * 100 > 50 ? COLORS.skyBlue : "transparent"}`,
                  transition: "border 0.3s",
                }}
              >
                <span
                  style={{
                    color: riverFill > 0.5 ? COLORS.white : COLORS.lightText + "80",
                    fontSize: 20,
                    fontFamily: FONTS.body,
                  }}
                >
                  {riverFill > 0.5 ? "Current River" : "Select river..."}
                </span>
              </div>
            </div>

            {/* Put-in selector */}
            <div>
              <label
                style={{
                  color: COLORS.lightText,
                  fontSize: 16,
                  fontFamily: FONTS.body,
                  fontWeight: 500,
                  marginBottom: 8,
                  display: "block",
                }}
              >
                Put-In
              </label>
              <div
                style={{
                  backgroundColor: `${COLORS.white}20`,
                  borderRadius: 12,
                  padding: "16px 24px",
                  border: `2px solid ${putInFill > 0.5 ? "#22C55E" : "transparent"}`,
                }}
              >
                <span
                  style={{
                    color: putInFill > 0.5 ? COLORS.white : COLORS.lightText + "80",
                    fontSize: 20,
                    fontFamily: FONTS.body,
                  }}
                >
                  {putInFill > 0.5 ? "Cedargrove" : "Select put-in..."}
                </span>
              </div>
            </div>

            {/* Take-out selector */}
            <div>
              <label
                style={{
                  color: COLORS.lightText,
                  fontSize: 16,
                  fontFamily: FONTS.body,
                  fontWeight: 500,
                  marginBottom: 8,
                  display: "block",
                }}
              >
                Take-Out
              </label>
              <div
                style={{
                  backgroundColor: `${COLORS.white}20`,
                  borderRadius: 12,
                  padding: "16px 24px",
                  border: `2px solid ${takeOutFill > 0.5 ? "#EF4444" : "transparent"}`,
                }}
              >
                <span
                  style={{
                    color: takeOutFill > 0.5 ? COLORS.white : COLORS.lightText + "80",
                    fontSize: 20,
                    fontFamily: FONTS.body,
                  }}
                >
                  {takeOutFill > 0.5 ? "Akers Ferry" : "Select take-out..."}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Screenshot */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            borderRadius: "40px 0 0 40px",
            boxShadow: "-20px 0 60px rgba(0, 0, 0, 0.4)",
          }}
        >
          <Img
            src={staticFile("screenshots/river-takeout.png")}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${scale})`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
