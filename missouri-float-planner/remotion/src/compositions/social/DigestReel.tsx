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

/** Title slide — "River Report" + date + Eddy */
const TitleSlide: React.FC<{ dateLabel: string; isPortrait: boolean }> = ({
  dateLabel,
  isPortrait,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleEntrance = spring({ frame, fps, config: ENTRANCE });
  const titleY = interpolate(titleEntrance, [0, 1], [50, 0]);
  const dateEntrance = spring({ frame: frame - 10, fps, config: ENTRANCE });

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
          gap: isPortrait ? 32 : 24,
        }}
      >
        <EddyMascot variant="canoe" size={isPortrait ? 220 : 170} delay={5} />
        <div
          style={{
            opacity: titleEntrance,
            transform: `translateY(${titleY}px)`,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 58 : 48,
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
  const bounce = spring({ frame: frame - 15, fps, config: { damping: 8, mass: 0.5, stiffness: 150 } });
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
          width: 300, height: 300, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)",
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
        <div style={{ transform: `scale(${eddyScale}) rotate(${eddyRotate}deg)` }}>
          <EddyMascot variant="green" size={isPortrait ? 180 : 150} delay={0} float={false} />
        </div>
        <div
          style={{
            opacity: entrance, transform: `translateY(${y}px)`,
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 38 : 34, fontWeight: 600, color: "#fff", textAlign: "center",
          }}
        >
          Plan your float
        </div>
        <div
          style={{
            opacity: entrance, fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: isPortrait ? 26 : 22, color: colors.accent[400],
            textShadow: "0 0 20px rgba(244,142,118,0.3)",
          }}
        >
          eddy.guide
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** River cards slide within safe zones */
const RiverCardsSlide: React.FC<{
  rivers: DigestReelProps["rivers"];
  isPortrait: boolean;
}> = ({ rivers, isPortrait }) => (
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
        gap: isPortrait ? 14 : 12,
      }}
    >
      {rivers.map((river, i) => (
        <RiverCard
          key={river.riverName}
          riverName={river.riverName}
          conditionCode={river.conditionCode}
          gaugeHeightFt={river.gaugeHeightFt}
          delay={i * 6}
          width={isPortrait ? 900 : 850}
        />
      ))}
    </div>
  </AbsoluteFill>
);

/**
 * Multi-river daily digest reel with severity sorting, safe zones, and music.
 */
export const DigestReel: React.FC<DigestReelProps> = ({ rivers, dateLabel, format }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const isPortrait = format === "portrait";

  const sortedRivers = [...rivers].sort(
    (a, b) => (SEVERITY_ORDER[a.conditionCode] ?? 6) - (SEVERITY_ORDER[b.conditionCode] ?? 6)
  );

  const batchSize = isPortrait ? 6 : 5;
  const batches: DigestReelProps["rivers"][] = [];
  for (let i = 0; i < sortedRivers.length; i += batchSize) {
    batches.push(sortedRivers.slice(i, i + batchSize));
  }

  const titleFrames = 60;
  const ctaFrames = 60;
  const batchFrames = Math.floor((batches.length * 90) / Math.max(batches.length, 1));

  const musicVolume = interpolate(
    frame,
    [0, 15, durationInFrames - 30, durationInFrames],
    [0, 0.12, 0.12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill>
      <Audio src={staticFile("audio/background-music.mp3")} volume={musicVolume} />
      <Series>
        <Series.Sequence durationInFrames={titleFrames}>
          <TitleSlide dateLabel={dateLabel} isPortrait={isPortrait} />
        </Series.Sequence>
        {batches.map((batch, i) => (
          <Series.Sequence key={i} durationInFrames={batchFrames}>
            <RiverCardsSlide rivers={batch} isPortrait={isPortrait} />
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={ctaFrames}>
          <CTASlide isPortrait={isPortrait} />
        </Series.Sequence>
      </Series>
      <Watermark format={isPortrait ? "portrait" : "landscape"} />
    </AbsoluteFill>
  );
};

export function getDigestDuration(riverCount: number): number {
  const batches = Math.ceil(riverCount / 5);
  return 60 + Math.max(batches, 1) * 90 + 60;
}
