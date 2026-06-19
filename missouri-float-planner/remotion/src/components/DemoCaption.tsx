import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { colors } from "../design-tokens/colors";
import { fontFamilies } from "../design-tokens/fonts";

/**
 * Punchy muted-safe lower third for the Demo Walkthrough. One line per clip
 * (keep ≤ 6 words). Fades in and out within its own sequence, and sits above a
 * height-proportional safe area so it clears the TikTok/Reels bottom chrome on
 * the tall cut and stays balanced on the 4:5 / 1:1 cuts.
 *
 * Fredoka (display) + the coral accent underline match Eddy's brand, and the
 * fonts are loaded up-front in src/index.ts so the render is deterministic.
 */
export const DemoCaption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, height } = useVideoConfig();
  if (!text) return null;

  const opacity = interpolate(
    frame,
    [0, 8, durationInFrames - 8, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const y = interpolate(frame, [0, 8], [26, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: Math.round(height * 0.2),
        paddingLeft: 48,
        paddingRight: 48,
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${y}px)`,
          background: "rgba(15,45,53,0.82)",
          color: "#fff",
          fontFamily: fontFamilies.display,
          fontSize: 56,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          lineHeight: 1.1,
          padding: "22px 38px",
          borderRadius: 26,
          maxWidth: "88%",
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
          borderBottom: `4px solid ${colors.accent[400]}`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
