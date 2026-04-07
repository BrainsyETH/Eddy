import React from "react";
import {
  AbsoluteFill,
  Series,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { Watermark } from "../../components/Watermark";
import { RiverCard } from "./RiverCard";
import { ENTRANCE } from "../../lib/spring-presets";
import { SEVERITY_ORDER, type DigestReelProps, type ConditionCode } from "../../lib/social-props";
import { colors } from "../../design-tokens/colors";

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
    <AbsoluteFill
      style={{
        backgroundColor: colors.primary[900],
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: isPortrait ? 32 : 24,
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
          fontSize: isPortrait ? 24 : 22,
          color: "rgba(255,255,255,0.6)",
        }}
      >
        {dateLabel}
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

  // Energetic bounce for the otter on the final slide
  const bounce = spring({
    frame: frame - 15,
    fps,
    config: { damping: 8, mass: 0.5, stiffness: 150 },
  });
  const eddyScale = interpolate(bounce, [0, 1], [0.8, 1]);
  const eddyRotate = interpolate(bounce, [0, 0.5, 1], [0, -8, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.primary[900],
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      {/* Subtle glow behind Eddy */}
      <div
        style={{
          position: "absolute",
          top: "35%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)",
          opacity: bounce,
        }}
      />

      <div
        style={{
          transform: `scale(${eddyScale}) rotate(${eddyRotate}deg)`,
        }}
      >
        <EddyMascot
          variant="green"
          size={isPortrait ? 200 : 160}
          delay={0}
          float={false}
        />
      </div>

      <div
        style={{
          opacity: entrance,
          transform: `translateY(${y}px)`,
          fontFamily: "'Fredoka', system-ui, sans-serif",
          fontSize: isPortrait ? 40 : 36,
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
          fontSize: isPortrait ? 28 : 24,
          color: colors.accent[400],
          textShadow: "0 0 20px rgba(244,142,118,0.3)",
        }}
      >
        eddy.guide
      </div>
    </AbsoluteFill>
  );
};

/**
 * River cards slide — shows a batch of river condition cards.
 * Each card staggers in with cascade animation.
 */
const RiverCardsSlide: React.FC<{
  rivers: DigestReelProps["rivers"];
  isPortrait: boolean;
}> = ({ rivers, isPortrait }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.primary[900],
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: isPortrait ? 16 : 12,
        padding: isPortrait ? "60px 40px" : "40px",
      }}
    >
      {rivers.map((river, i) => (
        <RiverCard
          key={river.riverName}
          riverName={river.riverName}
          conditionCode={river.conditionCode}
          gaugeHeightFt={river.gaugeHeightFt}
          delay={i * 6}
          width={isPortrait ? 950 : 900}
        />
      ))}
    </AbsoluteFill>
  );
};

/**
 * Multi-river daily digest reel.
 * Rivers are sorted by condition severity (dangerous/flowing first).
 *
 * Structure:
 *   Title slide (60 frames) → River cards in batches → CTA slide (60 frames)
 */
export const DigestReel: React.FC<DigestReelProps> = ({
  rivers,
  dateLabel,
  format,
}) => {
  const isPortrait = format === "portrait";

  // Sort rivers by severity (dangerous/flowing first, unknown last)
  const sortedRivers = [...rivers].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.conditionCode] ?? 6) -
      (SEVERITY_ORDER[b.conditionCode] ?? 6)
  );

  // Split into batches
  const batchSize = isPortrait ? 6 : 5;
  const batches: DigestReelProps["rivers"][] = [];
  for (let i = 0; i < sortedRivers.length; i += batchSize) {
    batches.push(sortedRivers.slice(i, i + batchSize));
  }

  const titleFrames = 60;
  const ctaFrames = 60;
  const batchFrames = Math.floor(
    (batches.length * 90) / Math.max(batches.length, 1)
  );

  return (
    <AbsoluteFill>
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

/** Calculate total frames based on river count (for calculateMetadata) */
export function getDigestDuration(riverCount: number): number {
  const batchSize = 5;
  const batches = Math.ceil(riverCount / batchSize);
  const titleFrames = 60;
  const ctaFrames = 60;
  const middleFrames = Math.max(batches, 1) * 90;
  return titleFrames + middleFrames + ctaFrames;
}
