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
import { Watermark } from "../../components/Watermark";
import { ENTRANCE, SNAPPY } from "../../lib/spring-presets";
import { REEL_SAFE, reelLoopOpacity } from "../../lib/reel-safe";
import {
  CONDITION_COLORS,
  getOtterVariant,
  type SectionGuideProps,
} from "../../lib/social-props";
import { colors } from "../../design-tokens/colors";

const FPS = 30;

/**
 * Float Section Guide reel — 12s, 1080x1920.
 *
 * Layout (top to bottom):
 *   - Title: "Float of the Week"
 *   - River name
 *   - Date label
 *   - Route card: "Put-in → Take-out" with mile markers
 *   - Stats strip: distance | hours | condition
 *   - Eddy mascot
 *   - CTA: "Plan this float at eddy.guide"
 *
 * Timeline:
 *   0-20: Bg fade, title drops in
 *  10-30: River name
 *  20-40: Date
 *  30-55: Route card slides from left
 *  50-75: Stats strip scales in
 *  60-85: Eddy bounces
 *  290+:  CTA
 */
export const SectionGuide: React.FC<SectionGuideProps> = ({
  riverName,
  conditionCode,
  putInName,
  putInMile,
  takeOutName,
  takeOutMile,
  distanceMi,
  hoursCanoe,
  dateLabel,
  format,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const condition = CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;
  const isPortrait = format === "portrait";
  const loopOpacity = isPortrait ? reelLoopOpacity(frame, durationInFrames) : 1;

  const titleEntrance = spring({ frame, fps, config: ENTRANCE });
  const riverEntrance = spring({ frame: frame - 10, fps, config: ENTRANCE });
  const dateEntrance = spring({ frame: frame - 20, fps, config: ENTRANCE });
  const routeEntrance = spring({ frame: frame - 30, fps, config: SNAPPY });
  const routeX = interpolate(routeEntrance, [0, 1], [-60, 0]);
  const statsEntrance = spring({ frame: frame - 50, fps, config: SNAPPY });
  const statsScale = interpolate(statsEntrance, [0, 1], [0.85, 1]);
  const ctaEntrance = spring({
    frame: frame - 290,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 100 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], opacity: loopOpacity }}>
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={(f) =>
          interpolate(f, [0, FPS, durationInFrames - FPS, durationInFrames], [0, 0.5, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${condition.glow} 0%, transparent 65%)`,
          opacity: 0.35,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: isPortrait ? REEL_SAFE.top : 48,
          bottom: isPortrait ? REEL_SAFE.bottom : 48,
          left: isPortrait ? REEL_SAFE.left : 48,
          right: isPortrait ? REEL_SAFE.right : 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
        }}
      >
        {/* Title */}
        <div
          style={{
            opacity: titleEntrance,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 42 : 32,
            fontWeight: 500,
            color: colors.accent[400],
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Float of the Week
        </div>

        {/* River name */}
        <div
          style={{
            opacity: riverEntrance,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 76 : 56,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
            textShadow: `0 0 30px ${condition.glow}`,
            marginTop: -8,
          }}
        >
          {riverName}
        </div>

        {/* Date */}
        {dateLabel && (
          <div
            style={{
              opacity: dateEntrance,
              fontFamily: "'Geist Sans', system-ui, sans-serif",
              fontSize: isPortrait ? 28 : 22,
              color: "rgba(255,255,255,0.55)",
              marginTop: -14,
            }}
          >
            {dateLabel}
          </div>
        )}

        {/* Route card — put-in → take-out */}
        <div
          style={{
            opacity: routeEntrance,
            transform: `translateX(${routeX}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            backgroundColor: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20,
            padding: isPortrait ? "28px 36px" : "22px 28px",
            maxWidth: isPortrait ? 900 : 720,
            marginTop: 10,
          }}
        >
          <RouteRow
            label="Put-in"
            name={putInName}
            mile={putInMile}
            accentColor={colors.accent[400]}
            isPortrait={isPortrait}
          />
          <div
            style={{
              height: 1,
              margin: isPortrait ? "18px 0" : "14px 0",
              background: "linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent)",
            }}
          />
          <RouteRow
            label="Take-out"
            name={takeOutName}
            mile={takeOutMile}
            accentColor={condition.solid}
            isPortrait={isPortrait}
          />
        </div>

        {/* Stats strip */}
        <div
          style={{
            opacity: statsEntrance,
            transform: `scale(${statsScale})`,
            display: "flex",
            gap: isPortrait ? 48 : 32,
            alignItems: "center",
            marginTop: 4,
          }}
        >
          <StatCell value={`${distanceMi.toFixed(1)} mi`} label="Distance" isPortrait={isPortrait} />
          <StatCell value={`${hoursCanoe.toFixed(1)} hrs`} label="Est. canoe" isPortrait={isPortrait} />
          <StatCell
            value={condition.label}
            label="Conditions"
            color={condition.solid}
            isPortrait={isPortrait}
          />
        </div>

        {/* Eddy */}
        <div style={{ marginTop: 6 }}>
          <EddyMascot
            variant={getOtterVariant(conditionCode)}
            size={isPortrait ? 170 : 130}
            delay={60}
          />
        </div>

        {/* CTA */}
        <div
          style={{
            opacity: ctaEntrance,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 28 : 22,
            color: condition.solid,
            letterSpacing: 0.5,
          }}
        >
          Plan this float at eddy.guide
        </div>
      </div>

      <div style={{ opacity: interpolate(frame, [270, 300], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <Watermark format={isPortrait ? "portrait" : "landscape"} />
      </div>
    </AbsoluteFill>
  );
};

const RouteRow: React.FC<{
  label: string;
  name: string;
  mile: number;
  accentColor: string;
  isPortrait: boolean;
}> = ({ label, name, mile, accentColor, isPortrait }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
    <div
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        backgroundColor: accentColor,
        boxShadow: `0 0 10px ${accentColor}`,
        flexShrink: 0,
      }}
    />
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <span
        style={{
          fontFamily: "'Geist Sans', system-ui, sans-serif",
          fontSize: isPortrait ? 20 : 16,
          color: "rgba(255,255,255,0.5)",
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'Fredoka', system-ui, sans-serif",
          fontSize: isPortrait ? 34 : 26,
          fontWeight: 600,
          color: "#fff",
          lineHeight: 1.15,
        }}
      >
        {name}
      </span>
    </div>
    <span
      style={{
        fontFamily: "'Geist Mono', 'SF Mono', monospace",
        fontSize: isPortrait ? 22 : 18,
        color: "rgba(255,255,255,0.5)",
        flexShrink: 0,
      }}
    >
      MM {mile.toFixed(1)}
    </span>
  </div>
);

const StatCell: React.FC<{
  value: string;
  label: string;
  color?: string;
  isPortrait: boolean;
}> = ({ value, label, color, isPortrait }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
    <span
      style={{
        fontFamily: "'Fredoka', system-ui, sans-serif",
        fontSize: isPortrait ? 38 : 28,
        fontWeight: 600,
        color: color || "#fff",
      }}
    >
      {value}
    </span>
    <span
      style={{
        fontFamily: "'Geist Sans', system-ui, sans-serif",
        fontSize: isPortrait ? 18 : 14,
        color: "rgba(255,255,255,0.5)",
        textTransform: "uppercase",
        letterSpacing: 1,
        marginTop: 2,
      }}
    >
      {label}
    </span>
  </div>
);
