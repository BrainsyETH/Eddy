import React from "react";
import {
  AbsoluteFill,
  Audio,
  Series,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { Watermark } from "../../components/Watermark";
import { RiverCard } from "./RiverCard";
import { ENTRANCE } from "../../lib/spring-presets";
import { SEVERITY_ORDER, type DigestReelProps } from "../../lib/social-props";
import { colors } from "../../design-tokens/colors";

// Reel-safe content zones (1080x1920 portrait)
const SAFE = {
  top: 100,
  bottom: 270,
  right: 80,
  left: 20,
};

/** Title slide — "River Report" + date + Eddy + global quote */
const TitleSlide: React.FC<{
  dateLabel: string;
  globalQuote?: string;
  isPortrait: boolean;
}> = ({ dateLabel, globalQuote, isPortrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleEntrance = spring({ frame, fps, config: ENTRANCE });
  const titleY = interpolate(titleEntrance, [0, 1], [50, 0]);
  const dateEntrance = spring({ frame: frame - 10, fps, config: ENTRANCE });
  const quoteEntrance = spring({ frame: frame - 20, fps, config: ENTRANCE });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900] }}>
      <div
        style={{
          position: "absolute",
          top: isPortrait ? SAFE.top : 48,
          bottom: isPortrait ? SAFE.bottom : 48,
          left: isPortrait ? SAFE.left : 48,
          right: isPortrait ? SAFE.right : 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: isPortrait ? 24 : 20,
        }}
      >
        <EddyMascot variant="canoe" size={isPortrait ? 200 : 160} delay={5} />
        <div
          style={{
            opacity: titleEntrance,
            transform: `translateY(${titleY}px)`,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 56 : 48,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
          }}
        >
          River Report
        </div>
        <div
          style={{
            opacity: dateEntrance,
            fontFamily: "'Geist Sans', system-ui, sans-serif",
            fontSize: isPortrait ? 22 : 20,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          {dateLabel}
        </div>
        {globalQuote && (
          <div
            style={{
              opacity: quoteEntrance,
              maxWidth: isPortrait ? 850 : 750,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            <span
              style={{
                fontSize: isPortrait ? 22 : 18,
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.5,
                fontStyle: "italic",
              }}
            >
              &ldquo;{globalQuote}&rdquo;
            </span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** CTA slide — "Plan your float" with energetic Eddy */
const CTASlide: React.FC<{ isPortrait: boolean }> = ({ isPortrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({ frame, fps, config: ENTRANCE });
  const y = interpolate(entrance, [0, 1], [40, 0]);
  const bounce = spring({
    frame: frame - 15,
    fps,
    config: { damping: 8, mass: 0.5, stiffness: 150 },
  });
  const eddyScale = interpolate(bounce, [0, 1], [0.8, 1]);
  const eddyRotate = interpolate(bounce, [0, 0.5, 1], [0, -8, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900] }}>
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)",
          opacity: bounce,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: isPortrait ? SAFE.top : 48,
          bottom: isPortrait ? SAFE.bottom : 48,
          left: isPortrait ? SAFE.left : 48,
          right: isPortrait ? SAFE.right : 48,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            transform: `scale(${eddyScale}) rotate(${eddyRotate}deg)`,
          }}
        >
          <EddyMascot
            variant="green"
            size={isPortrait ? 180 : 150}
            delay={0}
            float={false}
          />
        </div>
        <div
          style={{
            opacity: entrance,
            transform: `translateY(${y}px)`,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 38 : 34,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
          }}
        >
          Plan your float
        </div>
        <div
          style={{
            opacity: entrance,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 26 : 22,
            color: colors.accent[400],
            textShadow: "0 0 20px rgba(244,142,118,0.3)",
          }}
        >
          eddy.guide
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * ALL rivers on a single screen — no batching/pagination.
 * Cards are sized to fit up to 10 rivers in the safe zone.
 */
const RiverCardsSlide: React.FC<{
  rivers: DigestReelProps["rivers"];
  isPortrait: boolean;
}> = ({ rivers, isPortrait }) => {
  // Scale card size based on river count to fit all on one screen
  const count = rivers.length;
  const cardGap = count > 8 ? 8 : count > 6 ? 10 : 14;
  const cardWidth = isPortrait ? 920 : 850;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900] }}>
      <div
        style={{
          position: "absolute",
          top: isPortrait ? SAFE.top : 40,
          bottom: isPortrait ? SAFE.bottom : 40,
          left: isPortrait ? SAFE.left : 40,
          right: isPortrait ? SAFE.right : 40,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: cardGap,
        }}
      >
        {rivers.map((river, i) => (
          <RiverCard
            key={river.riverName}
            riverName={river.riverName}
            conditionCode={river.conditionCode}
            gaugeHeightFt={river.gaugeHeightFt}
            delay={i * 5}
            width={cardWidth}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Multi-river daily digest reel.
 * ALL rivers shown on a single screen (no pagination).
 * Includes global Eddy Says quote on the title slide.
 *
 * Structure: Title (with global quote) → All rivers → CTA
 */
export const DigestReel: React.FC<DigestReelProps> = ({
  rivers,
  dateLabel,
  globalQuote,
  format,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const isPortrait = format === "portrait";

  // Sort rivers by severity (dangerous/flowing first)
  const sortedRivers = [...rivers].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.conditionCode] ?? 6) -
      (SEVERITY_ORDER[b.conditionCode] ?? 6)
  );

  const titleFrames = globalQuote ? 90 : 60; // More time if there's a quote to read
  const riverFrames = 120; // 4 seconds for all rivers
  const ctaFrames = 60;

  const musicVolume = interpolate(
    frame,
    [0, 15, durationInFrames - 30, durationInFrames],
    [0, 0.12, 0.12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill>
      <Audio
        src={staticFile("audio/background-music.mp3")}
        volume={musicVolume}
      />
      <Series>
        <Series.Sequence durationInFrames={titleFrames}>
          <TitleSlide
            dateLabel={dateLabel}
            globalQuote={globalQuote}
            isPortrait={isPortrait}
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={riverFrames}>
          <RiverCardsSlide
            rivers={sortedRivers}
            isPortrait={isPortrait}
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={ctaFrames}>
          <CTASlide isPortrait={isPortrait} />
        </Series.Sequence>
      </Series>
      <Watermark format={isPortrait ? "portrait" : "landscape"} />
    </AbsoluteFill>
  );
};

/** Calculate total frames — always 3 slides now (title + rivers + CTA) */
export function getDigestDuration(riverCount: number, hasGlobalQuote = false): number {
  const titleFrames = hasGlobalQuote ? 90 : 60;
  const riverFrames = 120;
  const ctaFrames = 60;
  return titleFrames + riverFrames + ctaFrames;
}
