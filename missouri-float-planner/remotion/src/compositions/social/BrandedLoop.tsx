import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import {
  CONDITION_COLORS,
  getOtterVariant,
  type BrandedLoopProps,
} from "../../lib/social-props";
import { colors } from "../../design-tokens/colors";

/**
 * Simple branded loop — Eddy otter + condition text with subtle motion.
 * 4 seconds (120 frames @ 30fps), 1080x1080.
 * Designed to loop seamlessly: frame 120 fades back to match frame 0.
 */
export const BrandedLoop: React.FC<BrandedLoopProps> = ({
  riverName,
  conditionCode,
  summaryText,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const condition = CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;

  // ─── Looping envelope ───────────────────────────────────
  // Fade in 0-25, hold 25-95, fade out 95-120 (matches start for seamless loop)
  const envelope = interpolate(
    frame,
    [0, 25, durationInFrames - 25, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Gentle breathing pulse on the glow
  const breathe =
    0.6 + 0.4 * Math.sin((frame / durationInFrames) * Math.PI * 2);

  // Text entrance (first cycle only via envelope)
  const textEntrance = spring({
    frame,
    fps,
    config: { damping: 20, mass: 0.6, stiffness: 100 },
  });
  const textY = interpolate(textEntrance, [0, 1], [30, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.primary[900],
        fontFamily: "'Geist Sans', system-ui, sans-serif",
      }}
    >
      {/* Radial glow in condition color */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 55%, ${condition.solid}33 0%, transparent 65%)`,
          opacity: breathe,
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
          gap: 28,
          padding: "48px",
          opacity: envelope,
        }}
      >
        {/* Eddy Mascot — floats continuously */}
        <EddyMascot
          variant={getOtterVariant(conditionCode)}
          size={240}
          delay={0}
          float
        />

        {/* River name */}
        <div
          style={{
            transform: `translateY(${textY}px)`,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: 44,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
          }}
        >
          {riverName}
        </div>

        {/* Condition badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            backgroundColor: condition.bg,
            padding: "8px 20px",
            borderRadius: 999,
            border: `2px solid ${condition.solid}`,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: condition.solid,
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

        {/* Summary text */}
        <div
          style={{
            maxWidth: 750,
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

        {/* eddy.guide branding */}
        <span
          style={{
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: 18,
            color: "rgba(255,255,255,0.4)",
            letterSpacing: 1,
          }}
        >
          eddy.guide
        </span>
      </div>
    </AbsoluteFill>
  );
};
