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
import { scenes, reelScenes, getSceneFrames, getTotalFrames, getReelTotalFrames, FPS } from "./lib/voiceover";
import { ReelFull } from "./compositions/ReelFull";
import { GaugeAnimation } from "./compositions/social/GaugeAnimation";
import { DigestReel, getDigestDuration } from "./compositions/social/DigestReel";
import { BrandedLoop } from "./compositions/social/BrandedLoop";
import { SectionGuide } from "./compositions/social/SectionGuide";
import { TrendReel } from "./compositions/social/TrendReel";
import type {
  GaugeAnimationProps,
  DigestReelProps,
  BrandedLoopProps,
  SectionGuideProps,
  TrendReelProps,
} from "./lib/social-props";

import "./style.css";

const totalFrames = getTotalFrames();
const reelTotalFrames = getReelTotalFrames();

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
          REEL — 9:16 punchy highlight (~35s)
          ============================================ */}

      <Composition
        id="reel"
        component={ReelFull}
        durationInFrames={reelTotalFrames}
        fps={FPS}
        width={1080}
        height={1920}
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

      {/* ============================================
          SOCIAL VIDEO COMPOSITIONS
          ============================================ */}

      {/* Gauge Animation — single river highlight (1080x1080 square) */}
      <Composition
        id="social-gauge"
        component={GaugeAnimation}
        durationInFrames={360}
        fps={FPS}
        width={1080}
        height={1080}
        defaultProps={{
          riverName: "Current River",
          conditionCode: "flowing",
          gaugeHeightFt: 3.2,
          optimalMin: 2.0,
          optimalMax: 4.5,
          quoteText: "The Current is running clear and steady today — perfect for a lazy float from Akers to Pulltite.",
          format: "square",
        } satisfies GaugeAnimationProps}
      />

      {/* Gauge Animation — portrait for Instagram Stories */}
      <Composition
        id="social-gauge-portrait"
        component={GaugeAnimation}
        durationInFrames={360}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          riverName: "Current River",
          conditionCode: "flowing",
          gaugeHeightFt: 3.2,
          optimalMin: 2.0,
          optimalMax: 4.5,
          quoteText: "The Current is running clear and steady today — perfect for a lazy float from Akers to Pulltite.",
          format: "portrait",
        } satisfies GaugeAnimationProps}
      />

      {/* Digest Reel — all rivers daily report (1080x1080 square) */}
      <Composition
        id="social-digest"
        component={DigestReel}
        durationInFrames={360}
        fps={FPS}
        width={1080}
        height={1080}
        calculateMetadata={async ({ props }: { props: DigestReelProps }) => ({
          durationInFrames: getDigestDuration(props.rivers.length, !!props.globalQuote),
        })}
        defaultProps={{
          rivers: [
            { riverName: "Current River", conditionCode: "flowing", gaugeHeightFt: 3.2 },
            { riverName: "Jacks Fork", conditionCode: "good", gaugeHeightFt: 2.8 },
            { riverName: "Meramec River", conditionCode: "low", gaugeHeightFt: 1.4 },
            { riverName: "Huzzah Creek", conditionCode: "good", gaugeHeightFt: 2.1 },
            { riverName: "Courtois Creek", conditionCode: "too_low", gaugeHeightFt: 0.8 },
          ],
          dateLabel: "April 6, 2026",
          globalQuote: "Most rivers are running well today with spring rains keeping levels up across the Ozarks.",
          format: "square",
        } satisfies DigestReelProps}
      />

      {/* Digest Reel — portrait for Instagram Stories */}
      <Composition
        id="social-digest-portrait"
        component={DigestReel}
        durationInFrames={360}
        fps={FPS}
        width={1080}
        height={1920}
        calculateMetadata={async ({ props }: { props: DigestReelProps }) => ({
          durationInFrames: getDigestDuration(props.rivers.length, !!props.globalQuote),
        })}
        defaultProps={{
          rivers: [
            { riverName: "Current River", conditionCode: "flowing", gaugeHeightFt: 3.2 },
            { riverName: "Jacks Fork", conditionCode: "good", gaugeHeightFt: 2.8 },
            { riverName: "Meramec River", conditionCode: "low", gaugeHeightFt: 1.4 },
            { riverName: "Huzzah Creek", conditionCode: "good", gaugeHeightFt: 2.1 },
            { riverName: "Courtois Creek", conditionCode: "too_low", gaugeHeightFt: 0.8 },
          ],
          dateLabel: "April 6, 2026",
          globalQuote: "Most rivers are running well today with spring rains keeping levels up across the Ozarks.",
          format: "portrait",
        } satisfies DigestReelProps}
      />

      {/* Branded Loop — simple eye-catcher (1080x1080, loops) */}
      <Composition
        id="social-branded-loop"
        component={BrandedLoop}
        durationInFrames={120}
        fps={FPS}
        width={1080}
        height={1080}
        defaultProps={{
          riverName: "Current River",
          conditionCode: "flowing",
          summaryText: "Clear skies and perfect levels. Get on the water today!",
        } satisfies BrandedLoopProps}
      />

      {/* Section Guide — float-of-the-week reel */}
      <Composition
        id="social-section-portrait"
        component={SectionGuide}
        durationInFrames={360}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          riverName: "Current River",
          conditionCode: "flowing",
          putInName: "Akers",
          putInMile: 20.0,
          takeOutName: "Pulltite",
          takeOutMile: 30.5,
          distanceMi: 10.5,
          hoursCanoe: 5.3,
          dateLabel: "April 18, 2026",
          format: "portrait",
        } satisfies SectionGuideProps}
      />

      {/* 7-Day Trend reel with sparkline */}
      <Composition
        id="social-trend-portrait"
        component={TrendReel}
        durationInFrames={360}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          riverName: "Current River",
          conditionCode: "flowing",
          currentHeightFt: 3.4,
          sevenDayFirstFt: 2.1,
          sevenDayMinFt: 2.0,
          sevenDayMaxFt: 3.6,
          deltaFt: 1.3,
          direction: "rising",
          series: Array.from({ length: 20 }, (_, i) => ({
            hoursAgo: -168 + (i * 168) / 19,
            gaugeHeightFt: 2.1 + Math.sin(i / 3) * 0.5 + (i / 19) * 1.3,
          })),
          dateLabel: "This Week",
          format: "portrait",
        } satisfies TrendReelProps}
      />
    </>
  );
};
