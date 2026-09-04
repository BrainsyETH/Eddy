import React, { useMemo } from "react";
import { Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import {
  DEFAULT_TIMING,
  arrivalFrame,
  buildJourney,
  journeyCamera,
  journeyState,
  type Journey,
  type JourneyCamera,
  type JourneyPoint,
  type JourneyStage,
  type JourneyState,
  type RoutePointKind,
  type SocialRoutePoint,
  type UnanchoredRoutePoint,
} from "../../../../shared/social-route-journey";
import {
  SURFACES,
  calloutStyle,
  colors,
  conditionInk,
  inkOn,
  TYPE,
} from "../../../../shared/social-brand";
import { EddyMascot } from "../../components/EddyMascot";
import { ReelPage } from "../../components/ReelPage";
import { ReelMasthead } from "../../components/ReelMasthead";
import { ReelDock } from "../../components/ReelDock";
import { BrandCallout, KindBadge, StatTile } from "../../components/BrandCard";
import { fontFamilies } from "../../design-tokens/fonts";
import { REEL_SAFE } from "../../lib/reel-safe";
import { PLAN_CTA } from "../../lib/brand";
import { CONDITION_COLORS, type RouteDrawProps } from "../../lib/social-props";

const FPS = 30;

// ─── Layout ─────────────────────────────────────────────────────────────────
// Everything readable sits inside REEL_SAFE (Instagram's top/bottom chrome).
// The stage is the only thing that may run under the masthead / dock, and it
// fades out at both edges so nothing is ever clipped by chrome mid-word.
const STAGE_TOP = 440;
const STAGE_HEIGHT = 800;
const STAGE: JourneyStage = {
  width: 1080,
  height: STAGE_HEIGHT,
  boatX: 540,
  boatY: 400,
  padding: 100,
};
const CALLOUT_W = 390;
const CALLOUT_H = 160;

const LIGHT = SURFACES.light;

const EVERGREEN_STYLE = {
  solid: colors.secondary[600],
  bg: colors.secondary[100],
  glow: "rgba(184,157,114,0.22)",
  label: "Favorite",
};

const KIND_STYLE: Record<RoutePointKind, { fill: string; short: string }> = {
  put_in: { fill: colors.support[500], short: "IN" },
  take_out: { fill: colors.accent[500], short: "OUT" },
  access: { fill: colors.primary[300], short: "A" },
  campground: { fill: colors.secondary[400], short: "C" },
  spring: { fill: colors.primary[400], short: "S" },
  poi: { fill: colors.secondary[300], short: "P" },
  hazard: { fill: "#E5A000", short: "!" },
};

const hazardFill = (point: SocialRoutePoint) =>
  point.kind === "hazard" ? (point.severity === "danger" ? "#DC2626" : "#E5A000") : KIND_STYLE[point.kind].fill;

const toScreen = (point: JourneyPoint, camera: JourneyCamera) => ({
  x: point.x * camera.scale + camera.translateX,
  y: point.y * camera.scale + camera.translateY,
});

/**
 * A truthful river journey. Frame 0 is the whole float — every bend, every
 * stop, the put-in named — so the grid thumbnail is a complete card; the
 * camera then pushes in and the selected PostGIS LineString scrolls beneath a
 * fixed Eddy canoe, pausing at each intermediate feature in the reading zone.
 *
 * Missing geometry never invents a line: the same masthead, dock and pauses
 * frame a schematic ITINERARY instead — the stops in order down a channel,
 * with their miles, Eddy paddling from one to the next. Same series label,
 * same evergreen handling, same facts; just no map.
 */
export const RouteDraw: React.FC<RouteDrawProps> = (props) => {
  const {
    riverName,
    conditionCode,
    putInName,
    putInMile,
    takeOutName,
    takeOutMile,
    distanceMi,
    hoursToday,
    hoursTypical,
    dateLabel,
    followCta,
    label = "Float Pick",
    tagline,
    evergreen = false,
    difficulty,
    photoUrl,
    routeCoordinates,
    routePoints = [],
    unanchoredPoints = [],
  } = props;
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const condition = evergreen
    ? EVERGREEN_STYLE
    : CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;
  const journey = useMemo(() => buildJourney(routeCoordinates), [routeCoordinates]);

  // Every stop in float order, endpoints guaranteed: the itinerary needs them
  // as rows even when the points query failed and routePoints is empty.
  const stops = useMemo(
    () => orderedStops(routePoints, { putInName, putInMile, takeOutName, takeOutMile }),
    [routePoints, putInName, putInMile, takeOutName, takeOutMile],
  );
  const intermediate = stops.filter((point) => point.progress > 0.015 && point.progress < 0.985);
  const state = journeyState(frame, intermediate);
  const travelledMiles = Math.min(distanceMi, distanceMi * state.progress);
  const activeIntermediate = state.activeStop === null ? null : intermediate[state.activeStop];
  const putIn = stops[0];
  const takeOut = stops[stops.length - 1];

  // The put-in callout is up from frame 0 (thumbnail) and holds through the
  // overview; it lets go as the camera finishes pushing in on the boat.
  const launchProgress = interpolate(
    frame,
    [0, DEFAULT_TIMING.introFrames + 10, DEFAULT_TIMING.introFrames + 24],
    [1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Unanchored features (guidebook springs with no coordinate) get ONE hold at
  // arrival, before the take-out's own callout: a fact without a false pin.
  const summaryFrames = DEFAULT_TIMING.summaryFrames ?? 0;
  const arrival = arrivalFrame(intermediate);
  const summaryVisible =
    unanchoredPoints.length > 0 && frame >= arrival && frame < arrival + summaryFrames;
  const summaryProgress = summaryVisible
    ? Math.min(1, (frame - arrival) / 6, (arrival + summaryFrames - frame) / 6)
    : 0;
  const finishProgress = state.complete && !summaryVisible
    ? spring({ frame: frame - (durationInFrames - 88), fps, config: { damping: 14, stiffness: 120 } })
    : 0;
  const activeCallout =
    activeIntermediate ?? (launchProgress > 0 ? putIn : summaryVisible || finishProgress > 0 ? takeOut : null);
  const calloutProgress = activeIntermediate
    ? state.calloutProgress
    : summaryVisible
      ? summaryProgress
      : Math.max(launchProgress, finishProgress);

  const delta = hoursTypical - hoursToday;
  const deltaCopy = evergreen
    ? "Typical pace"
    : Math.abs(delta) < 0.3
      ? "About the usual pace"
      : `${Math.abs(delta).toFixed(1)} hr ${delta > 0 ? "faster" : "slower"} today`;
  const cta = spring({
    frame: frame - (durationInFrames - 72),
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.6 },
  });

  const stageProps = {
    stops,
    state,
    condition,
    putInMile,
    unanchoredPoints,
    activeCallout,
    calloutProgress,
    summaryVisible,
  };

  return (
    <ReelPage backdrop={photoUrl ? { src: photoUrl } : undefined}>
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={(audioFrame) =>
          interpolate(audioFrame, [0, FPS, durationInFrames - FPS, durationInFrames], [0, 0.42, 0.42, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      <ReelMasthead
        pinned
        label={label}
        title={riverName}
        subtitle={tagline || dateLabel || `${putInName} to ${takeOutName}`}
      />

      {journey ? <RiverStage journey={journey} frame={frame} {...stageProps} /> : <ItineraryStage {...stageProps} />}

      <ProgressTicket current={travelledMiles} total={distanceMi} conditionColor={condition.solid} />

      <ReelDock
        tiles={[
          <StatTile key="hours" value={`~${hoursToday.toFixed(1)}`} unit="HRS" label="Float time" />,
          <StatTile key="distance" value={distanceMi.toFixed(1)} unit="MI" label="Distance" />,
          <StatTile
            key="condition"
            value={evergreen ? (difficulty ? `Class ${difficulty}` : "Favorite") : condition.label}
            label="Conditions"
            color={condition.solid}
            compact
          />,
        ]}
        detail={deltaCopy}
        cta={PLAN_CTA}
        ctaProgress={cta}
        followCta={followCta}
      />
    </ReelPage>
  );
};

// ─── Shared stage inputs ────────────────────────────────────────────────────

type ConditionStyle = { solid: string; bg: string; glow: string; label: string };

interface StageProps {
  stops: SocialRoutePoint[];
  state: JourneyState;
  condition: ConditionStyle;
  putInMile: number;
  unanchoredPoints: UnanchoredRoutePoint[];
  activeCallout: SocialRoutePoint | null;
  calloutProgress: number;
  summaryVisible: boolean;
}

/** All stops in float order with the endpoints guaranteed present. */
function orderedStops(
  routePoints: ReadonlyArray<SocialRoutePoint>,
  ends: { putInName: string; putInMile: number; takeOutName: string; takeOutMile: number },
): SocialRoutePoint[] {
  const sorted = [...routePoints].sort((a, b) => a.progress - b.progress);
  const hasPutIn = sorted.some((point) => point.kind === "put_in");
  const hasTakeOut = sorted.some((point) => point.kind === "take_out");
  return [
    ...(hasPutIn
      ? []
      : [{ id: "put-in", name: ends.putInName, kind: "put_in" as const, riverMile: ends.putInMile, progress: 0, detail: "Put-in" }]),
    ...sorted,
    ...(hasTakeOut
      ? []
      : [{ id: "take-out", name: ends.takeOutName, kind: "take_out" as const, riverMile: ends.takeOutMile, progress: 1, detail: "Take-out" }]),
  ];
}

// ─── The river stage (exact geometry) ───────────────────────────────────────

const RiverStage: React.FC<StageProps & { journey: Journey; frame: number }> = ({
  journey,
  frame,
  stops,
  state,
  condition,
  putInMile,
  unanchoredPoints,
  activeCallout,
  calloutProgress,
  summaryVisible,
}) => {
  const route = journey.points;
  // Every on-screen position is a RAW arc-length fraction mapped through the
  // journey — boat, markers and drawn line alike — so all of them agree with
  // the stored geometry to within journey.maxDeviationPx.
  const located = journey.locate(state.progress);
  const current = located.point;
  const camera = journeyCamera(frame, route, current, STAGE);
  const boatScreen = toScreen(current, camera);

  // Callout placement: attach to the active point on screen and open on the
  // side the channel is NOT heading toward, so the card never covers the
  // next bend. Clamped into the stage and the horizontal safe zone.
  let calloutStyleAt: React.CSSProperties | null = null;
  if (activeCallout) {
    const p = activeCallout.progress;
    const here = journey.locate(p).point;
    const probe = journey.locate(p >= 0.99 ? p - 0.06 : Math.min(1, p + 0.06)).point;
    const headingX = p >= 0.99 ? here.x - probe.x : probe.x - here.x;
    const anchor = toScreen(here, camera);
    const openLeft = headingX > 0;
    const cardH = summaryVisible ? alongCardHeight(unanchoredPoints.length) : CALLOUT_H;
    // Eddy paddles on the left of the boat dot (see the mascot offset below),
    // so a card opening left needs a wider gap or it lands on the otter.
    const left = clamp(
      openLeft ? anchor.x - 200 - CALLOUT_W : anchor.x + 70,
      REEL_SAFE.left,
      1080 - REEL_SAFE.right - CALLOUT_W,
    );
    const top = clamp(STAGE_TOP + anchor.y - cardH / 2, STAGE_TOP + 12, STAGE_TOP + STAGE_HEIGHT - cardH - 12);
    calloutStyleAt = {
      position: "absolute",
      zIndex: 12,
      left,
      top,
      transform: `translateX(${interpolate(calloutProgress, [0, 1], [openLeft ? -22 : 22, 0])}px) scale(${interpolate(calloutProgress, [0, 1], [0.96, 1])})`,
    };
  }

  // Strokes are authored at travel scale; counter-scale so the overview still
  // reads as a channel rather than a hairline, without ballooning mid-zoom.
  const strokeK = 1 / Math.max(camera.scale, 0.45);

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: STAGE_TOP,
          left: 0,
          width: "100%",
          height: STAGE_HEIGHT,
          overflow: "hidden",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 10%, #000 90%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, #000 10%, #000 90%, transparent 100%)",
        }}
      >
        <svg width={1080} height={STAGE_HEIGHT} viewBox={`0 0 1080 ${STAGE_HEIGHT}`}>
          <defs>
            <filter id="flowSoft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g transform={`translate(${camera.translateX} ${camera.translateY}) scale(${camera.scale})`}>
            <path d={toPath(route)} fill="none" stroke={colors.primary[700]} strokeWidth={44 * strokeK} strokeLinecap="round" strokeLinejoin="round" />
            <path d={toPath(route)} fill="none" stroke={colors.primary[200]} strokeWidth={32 * strokeK} strokeLinecap="round" strokeLinejoin="round" />
            <path
              d={toPath(route)}
              fill="none"
              stroke={condition.solid}
              strokeWidth={11 * strokeK}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - located.renderedProgress}
              filter="url(#flowSoft)"
            />
            {stops.map((point) => (
              <RouteMarker
                key={point.id}
                point={point}
                position={journey.locate(point.progress).point}
                counterScale={1 / camera.scale}
                visited={point.progress <= state.progress + 0.001}
                active={activeCallout?.id === point.id}
              />
            ))}
          </g>
        </svg>
      </div>

      <Boat x={boatScreen.x} y={STAGE_TOP + boatScreen.y} conditionColor={condition.solid} />

      {activeCallout && calloutStyleAt ? (
        summaryVisible ? (
          <AlongCallout points={unanchoredPoints} opacity={calloutProgress} style={calloutStyleAt} />
        ) : (
          <RouteCallout point={activeCallout} putInMile={putInMile} opacity={calloutProgress} style={calloutStyleAt} />
        )
      ) : null}
    </>
  );
};

// ─── The itinerary stage (no geometry) ──────────────────────────────────────
// A schematic channel down the left of the stage with the stops as rows in
// float order — spaced evenly, NOT to scale (the miles are on each row). Eddy
// paddles from row to row on the same journeyState clock the river stage uses,
// so the pauses, the "also along this float" hold and the duration Root
// computes are identical whichever stage renders.

const LINE_X = REEL_SAFE.left + 100;
const ROW_LEFT = LINE_X + 60;
const ROW_W = 1080 - REEL_SAFE.right - ROW_LEFT;
const ROW_H = 92;
// The first row clears the progress ticket (top-right of the stage); the last
// clears the dock, which overlaps the stage's bottom edge.
const ITINERARY_TOP = 136;
const ITINERARY_BOTTOM = 104;

const ItineraryStage: React.FC<StageProps> = ({
  stops,
  state,
  condition,
  putInMile,
  unanchoredPoints,
  activeCallout,
  calloutProgress,
  summaryVisible,
}) => {
  const n = stops.length;
  const pitch = n > 1 ? clamp((STAGE_HEIGHT - ITINERARY_TOP - ITINERARY_BOTTOM) / (n - 1), 124, 200) : 0;
  const contentH = ITINERARY_TOP + ITINERARY_BOTTOM + Math.max(0, n - 1) * pitch;
  const rowY = (index: number) => ITINERARY_TOP + index * pitch;

  // Boat: piecewise-linear from row to row by the stops' own progress, so it
  // arrives at a row exactly when the journey clock pauses there.
  const boatContentY = boatYAt(stops, state.progress, rowY);
  // Short itineraries sit centred; long ones scroll so the boat stays in the
  // reading zone, clamped at either end like the river camera.
  const offsetY =
    contentH <= STAGE_HEIGHT
      ? (STAGE_HEIGHT - contentH) / 2
      : clamp(STAGE_HEIGHT * 0.45 - boatContentY, STAGE_HEIGHT - contentH, 0);
  const boatY = boatContentY + offsetY;
  const lineTop = rowY(0);
  const lineBottom = rowY(n - 1);
  const drawn = lineBottom > lineTop ? clamp((boatContentY - lineTop) / (lineBottom - lineTop), 0, 1) : 1;

  const alongH = alongCardHeight(unanchoredPoints.length);
  const alongStyle: React.CSSProperties = {
    position: "absolute",
    zIndex: 12,
    left: 1080 - REEL_SAFE.right - CALLOUT_W,
    top: clamp(STAGE_TOP + boatY - alongH - 40, STAGE_TOP + 12, STAGE_TOP + STAGE_HEIGHT - alongH - 12),
    transform: `translateX(${interpolate(calloutProgress, [0, 1], [22, 0])}px) scale(${interpolate(calloutProgress, [0, 1], [0.96, 1])})`,
  };

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: STAGE_TOP,
          left: 0,
          width: "100%",
          height: STAGE_HEIGHT,
          overflow: "hidden",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 8%, #000 92%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, #000 8%, #000 92%, transparent 100%)",
        }}
      >
        <div style={{ position: "absolute", top: offsetY, left: 0, width: "100%", height: contentH }}>
          <svg width={1080} height={contentH} viewBox={`0 0 1080 ${contentH}`} style={{ position: "absolute", top: 0, left: 0 }}>
            <line x1={LINE_X} y1={lineTop} x2={LINE_X} y2={lineBottom} stroke={colors.primary[700]} strokeWidth={44} strokeLinecap="round" />
            <line x1={LINE_X} y1={lineTop} x2={LINE_X} y2={lineBottom} stroke={colors.primary[200]} strokeWidth={32} strokeLinecap="round" />
            <line
              x1={LINE_X}
              y1={lineTop}
              x2={LINE_X}
              y2={lineTop + (lineBottom - lineTop) * drawn}
              stroke={condition.solid}
              strokeWidth={11}
              strokeLinecap="round"
              opacity={drawn > 0 ? 1 : 0}
            />
            {stops.map((point, index) => (
              <RouteMarker
                key={point.id}
                point={point}
                position={{ x: LINE_X, y: rowY(index) }}
                counterScale={1}
                visited={point.progress <= state.progress + 0.001}
                active={activeCallout?.id === point.id}
              />
            ))}
          </svg>
          {stops.map((point, index) => (
            <StopRow
              key={point.id}
              point={point}
              putInMile={putInMile}
              top={rowY(index) - ROW_H / 2}
              visited={point.progress <= state.progress + 0.001}
              active={activeCallout?.id === point.id && !summaryVisible}
              activeProgress={activeCallout?.id === point.id ? calloutProgress : 0}
            />
          ))}
        </div>
      </div>

      <Boat x={LINE_X} y={STAGE_TOP + boatY} conditionColor={condition.solid} />

      {summaryVisible ? <AlongCallout points={unanchoredPoints} opacity={calloutProgress} style={alongStyle} /> : null}
    </>
  );
};

