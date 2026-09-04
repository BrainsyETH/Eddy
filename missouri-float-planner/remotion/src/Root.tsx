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
import { RouteDraw } from "./compositions/social/RouteDraw";
import { TrendReel } from "./compositions/social/TrendReel";
import { ClipReel, getClipReelDuration } from "./compositions/social/ClipReel";
import type {
  GaugeAnimationProps,
  DigestReelProps,
  RouteDrawProps,
  TrendReelProps,
  ClipReelProps,
} from "./lib/social-props";
import { DEFAULT_TIMING, journeyDuration } from "../../shared/social-route-journey";

import "./style.css";

/** Base journey plus one readable pause per intermediate feature, plus one
 *  hold for the "also along this float" card when there is one. Identical for
 *  the river and itinerary stages — they share the journey clock. */
const routeDuration = ({ props }: { props: RouteDrawProps }) => ({
  durationInFrames: journeyDuration(
    (props.routePoints ?? []).filter((point) => point.progress > 0.015 && point.progress < 0.985).length,
    DEFAULT_TIMING,
    (props.unanchoredPoints?.length ?? 0) > 0,
  ),
});

// A REAL section, so the visual baseline guards the composition on the
// geometry it will actually draw: Current River, Pulltite Spring → Round
// Spring, the ST_LineSubstring slice from rivers.geom with the three
// intermediate features get_float_segment + route-scene return.
const ROUTE_DEMO = {
  riverName: "Current River",
  conditionCode: "flowing",
  putInName: "Pulltite Spring",
  putInMile: 26.23,
  takeOutName: "Round Spring",
  takeOutMile: 35.44,
  distanceMi: 9.21,
  hoursToday: 4.2,
  hoursTypical: 4.6,
  dateLabel: "April 18, 2026",
  followCta: "Follow for a new float every day",
  routePoints: [
    { id: "pulltite", name: "Pulltite Spring", kind: "put_in", riverMile: 26.23, progress: 0, detail: "Put-in" },
    { id: "echo-bluff", name: "Echo Bluff State Park", kind: "campground", riverMile: 33.7, progress: 0.8093, detail: "Campground & access" },
    { id: "sinking-creek", name: "Sinking Creek Campground", kind: "campground", riverMile: 33.84, progress: 0.8269, detail: "Campground & access" },
    { id: "carrs", name: "Carr's Canoe Rentals", kind: "poi", riverMile: 35.09, progress: 0.9626, detail: "Outfitter" },
    { id: "round-spring", name: "Round Spring", kind: "take_out", riverMile: 35.44, progress: 1, detail: "Take-out" },
  ],
  format: "portrait",
} satisfies RouteDrawProps;

const ROUTE_DEMO_LINE: RouteDrawProps["routeCoordinates"] = [
  [-91.47628, 37.3347], [-91.47864, 37.33617], [-91.48124, 37.3365], [-91.48899, 37.33341],
  [-91.48824, 37.32989], [-91.48866, 37.326], [-91.48378, 37.32126], [-91.47812, 37.31981],
  [-91.47132, 37.31929], [-91.4691, 37.31534], [-91.46696, 37.31434], [-91.46521, 37.31199],
  [-91.45994, 37.31298], [-91.45675, 37.31504], [-91.45253, 37.31453], [-91.45168, 37.31657],
  [-91.45256, 37.31802], [-91.45242, 37.32015], [-91.44823, 37.32296], [-91.44287, 37.32022],
  [-91.4377, 37.31985], [-91.43331, 37.32063], [-91.43061, 37.31375], [-91.42921, 37.31276],
  [-91.42236, 37.31635], [-91.41921, 37.31514], [-91.41688, 37.31289], [-91.41672, 37.30916],
  [-91.41509, 37.30657], [-91.41666, 37.29916], [-91.41447, 37.29564], [-91.4144, 37.29096],
  [-91.41359, 37.28933], [-91.40558, 37.28392], [-91.4054, 37.28335],
];

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

      {/* Float Pick — the real river scrolls under Eddy's canoe, put-in → take-out,
          with today's float time. The PRODUCTION render target for section_guide. */}
      <Composition
        id="social-route-portrait"
        component={RouteDraw}
        durationInFrames={360}
        fps={FPS}
        width={1080}
        height={1920}
        calculateMetadata={routeDuration}
        defaultProps={{ ...ROUTE_DEMO, routeCoordinates: ROUTE_DEMO_LINE } satisfies RouteDrawProps}
      />

      {/* Float Pick with NO geometry — the same composition rendering its
          itinerary stage (route-scene found no drawable line). Registered so
          Studio, render:check-stills and the visual baselines exercise the
          fallback on the same section; production never targets this id. */}
      <Composition
        id="social-route-itinerary-portrait"
        component={RouteDraw}
        durationInFrames={360}
        fps={FPS}
        width={1080}
        height={1920}
        calculateMetadata={routeDuration}
        defaultProps={{
          ...ROUTE_DEMO,
          unanchoredPoints: [
            { id: "spring-current-30.2", name: "Cave Spring", kind: "spring", riverMile: 30.2, detail: "Spring · river left" },
          ],
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
