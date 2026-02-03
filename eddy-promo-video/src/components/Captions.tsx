import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { NARRATION_SCRIPT, COLORS, FONTS } from "../lib/constants";

/**
 * Synchronized caption overlay
 * Shows narration text at the bottom of the screen, timed to the audio
 */
export const Captions: React.FC = () => {
  const frame = useCurrentFrame();

  // Find the current caption based on frame
  const currentCaption = NARRATION_SCRIPT.find(
    (caption) => frame >= caption.startFrame && frame <= caption.endFrame
  );

  if (!currentCaption) return null;

  // Fade in/out animation
  const fadeInDuration = 10;
  const fadeOutDuration = 10;

  const opacity = interpolate(
    frame,
    [
      currentCaption.startFrame,
      currentCaption.startFrame + fadeInDuration,
      currentCaption.endFrame - fadeOutDuration,
      currentCaption.endFrame,
    ],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  // Subtle slide up animation
  const translateY = interpolate(
    frame,
    [currentCaption.startFrame, currentCaption.startFrame + fadeInDuration],
    [10, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0 60px",
        opacity,
        transform: `translateY(${translateY}px)`,
        zIndex: 100,
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(11, 37, 69, 0.85)",
          backdropFilter: "blur(10px)",
          padding: "20px 40px",
          borderRadius: 12,
          border: `1px solid ${COLORS.skyBlue}30`,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
          maxWidth: "80%",
        }}
      >
        <p
          style={{
            color: COLORS.white,
            fontSize: 36,
            fontFamily: FONTS.body,
            fontWeight: 500,
            textAlign: "center",
            margin: 0,
            lineHeight: 1.4,
            textShadow: "0 2px 10px rgba(0, 0, 0, 0.3)",
          }}
        >
          {currentCaption.text}
        </p>
      </div>
    </div>
  );
};
