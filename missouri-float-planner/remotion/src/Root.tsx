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
import { scenes, reelScenes, getSceneFrames, getTotalFrames, getReelTotalFrames, getPromoMontageFrames, getCurrentMontageFrames, FPS } from "./lib/voiceover";
import { ReelFull } from "./compositions/ReelFull";
import { PromoFull } from "./compositions/PromoFull";
import { PromoCurrent } from "./compositions/PromoCurrent";
import { GaugeAnimation } from "./compositions/social/GaugeAnimation";
import { DigestReel, getDigestDuration } from "./compositions/social/DigestReel";
import { SectionGuide } from "./compositions/social/SectionGuide";
import { RouteDraw } from "./compositions/social/RouteDraw";
import { TrendReel } from "./compositions/social/TrendReel";
import { ClipReel, getClipReelDuration } from "./compositions/social/ClipReel";
import type {
  GaugeAnimationProps,
  DigestReelProps,
  SectionGuideProps,
  RouteDrawProps,
  TrendReelProps,
  ClipReelProps,
} from "./lib/social-props";

import "./style.css";

const totalFrames = getTotalFrames();
const reelTotalFrames = getReelTotalFrames();
// PromoFull and PromoCurrent montage their beats (they overlap), so each runs
// shorter than the naive sum — register the overlap-adjusted length or the tail
// goes blank.
const promoTotalFrames = getPromoMontageFrames();
const currentTotalFrames = getCurrentMontageFrames();

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
          PROMO — 9:16 three-feature product promo (~39s)
          live river map · river levels · plan a float
          ============================================ */}

      <Composition
        id="promo"
        component={PromoFull}
        durationInFrames={promoTotalFrames}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ mapClip: null as string | null, format: "portrait" as const, voiceover: true }}
      />

      {/* Landscape cut — YouTube / site hero (16:9) */}
      <Composition
        id="promo-landscape"
        component={PromoFull}
        durationInFrames={promoTotalFrames}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ mapClip: null as string | null, format: "landscape" as const, voiceover: true }}
      />

      {/* Current River focus reel — Eddy Says verdict + plan the float */}
      <Composition
        id="promo-current"
        component={PromoCurrent}
        durationInFrames={currentTotalFrames}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "portrait" as const, voiceover: true }}
      />
      <Composition
        id="promo-current-landscape"
        component={PromoCurrent}
        durationInFrames={currentTotalFrames}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ format: "landscape" as const, voiceover: true }}
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

      {/* Branded wrapper around a downloaded YouTube clip (ClipEngine) */}
      <Composition
        id="clip-reel"
        component={ClipReel}
        fps={FPS}
        width={1080}
        height={1920}
        calculateMetadata={async ({ props }: { props: ClipReelProps }) => ({
          durationInFrames: getClipReelDuration(props.durationSecs, FPS),
        })}
        defaultProps={{
          videoUrl: "",
          riverName: "Current River",
          creatorCredit: "",
          durationSecs: 13,
        } satisfies ClipReelProps}
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
          dateLabel: "April 18, 2026",
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
        calculateMetadata={({ props }: { props: GaugeAnimationProps }) => ({
          // Alert/recovery reels run tighter (8s); the default highlight keeps
          // its ~12s pacing. The internal timeline scales off durationInFrames.
          durationInFrames: props.warningMode || props.recovery ? 240 : 360,
        })}
        defaultProps={{
          riverName: "Current River",
          conditionCode: "flowing",
          gaugeHeightFt: 3.2,
          // NO optimalMin/optimalMax defaults here. This is the PRODUCTION render
          // target: the app omits ft thresholds for CFS-primary (and any
          // untrustworthy) rivers so the bar renders level-only — but a
          // defaultProp for them would silently back-fill demo zones (2.0/4.5)
          // after JSON serialization drops the omitted/undefined values, which is
          // exactly how a DANGEROUS Meramec reel drew its reading in a GOOD zone.
          // Thresholds must come from real data or be absent, never a demo value.
          quoteText: "The Current is running clear and steady today — perfect for a lazy float from Akers to Pulltite.",
          dateLabel: "April 18, 2026",
          format: "portrait",
        } satisfies GaugeAnimationProps}
      />

      {/* Gauge Animation — ALERT preview (warning mode + a synthetic rising
          series). Same component + composition the alert path renders with
          pinned props; registered separately so Studio, render:check-stills,
          and the visual baselines exercise the rising-gauge alert chrome. */}
      <Composition
        id="social-gauge-alert"
        component={GaugeAnimation}
        durationInFrames={240}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          riverName: "Meramec River",
          conditionCode: "high",
          previousCondition: "flowing",
          warningMode: true,
          gaugeHeightFt: 6.8,
          optimalMin: 2.0,
          optimalMax: 4.5,
          levelHigh: 5.0,
          levelDangerous: 8.0,
          riseText: "▲ up 2.4 ft in 6h",
          stationLabel: "Meramec River near Sullivan, MO",
          // Synthetic-but-realistic 18-point rising night: flat, first bump,
          // steady climb through the threshold to the pinned current reading.
          series: [
            { hoursAgo: -24, gaugeHeightFt: 3.1 },
            { hoursAgo: -22.6, gaugeHeightFt: 3.1 },
            { hoursAgo: -21.2, gaugeHeightFt: 3.2 },
            { hoursAgo: -19.8, gaugeHeightFt: 3.2 },
            { hoursAgo: -18.4, gaugeHeightFt: 3.3 },
            { hoursAgo: -17, gaugeHeightFt: 3.5 },
            { hoursAgo: -15.5, gaugeHeightFt: 3.8 },
            { hoursAgo: -14.1, gaugeHeightFt: 4.2 },
            { hoursAgo: -12.7, gaugeHeightFt: 4.6 },
            { hoursAgo: -11.3, gaugeHeightFt: 5.0 },
            { hoursAgo: -9.9, gaugeHeightFt: 5.4 },
            { hoursAgo: -8.5, gaugeHeightFt: 5.8 },
            { hoursAgo: -7.1, gaugeHeightFt: 6.1 },
            { hoursAgo: -5.6, gaugeHeightFt: 6.3 },
            { hoursAgo: -4.2, gaugeHeightFt: 6.5 },
            { hoursAgo: -2.8, gaugeHeightFt: 6.6 },
            { hoursAgo: -1.4, gaugeHeightFt: 6.7 },
            { hoursAgo: 0, gaugeHeightFt: 6.8 },
          ],
          quoteText: "Meramec jumped from Flowing into High overnight. Fast, pushy water — this is not the weekend to learn.",
          dateLabel: "July 11, 2026",
          followCta: "Follow for live Ozark river alerts",
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

      {/* Section Guide — float-of-the-week reel */}
      <Composition
        id="social-section-portrait"
        component={SectionGuide}
        durationInFrames={360}
        fps={FPS}
        width={1080}
        height={1920}
        calculateMetadata={({ props: _props }: { props: SectionGuideProps }) => ({
          // ~12s default. The internal CTA timing scales off durationInFrames
          // (ctaStart = durationInFrames - 70), matching the gauge reel, so this
          // stays the single place to retune pacing.
          durationInFrames: 360,
        })}
        defaultProps={{
          riverName: "Current River",
          conditionCode: "high",
          putInName: "Akers",
          putInMile: 20.0,
          takeOutName: "Pulltite",
          takeOutMile: 30.5,
          distanceMi: 10.5,
          hoursToday: 3.5,
          hoursTypical: 4.5,
          dateLabel: "April 18, 2026",
          format: "portrait",
        } satisfies SectionGuideProps}
      />

      {/* Self-drawing route — put-in → take-out draws itself with today's float time */}
      <Composition
        id="social-route-portrait"
        component={RouteDraw}
        durationInFrames={360}
        fps={FPS}
        width={1080}
        height={1920}
        calculateMetadata={({ props: _props }: { props: RouteDrawProps }) => ({
          // ~12s default. The route draws over frames 45-205 and the CTA scales
          // off durationInFrames, so this is the single place to retune pacing.
          durationInFrames: 360,
        })}
        defaultProps={{
          riverName: "Current River",
          conditionCode: "high",
          putInName: "Akers",
          putInMile: 20.0,
          takeOutName: "Pulltite",
          takeOutMile: 30.5,
          distanceMi: 10.5,
          hoursToday: 3.5,
          hoursTypical: 4.5,
          dateLabel: "April 18, 2026",
          format: "portrait",
        } satisfies RouteDrawProps}
      />

      {/* 7-Day Trend reel with sparkline */}
      <Composition
        id="social-trend-portrait"
        component={TrendReel}
        durationInFrames={360}
        fps={FPS}
        width={1080}
        height={1920}
        calculateMetadata={({ props: _props }: { props: TrendReelProps }) => ({
          // ~12s default. The sparkline reveals over frames 40-120 and the CTA
          // scales off durationInFrames, so this is the single place to retune.
          durationInFrames: 360,
        })}
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
