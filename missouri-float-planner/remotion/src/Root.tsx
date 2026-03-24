import React from "react";
import { Composition } from "remotion";
import { TutorialFull } from "./compositions/TutorialFull";
import { IntroScene } from "./compositions/scenes/01-Intro";
import { HomeScene } from "./compositions/scenes/02-HomeScreen";
import { RiversListScene } from "./compositions/scenes/03-RiversList";
import { RiverDetailScene } from "./compositions/scenes/04-RiverDetail";
import { FloatPlannerScene } from "./compositions/scenes/05-FloatPlanner";
import { GaugesScene } from "./compositions/scenes/06-Gauges";
import { AccessPointScene } from "./compositions/scenes/07-AccessPoint";
import { SharePlanScene } from "./compositions/scenes/08-SharePlan";
import { AskEddyScene } from "./compositions/scenes/09-AskEddy";
import { OutroScene } from "./compositions/scenes/10-Outro";
import { scenes, getSceneFrames, getTotalFrames, FPS } from "./lib/voiceover";

import "./style.css";

const totalFrames = getTotalFrames();

/**
 * Root composition registry.
 * Registers both landscape (16:9) and portrait (9:16) versions,
 * plus individual scenes for preview/isolated rendering.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ============================================
          FULL TUTORIALS
          ============================================ */}

      {/* Desktop/Web — 16:9 landscape */}
      <Composition
        id="tutorial-full"
        component={TutorialFull}
        durationInFrames={totalFrames}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const }}
      />

      {/* TikTok/Reels — 9:16 portrait */}
      <Composition
        id="tutorial-full-vertical"
        component={TutorialFull}
        durationInFrames={totalFrames}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const }}
      />

      {/* ============================================
          INDIVIDUAL SCENES — Landscape
          ============================================ */}

      <Composition
        id="scene-intro"
        component={IntroScene}
        durationInFrames={getSceneFrames(scenes[0])}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const }}
      />

      <Composition
        id="scene-home"
        component={HomeScene}
        durationInFrames={getSceneFrames(scenes[1])}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const }}
      />

      <Composition
        id="scene-rivers"
        component={RiversListScene}
        durationInFrames={getSceneFrames(scenes[2])}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const }}
      />

      <Composition
        id="scene-river-detail"
        component={RiverDetailScene}
        durationInFrames={getSceneFrames(scenes[3])}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const }}
      />

      <Composition
        id="scene-float-planner"
        component={FloatPlannerScene}
        durationInFrames={getSceneFrames(scenes[4])}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const }}
      />

      <Composition
        id="scene-gauges"
        component={GaugesScene}
        durationInFrames={getSceneFrames(scenes[5])}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const }}
      />

      <Composition
        id="scene-access-point"
        component={AccessPointScene}
        durationInFrames={getSceneFrames(scenes[6])}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const }}
      />

      <Composition
        id="scene-share-plan"
        component={SharePlanScene}
        durationInFrames={getSceneFrames(scenes[7])}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const }}
      />

      <Composition
        id="scene-ask-eddy"
        component={AskEddyScene}
        durationInFrames={getSceneFrames(scenes[8])}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const }}
      />

      <Composition
        id="scene-outro"
        component={OutroScene}
        durationInFrames={getSceneFrames(scenes[9])}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const }}
      />

      {/* ============================================
          INDIVIDUAL SCENES — Portrait (TikTok)
          ============================================ */}

      <Composition
        id="scene-intro-vertical"
        component={IntroScene}
        durationInFrames={getSceneFrames(scenes[0])}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const }}
      />

      <Composition
        id="scene-home-vertical"
        component={HomeScene}
        durationInFrames={getSceneFrames(scenes[1])}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const }}
      />

      <Composition
        id="scene-rivers-vertical"
        component={RiversListScene}
        durationInFrames={getSceneFrames(scenes[2])}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const }}
      />

      <Composition
        id="scene-river-detail-vertical"
        component={RiverDetailScene}
        durationInFrames={getSceneFrames(scenes[3])}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const }}
      />

      <Composition
        id="scene-float-planner-vertical"
        component={FloatPlannerScene}
        durationInFrames={getSceneFrames(scenes[4])}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const }}
      />

      <Composition
        id="scene-gauges-vertical"
        component={GaugesScene}
        durationInFrames={getSceneFrames(scenes[5])}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const }}
      />

      <Composition
        id="scene-access-point-vertical"
        component={AccessPointScene}
        durationInFrames={getSceneFrames(scenes[6])}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const }}
      />

      <Composition
        id="scene-share-plan-vertical"
        component={SharePlanScene}
        durationInFrames={getSceneFrames(scenes[7])}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const }}
      />

      <Composition
        id="scene-ask-eddy-vertical"
        component={AskEddyScene}
        durationInFrames={getSceneFrames(scenes[8])}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const }}
      />

      <Composition
        id="scene-outro-vertical"
        component={OutroScene}
        durationInFrames={getSceneFrames(scenes[9])}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const }}
      />
    </>
  );
};
