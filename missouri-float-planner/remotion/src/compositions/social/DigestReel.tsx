import React from "react";
import {
  Audio,
  Series,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { ReelPage } from "../../components/ReelPage";
import { ReelMasthead } from "../../components/ReelMasthead";
import { ReelDock } from "../../components/ReelDock";
import { BrandCard, StatTile } from "../../components/BrandCard";
import { RiverCard } from "./RiverCard";
import { ENTRANCE } from "../../lib/spring-presets";
import { REEL_SAFE, reelLoopOpacity } from "../../lib/reel-safe";
import { fontFamilies } from "../../design-tokens/fonts";
import { CONDITION_COLORS, SEVERITY_ORDER, type DigestReelProps } from "../../lib/social-props";
import { CTA, LABELS, SURFACES, TYPE, colors } from "../../../../shared/social-brand";

const LIGHT = SURFACES.light;
/** Conditions a digest counts as floatable in its headline. */
const FLOATABLE = new Set(["flowing", "good"]);

/** Page geometry for portrait (production) and the square Studio preview. */
function frameFor(isPortrait: boolean) {
  const top = isPortrait ? REEL_SAFE.top : 48;
  const bottom = isPortrait ? REEL_SAFE.bottom : 48;
  const height = isPortrait ? 1920 : 1080;
  return {
    mastheadTop: top,
    stageTop: top + 200,
    stageBottom: height - bottom,
    dockBottom: bottom + (isPortrait ? 52 : 40),
    followBottom: bottom,
  };
}

/** The masthead every digest slide carries, so any frame of the reel — and the
 *  screenshot of its data slide — says what this is and when. */
const DigestMasthead: React.FC<{
  label: string;
  headline: string;
  dateLabel: string;
  isPortrait: boolean;
}> = ({ label, headline, dateLabel, isPortrait }) => {
  const g = frameFor(isPortrait);
  return (
    <div style={{ position: "absolute", top: g.mastheadTop, left: REEL_SAFE.left, right: REEL_SAFE.right, zIndex: 10 }}>
      <ReelMasthead label={label} title={headline} subtitle={dateLabel} />
    </div>
  );
};

/** Title slide — the headline count, Eddy, and the global read as a card. */
const TitleSlide: React.FC<{
  label: string;
  headline: string;
  dateLabel: string;
  globalQuote?: string;
  isPortrait: boolean;
  titleFrames: number;
}> = ({ label, headline, dateLabel, globalQuote, isPortrait, titleFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = frameFor(isPortrait);

  // Everything is on screen at frame 0 (the grid thumbnail); the card only
  // settles up a few px.
  const settle = spring({ frame, fps, config: ENTRANCE });
  const cardY = interpolate(settle, [0, 1], [24, 0]);
  // Hold the quote, then ease it down over the last ~0.3s so the cut to the
  // river cards doesn't feel like the quote vanished mid-read.
  const quoteHold = interpolate(frame, [titleFrames - 10, titleFrames], [1, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      <DigestMasthead label={label} headline={headline} dateLabel={dateLabel} isPortrait={isPortrait} />
      <div
        style={{
          position: "absolute",
          top: g.stageTop,
          left: REEL_SAFE.left,
          right: REEL_SAFE.right,
          height: g.stageBottom - g.stageTop,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // Sit the group in the upper-middle: the lower stage is where the
          // Reels caption chrome lands, and an empty cream floor reads better
          // than a card jammed against it.
          paddingBottom: isPortrait ? 200 : 40,
          gap: isPortrait ? 40 : 20,
        }}
      >
        <EddyMascot variant="canoe" size={isPortrait ? 360 : 200} delay={-30} />
        {globalQuote ? (
          <div style={{ transform: `translateY(${cardY}px)`, opacity: quoteHold, width: "100%" }}>
            <BrandCard padding={isPortrait ? "26px 32px" : "18px 24px"}>
              <div
                style={{
                  fontSize: isPortrait ? TYPE.body.size : 22,
                  fontWeight: TYPE.body.weight,
                  lineHeight: TYPE.body.lineHeight,
                  fontStyle: "italic",
                  color: LIGHT.ink,
                  textAlign: "center",
                }}
              >
                &ldquo;{globalQuote}&rdquo;
              </div>
              <div
                style={{
                  marginTop: 12,
                  textAlign: "center",
                  fontFamily: fontFamilies.display,
                  fontSize: 18,
                  fontWeight: 650,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: LIGHT.inkMuted,
                }}
              >
                Eddy&apos;s read
              </div>
            </BrandCard>
          </div>
        ) : null}
      </div>
    </>
  );
};

/**
 * ALL rivers on a single screen — no batching/pagination. Rows shrink to fit
 * up to ten rivers between the masthead and the safe-zone floor.
 */
const RiverCardsSlide: React.FC<{
  rivers: DigestReelProps["rivers"];
  isPortrait: boolean;
  label: string;
  headline: string;
  dateLabel: string;
  rainNote?: boolean;
}> = ({ rivers, isPortrait, label, headline, dateLabel, rainNote }) => {
  const g = frameFor(isPortrait);
  const count = rivers.length;
  const gap = count > 8 ? 10 : count > 6 ? 12 : 16;
  const noteH = rainNote ? 56 : 0;
  const avail = g.stageBottom - g.stageTop - noteH;
  const rowH = Math.max(56, Math.min(isPortrait ? 110 : 84, (avail - gap * Math.max(0, count - 1)) / Math.max(1, count)));
  const width = 1080 - REEL_SAFE.left - REEL_SAFE.right;

  return (
    <>
      <DigestMasthead label={label} headline={headline} dateLabel={dateLabel} isPortrait={isPortrait} />
      {/* Rows read top-down from the masthead, like every other reel's stage;
          a short list leaves the floor clear rather than floating mid-frame. */}
      <div
        style={{
          position: "absolute",
          top: g.stageTop,
          left: REEL_SAFE.left,
          right: REEL_SAFE.right,
          height: g.stageBottom - g.stageTop,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          gap,
        }}
      >
        {rivers.map((river, i) => (
          <RiverCard
            key={river.riverName}
            riverName={river.riverName}
            conditionCode={river.conditionCode}
            gaugeHeightFt={river.gaugeHeightFt}
            weather={river.weather}
            delay={i * 5}
            width={width}
            height={rowH}
          />
        ))}
        {rainNote && (
          <span
            style={{
              marginTop: 8,
              maxWidth: width,
              fontSize: isPortrait ? 22 : 18,
              fontWeight: 600,
              color: LIGHT.inkSecondary,
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            Rain in the forecast everywhere this weekend — these are the best bets.
          </span>
        )}
      </div>
    </>
  );
};

/** CTA slide — Eddy, the tally, and the button. */
const CTASlide: React.FC<{
  label: string;
  headline: string;
  dateLabel: string;
  rivers: DigestReelProps["rivers"];
  isForecast: boolean;
  isPortrait: boolean;
  followCta?: string;
}> = ({ label, headline, dateLabel, rivers, isForecast, isPortrait, followCta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = frameFor(isPortrait);

  const entrance = spring({ frame, fps, config: ENTRANCE });
  const bounce = spring({ frame: frame - 10, fps, config: { damping: 8, mass: 0.5, stiffness: 150 } });
  const eddyScale = interpolate(bounce, [0, 1], [0.85, 1]);
  const eddyRotate = interpolate(bounce, [0, 0.5, 1], [0, -8, 0]);

  const floatable = rivers.filter((river) => FLOATABLE.has(river.conditionCode)).length;
  const best = rivers[0];
  const bestCondition = best ? CONDITION_COLORS[best.conditionCode] ?? CONDITION_COLORS.unknown : null;

  return (
    <>
      <DigestMasthead label={label} headline={headline} dateLabel={dateLabel} isPortrait={isPortrait} />
      <div
        style={{
          position: "absolute",
          top: g.stageTop,
          left: 0,
          right: 0,
          height: isPortrait ? 560 : 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ transform: `scale(${eddyScale}) rotate(${eddyRotate}deg)` }}>
          <EddyMascot variant="green" size={isPortrait ? 320 : 200} delay={-30} float={false} />
        </div>
      </div>
      <ReelDock
        bottom={g.dockBottom}
        followBottom={g.followBottom}
        tiles={
          isForecast
            ? [
                <StatTile key="picks" value={String(rivers.length)} label={rivers.length === 1 ? "Best bet" : "Best bets"} />,
                best && bestCondition ? (
                  <StatTile key="top" value={best.riverName} label="Top pick" color={bestCondition.solid} compact />
                ) : (
                  <StatTile key="top" value="—" label="Top pick" />
                ),
              ]
            : [
                <StatTile key="floatable" value={String(floatable)} unit={`/ ${rivers.length}`} label="Floatable" color={colors.support[600]} />,
                best && bestCondition ? (
                  <StatTile key="best" value={best.riverName} label="Most notable" color={bestCondition.solid} compact />
                ) : (
                  <StatTile key="best" value="—" label="Most notable" />
                ),
              ]
        }
        detail={isForecast ? "Live levels and forecasts for every river" : "Live levels for every Ozark river"}
        cta={CTA.levels}
        ctaProgress={entrance}
        followCta={followCta}
      />
    </>
  );
};

/**
 * Multi-river daily digest reel — and, with `title` + per-river `weather`, the
 * Weekend Forecast. ALL rivers on a single screen (no pagination); the global
 * Eddy Says read on the title slide.
 *
 * Structure: Title (headline count + quote) → All rivers → CTA
 */
export const DigestReel: React.FC<DigestReelProps> = ({
  rivers,
  dateLabel,
  globalQuote,
  title = LABELS.riverReport,
  rainNote,
  followCta,
  format,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const isPortrait = format === "portrait";

  // Sort rivers by severity (dangerous/flowing first)
  const sortedRivers = [...rivers].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.conditionCode] ?? 6) -
      (SEVERITY_ORDER[b.conditionCode] ?? 6)
  );

  // The forecast variant carries a title other than the digest's and weather
  // chips; its rivers are already the top picks, so the headline counts picks
  // rather than floatable-of-total.
  const isForecast = title !== LABELS.riverReport || sortedRivers.some((river) => !!river.weather);
  const floatable = sortedRivers.filter((river) => FLOATABLE.has(river.conditionCode)).length;
  const headline = isForecast
    ? sortedRivers.length === 1
      ? "One best bet"
      : `Top ${sortedRivers.length} floats`
    : sortedRivers.length === 0
      ? "No river data"
      : floatable === 0
        ? "No rivers floatable"
        : floatable === sortedRivers.length
          ? `All ${sortedRivers.length} rivers floatable`
          : `${floatable} of ${sortedRivers.length} rivers floatable`;

  // Durations mirror getDigestDuration() below — keep in sync.
  const titleFrames = globalQuote ? 165 : 105;
  const riverFrames = 180 + Math.max(0, sortedRivers.length - 5) * 6;
  const ctaFrames = 75;

  // Fade in/out on the whole composition so the Reel auto-loop is seamless.
  const loopOpacity = isPortrait ? reelLoopOpacity(frame, durationInFrames) : 1;

  return (
    <ReelPage opacity={loopOpacity}>
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={(f) =>
          interpolate(f, [0, 30, durationInFrames - 30, durationInFrames], [0, 0.5, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      <Series>
        <Series.Sequence durationInFrames={titleFrames}>
          <TitleSlide
            label={title}
            headline={headline}
            dateLabel={dateLabel}
            globalQuote={globalQuote}
            isPortrait={isPortrait}
            titleFrames={titleFrames}
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={riverFrames}>
          <RiverCardsSlide
            rivers={sortedRivers}
            isPortrait={isPortrait}
            label={title}
            headline={headline}
            dateLabel={dateLabel}
            rainNote={rainNote}
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={ctaFrames}>
          <CTASlide
            label={title}
            headline={headline}
            dateLabel={dateLabel}
            rivers={sortedRivers}
            isForecast={isForecast}
            isPortrait={isPortrait}
            followCta={followCta}
          />
        </Series.Sequence>
      </Series>
    </ReelPage>
  );
};

/** Calculate total frames — always 3 slides now (title + rivers + CTA). */
export function getDigestDuration(riverCount: number, hasGlobalQuote = false): number {
  const titleFrames = hasGlobalQuote ? 165 : 105;               // 5.5s / 3.5s
  const riverFrames = 180 + Math.max(0, riverCount - 5) * 6;    // base 6s, +0.2s per extra river
  const ctaFrames = 75;                                          // 2.5s
  return titleFrames + riverFrames + ctaFrames;
}
