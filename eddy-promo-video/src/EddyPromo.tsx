import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  staticFile,
  interpolate,
} from "remotion";
import { VIDEO_CONFIG, SCENES, COLORS } from "./lib/constants";
import { Captions } from "./components/Captions";

// Scenes
import { OpeningScene } from "./scenes/OpeningScene";
import { IntroEddyScene } from "./scenes/IntroEddyScene";
import { PlanFloatScene } from "./scenes/PlanFloatScene";
import { RiverGaugesScene } from "./scenes/RiverGaugesScene";
import { AccessPointsScene } from "./scenes/AccessPointsScene";
import { BlogGuidesScene } from "./scenes/BlogGuidesScene";
import { StatsScene } from "./scenes/StatsScene";
import { CTAScene } from "./scenes/CTAScene";

export const EddyPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.deepWater }}>
      {/* ─── Google Fonts ─────────────────────────────────────────────── */}
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        `}
      </style>

      {/* ─── Scene Sequences ────────────────────────────────────────────── */}

      <Sequence from={SCENES.opening.start} durationInFrames={SCENES.opening.duration}>
        <OpeningScene />
      </Sequence>

      <Sequence from={SCENES.introEddy.start} durationInFrames={SCENES.introEddy.duration}>
        <IntroEddyScene />
      </Sequence>

      <Sequence from={SCENES.planFloat.start} durationInFrames={SCENES.planFloat.duration}>
        <PlanFloatScene />
      </Sequence>

      <Sequence from={SCENES.riverGauges.start} durationInFrames={SCENES.riverGauges.duration}>
        <RiverGaugesScene />
      </Sequence>

      <Sequence from={SCENES.accessPoints.start} durationInFrames={SCENES.accessPoints.duration}>
        <AccessPointsScene />
      </Sequence>

      <Sequence from={SCENES.blogGuides.start} durationInFrames={SCENES.blogGuides.duration}>
        <BlogGuidesScene />
      </Sequence>

      <Sequence from={SCENES.stats.start} durationInFrames={SCENES.stats.duration}>
        <StatsScene />
      </Sequence>

      <Sequence from={SCENES.cta.start} durationInFrames={SCENES.cta.duration}>
        <CTAScene />
      </Sequence>

      {/* ─── Captions (overlaid on all scenes) ──────────────────────────── */}
      <Captions />

      {/* ─── Audio Tracks ───────────────────────────────────────────────── */}
      {/*
        Uncomment these once you've generated/added your audio files:
        
        1. Narration (TTS voice-over):
        <Audio src={staticFile("audio/narration.mp3")} />
        
        2. Background music (ambient/chill):
        <Audio 
          src={staticFile("audio/background-music.mp3")} 
          volume={(f) => 
            interpolate(f, [VIDEO_CONFIG.totalFrames - 90, VIDEO_CONFIG.totalFrames], [0.15, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      */}
    </AbsoluteFill>
  );
};
