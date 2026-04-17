import React from "react";
import {
  AbsoluteFill,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import {
  CONDITION_COLORS,
  getOtterVariant,
  type BrandedLoopProps,
} from "../../lib/social-props";
import { colors } from "../../design-tokens/colors";

// Reel-safe content zones (1080x1920 portrait)
const SAFE = {
  top: 100,
  bottom: 270,
  right: 80,
  left: 20,
};

/**
 * Simple branded loop with glassmorphism, condition glow, safe zones, and music.
 * 4 seconds (120 frames @ 30fps), 1080x1080.
 * Designed to loop seamlessly.
 */
export const BrandedLoop: React.FC<BrandedLoopProps> = ({
  riverName,
  conditionCode,
  summaryText,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const condition = CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;

  const envelope = interpolate(
    frame,
    [0, 25, durationInFrames - 25, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const breathe = 0.5 + 0.5 * Math.sin((frame / durationInFrames) * Math.PI * 2);

  const textEntrance = spring({
    frame,
    fps,
    config: { damping: 20, mass: 0.6, stiffness: 100 },
  });
  const textY = interpolate(textEntrance, [0, 1], [30, 0]);

  // BrandedLoop is 1080x1080 square — use smaller safe margins
  const isSquare = true;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.primary[900],
        fontFamily: "'Geist Sans', system-ui, sans-serif",
      }}
    >
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={(f) =>
          interpolate(f, [0, 15, durationInFrames - 15, durationInFrames], [0, 0.5, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      {/* Radial glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 45%, ${condition.glow} 0%, transparent 60%)`,
          opacity: breathe * 0.6,
        }}
      />

      {/* Ambient ring */}
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 400,
          height: 400,
          borderRadius: "50%",
          border: `1px solid ${condition.bg}`,
          opacity: breathe * 0.3,
        }}
      />

      {/* Safe zone content */}
      <div
        style={{
          position: "absolute",
          top: isSquare ? 40 : SAFE.top,
          bottom: isSquare ? 40 : SAFE.bottom,
          left: isSquare ? 40 : SAFE.left,
          right: isSquare ? 40 : SAFE.right,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          opacity: envelope,
        }}
      >
        <EddyMascot
          variant={getOtterVariant(conditionCode)}
          size={220}
          delay={0}
          float
        />

        <div
          style={{
            transform: `translateY(${textY}px)`,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: 44,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
            textShadow: `0 0 30px ${condition.glow}`,
          }}
        >
          {riverName}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            backgroundColor: condition.bg,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: "8px 20px",
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
              boxShadow: `0 0 6px ${condition.solid}`,
            }}
          />
          <span
            style={{
              fontFamily: "'Fredoka', system-ui, sans-serif",
              fontSize: 22,
              fontWeight: 600,
              color: condition.solid,
            }}
          >
            {condition.label}
          </span>
        </div>

        <div
          style={{
            maxWidth: 700,
            textAlign: "center",
            opacity: interpolate(
              frame,
              [30, 50, durationInFrames - 30, durationInFrames - 10],
              [0, 1, 1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            ),
          }}
        >
          <span
            style={{
              fontSize: 20,
              color: "rgba(255,255,255,0.8)",
              lineHeight: 1.5,
              fontStyle: "italic",
            }}
          >
            &ldquo;{summaryText}&rdquo;
          </span>
        </div>

        <span
          style={{
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: 18,
            color: "rgba(255,255,255,0.35)",
            letterSpacing: 1,
          }}
        >
          eddy.guide
        </span>
      </div>
    </AbsoluteFill>
  );
};