/** Vertical position of the boat for a raw progress, row-to-row. */
function boatYAt(stops: ReadonlyArray<SocialRoutePoint>, progress: number, rowY: (index: number) => number): number {
  if (stops.length < 2) return rowY(0);
  for (let i = 1; i < stops.length; i += 1) {
    const from = stops[i - 1].progress;
    const to = stops[i].progress;
    if (progress <= to || i === stops.length - 1) {
      const span = Math.max(to - from, 1e-6);
      const t = clamp((progress - from) / span, 0, 1);
      return rowY(i - 1) + (rowY(i) - rowY(i - 1)) * t;
    }
  }
  return rowY(stops.length - 1);
}

const StopRow: React.FC<{
  point: SocialRoutePoint;
  putInMile: number;
  top: number;
  visited: boolean;
  active: boolean;
  activeProgress: number;
}> = ({ point, putInMile, top, visited, active, activeProgress }) => {
  const accent = hazardFill(point);
  const milesIn = Math.max(0, point.riverMile - putInMile);
  const lift = active ? interpolate(activeProgress, [0, 1], [0, 1]) : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: ROW_LEFT,
        top,
        width: ROW_W,
        height: ROW_H,
        ...calloutStyle("light", active ? accent : undefined),
        borderWidth: 4,
        opacity: visited || active ? 1 : 0.62,
        transform: `scale(${1 + 0.025 * lift})`,
        transformOrigin: "left center",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 18px",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          minWidth: 40,
          height: 40,
          padding: "0 10px",
          borderRadius: 999,
          background: accent,
          color: inkOn(accent),
          border: `3px solid ${LIGHT.chipRule}`,
          fontFamily: fontFamilies.mono,
          fontSize: 15,
          fontWeight: 850,
        }}
      >
        {KIND_STYLE[point.kind].short}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span
          style={{
            fontFamily: fontFamilies.display,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: conditionInk(accent),
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {point.detail || point.kind.replace(/_/g, " ")}
        </span>
        <span
          style={{
            fontFamily: fontFamilies.display,
            fontSize: 30,
            fontWeight: 680,
            lineHeight: 1.05,
            color: LIGHT.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {cleanName(point.name, 30)}
        </span>
      </div>
      <span
        style={{
          flexShrink: 0,
          textAlign: "right",
          fontFamily: fontFamilies.mono,
          fontSize: 16,
          fontWeight: 650,
          color: LIGHT.inkMuted,
          lineHeight: 1.3,
        }}
      >
        {milesIn.toFixed(1)} MI IN
        <br />
        MM {point.riverMile.toFixed(1)}
      </span>
    </div>
  );
};

// ─── Pieces both stages share ───────────────────────────────────────────────

/** Eddy in the canoe, paddling on the left of the boat dot. */
const Boat: React.FC<{ x: number; y: number; conditionColor: string }> = ({ x, y, conditionColor }) => (
  <>
    <div style={{ position: "absolute", top: y - 68, left: x - 120, zIndex: 5 }}>
      {/* Negative delay: the entrance spring is already settled at frame 0,
          so the thumbnail has Eddy in the boat rather than an empty put-in. */}
      <EddyMascot variant="canoe" size={112} delay={-30} float={false} />
    </div>
    <div
      style={{
        position: "absolute",
        top: y - 10,
        left: x - 10,
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: conditionColor,
        border: `4px solid ${LIGHT.ink}`,
        boxShadow: `3px 3px 0 ${colors.neutral[300]}`,
        zIndex: 6,
      }}
    />
  </>
);

const ProgressTicket: React.FC<{ current: number; total: number; conditionColor: string }> = ({ current, total, conditionColor }) => (
  <div
    style={{
      position: "absolute",
      top: STAGE_TOP + 16,
      right: REEL_SAFE.right,
      zIndex: 8,
      background: LIGHT.surface,
      border: `4px solid ${LIGHT.rule}`,
      borderRadius: 14,
      padding: "10px 15px",
      boxShadow: `5px 5px 0 ${LIGHT.shadow}`,
      display: "flex",
      alignItems: "baseline",
      gap: 7,
    }}
  >
    <span style={{ fontFamily: fontFamilies.mono, fontSize: 25, fontWeight: 750, color: conditionInk(conditionColor) }}>{current.toFixed(1)}</span>
    <span style={{ fontFamily: fontFamilies.mono, fontSize: 16, color: LIGHT.inkMuted }}>/ {total.toFixed(1)} MI</span>
  </div>
);

const RouteMarker: React.FC<{
  point: SocialRoutePoint;
  position: JourneyPoint;
  counterScale: number;
  visited: boolean;
  active: boolean;
}> = ({ point, position, counterScale, visited, active }) => {
  const style = KIND_STYLE[point.kind];
  const endpoint = point.kind === "put_in" || point.kind === "take_out";
  const scale = (active ? 1.25 : 1) * counterScale;
  return (
    <g transform={`translate(${position.x} ${position.y}) scale(${scale})`} opacity={visited ? 1 : 0.58}>
      {active ? <circle r={endpoint ? 36 : 29} fill="none" stroke={style.fill} strokeWidth={5} opacity={0.5} /> : null}
      {endpoint ? (
        // Endpoints get a bigger, wordless mark — "OUT" in an 18px circle was
        // unreadable, and the callout already names the place.
        <>
          <circle r={24} fill={style.fill} stroke={colors.neutral[900]} strokeWidth={4} />
          <circle r={8} fill={colors.neutral[50]} stroke={colors.neutral[900]} strokeWidth={3} />
        </>
      ) : (
        <>
          <circle r={18} fill={visited ? style.fill : colors.neutral[100]} stroke={colors.neutral[900]} strokeWidth={4} />
          <text y={5} textAnchor="middle" fontFamily={fontFamilies.mono} fontSize={13} fontWeight={850} fill={visited ? colors.neutral[900] : colors.neutral[500]}>
            {style.short}
          </text>
        </>
      )}
    </g>
  );
};

const RouteCallout: React.FC<{ point: SocialRoutePoint; putInMile: number; opacity: number; style: React.CSSProperties }> = ({ point, putInMile, opacity, style }) => {
  const accent = hazardFill(point);
  const milesIn = Math.max(0, point.riverMile - putInMile);
  return (
    <BrandCallout
      accent={accent}
      width={CALLOUT_W}
      opacity={opacity}
      style={style}
      header={
        <>
          <KindBadge>{KIND_STYLE[point.kind].short}</KindBadge>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{point.detail || point.kind.replace(/_/g, " ")}</span>
        </>
      }
    >
      <div style={{ fontFamily: fontFamilies.display, fontSize: TYPE.calloutTitle.size, lineHeight: TYPE.calloutTitle.lineHeight, fontWeight: TYPE.calloutTitle.weight, color: LIGHT.ink }}>
        {cleanName(point.name, 35)}
      </div>
      <div style={{ marginTop: 8, fontFamily: fontFamilies.mono, fontSize: TYPE.calloutMeta.size, fontWeight: TYPE.calloutMeta.weight, color: LIGHT.inkMuted }}>
        {milesIn.toFixed(1)} MI INTO FLOAT · MM {point.riverMile.toFixed(1)}
      </div>
    </BrandCallout>
  );
};

function alongCardHeight(count: number): number {
  return 96 + 38 * Math.min(4, count) + (count > 4 ? 28 : 0);
}

/**
 * Features on the float with no coordinate. Named once at arrival, marked
 * approximate, never pinned or paused at: the guidebook's mile scale can be a
 * mile off the DB's, so a pin would be a lie in a graphic that is otherwise
 * exact — but the float still passes them, and the reel should say so.
 */
const AlongCallout: React.FC<{ points: UnanchoredRoutePoint[]; opacity: number; style: React.CSSProperties }> = ({ points, opacity, style }) => {
  const shown = points.slice(0, 4);
  const more = points.length - shown.length;
  return (
    <BrandCallout
      accent={colors.primary[100]}
      width={CALLOUT_W}
      opacity={opacity}
      style={style}
      header={<span>Also along this float</span>}
      headerAside={
        <span
          style={{
            fontFamily: fontFamilies.mono,
            fontSize: 12,
            fontWeight: 700,
            color: colors.primary[800],
            border: `2px solid ${colors.primary[700]}`,
            borderRadius: 999,
            padding: "2px 8px",
            letterSpacing: 0.6,
            whiteSpace: "nowrap",
          }}
        >
          APPROX.
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: -2 }}>
        {shown.map((point) => (
          <div key={point.id} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontFamily: fontFamilies.display, fontSize: 26, fontWeight: 650, color: LIGHT.ink, lineHeight: 1.1 }}>{cleanName(point.name, 24)}</span>
            <span style={{ fontFamily: fontFamilies.mono, fontSize: 16, fontWeight: 650, color: LIGHT.inkMuted, whiteSpace: "nowrap" }}>≈ MM {point.riverMile.toFixed(1)}</span>
          </div>
        ))}
        {more > 0 ? <span style={{ fontSize: 16, fontWeight: 600, color: LIGHT.inkMuted }}>+{more} more</span> : null}
      </div>
    </BrandCallout>
  );
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toPath(points: ReadonlyArray<JourneyPoint>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function cleanName(value: string, max: number): string {
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max);
  return `${sliced.slice(0, Math.max(16, sliced.lastIndexOf(" ")))}…`;
}
