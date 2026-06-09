import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { TitleCard } from "../../components/TitleCard";
import { Subtitle } from "../../components/Subtitle";
import { scenes } from "../../lib/voiceover";

interface IntroSceneProps {
  format?: "landscape" | "portrait";
}

const scene = scenes[0];

/**
 * Scene 01: Title card with Eddy mascot entrance.
 * Dark gradient background, Eddy (canoe) springs up, title fades in.
 */
export const IntroScene: React.FC<IntroSceneProps> = ({
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Fade out near the end
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #163F4A 0%, #0F2D35 100%)",
        opacity: fadeOut,
      }}
    >
      {/* Voiceover */}
      <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

      {/* Background subtle pattern */}
      <AbsoluteFill className="flex items-center justify-center">
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0 L60 30 L30 60 L0 30Z' fill='none' stroke='%23fff' stroke-width='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: "60px 60px",
          }}
        />
      </AbsoluteFill>

      {/* Content */}
      <AbsoluteFill className="flex flex-col items-center justify-center gap-8">
        <EddyMascot
          variant="canoe"
          size={format === "portrait" ? 240 : 280}
          delay={5}
          float
        />
        <TitleCard
          title="Eddy"
          subtitle="Your Midwest Float Trip Guide"
        />
      </AbsoluteFill>

      {/* Subtitle */}
      <Subtitle text={scene.script} delay={10} format={format} />
    </AbsoluteFill>
  );
};
