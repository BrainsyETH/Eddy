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
import { ProgressBar } from "../components/ProgressBar";
import { Watermark } from "../components/Watermark";
import { scenes, getSceneFrames } from "../lib/voiceover";

import { IntroScene } from "./scenes/01-Intro";
import { HomeScene } from "./scenes/02-HomeScreen";
import { RiversListScene } from "./scenes/03-RiversList";
import { RiverDetailScene } from "./scenes/04-RiverDetail";
import { FloatPlannerScene } from "./scenes/05-FloatPlanner";
import { GaugesScene } from "./scenes/06-Gauges";
import { AccessPointScene } from "./scenes/07-AccessPoint";
import { SharePlanScene } from "./scenes/08-SharePlan";
import { AskEddyScene } from "./scenes/09-AskEddy";
import { OutroScene } from "./scenes/10-Outro";

interface TutorialFullProps {
  format?: "landscape" | "portrait";
}

/**
 * Full tutorial composition — sequences all scenes with background music.
 * Renders in both landscape (1920x1080) and portrait (1080x1920) formats.
 */
export const TutorialFull: React.FC<TutorialFullProps> = ({
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Background music volume: fade in over 1s, hold, fade out over 2s
  const musicVolume = interpolate(
    frame,
    [0, 30, durationInFrames - 60, durationInFrames],
    [0, 0.12, 0.12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill className="bg-neutral-50">
      {/* Background music — runs full duration */}
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={musicVolume}
      />

      {/* Progress bar */}
      <ProgressBar position="top" format={format} />

      {/* Watermark */}
      <Watermark format={format} />

      {/* Scene sequence */}
      <Series>
        <Series.Sequence durationInFrames={getSceneFrames(scenes[0])}>
          <IntroScene format={format} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(scenes[1])}>
          <HomeScene format={format} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(scenes[2])}>
          <RiversListScene format={format} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(scenes[3])}>
          <RiverDetailScene format={format} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(scenes[4])}>
          <FloatPlannerScene format={format} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(scenes[5])}>
          <GaugesScene format={format} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(scenes[6])}>
          <AccessPointScene format={format} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(scenes[7])}>
          <SharePlanScene format={format} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(scenes[8])}>
          <AskEddyScene format={format} />
        </Series.Sequence>

        <Series.Sequence durationInFrames={getSceneFrames(scenes[9])}>
          <OutroScene format={format} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
