import React from "react";
import {
  AbsoluteFill,
  Audio,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { reelScenes, getSceneFrames } from "../lib/voiceover";

import { ReelHook } from "./reel/ReelHook";
import { ReelConditions } from "./reel/ReelConditions";
import { ReelMapPlan } from "./reel/ReelMapPlan";
import { ReelGauges } from "./reel/ReelGauges";
import { ReelShareCTA } from "./reel/ReelShareCTA";

/**
 * Full reel composition — sequences 5 punchy scenes with background music.
 * Optimized for TikTok/Reels (~35s, 1080x1920).
 */
export const ReelFull: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Background music: slightly louder than website version, faster fade-in
  const musicVolume = interpolate(
    frame,
    [0, 15, durationInFrames - 45, durationInFrames],
    [0, 0.15, 0.15, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill className="bg-neutral-50">
      {/* Background music */}
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={musicVolume}
      />

      {/* Scene sequence */}
      <Series>
        <Series.Sequence durationInFrames={getSceneFrames(reelScenes[0])}>
          <ReelHook />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(reelScenes[1])}>
          <ReelConditions />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(reelScenes[2])}>
          <ReelMapPlan />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(reelScenes[3])}>
          <ReelGauges />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(reelScenes[4])}>
          <ReelShareCTA />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
