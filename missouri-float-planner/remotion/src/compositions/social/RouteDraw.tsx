import React, { useMemo } from "react";
import { useRouteViewport } from "../../lib/use-route-viewport";
import { terrainMapPlan, terrainJourneyCamera, terrainImageTransform } from "../../../../shared/social-terrain-map";
import { Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import {
  DEFAULT_TIMING,
  arrivalFrame,
  buildJourney,
  journeyCamera,
  journeyState,
  type Journey,
  type JourneyCamera,
  type JourneyPoint,
  type JourneyState,
  type RoutePointKind,
  type SocialRoutePoint,
  type UnanchoredRoutePoint,
} from "../../../../shared/social-route-journey";
import {
  CTA,
  SURFACES,
  calloutStyle,
  colors,
  conditionInk,
  inkOn,
} from "../../../../shared/social-brand";
import { EddyMascot } from "../../components/EddyMascot";
import { ReelPage, SafeImg } from "../../components/ReelPage";
import { BrandCallout, BrandCard, BrandPill, KindBadge, StatTile } from "../../components/BrandCard";
import { fontFamilies } from "../../design-tokens/fonts";
import { REEL_SAFE } from "../../lib/reel-safe";
import { CONDITION_COLORS, type RouteDrawProps } from "../../lib/social-props";

import {
  ROUTE_CONTENT_WIDTH as CALLOUT_W,
  ROUTE_MAP_STAGE as STAGE,
} from "../../../../shared/social-route-layout";

const FPS = 30;

// ─── Layout ─────────────────────────────────────────────────────────────────
// A CSS grid sizes the masthead, mileage row, flexible map and footer.
// Only river strokes fade at the map edges; readable content never overlaps.

const LIGHT = SURFACES.light;

const EVERGREEN_STYLE = {
  solid: colors.secondary[600],
  bg: colors.secondary[100],
  glow: "rgba(184,157,114,0.22)",
  label: "Favorite",
};

const KIND_STYLE: Record<RoutePointKind, { fill: string }> = {
  put_in: { fill: colors.support[500] },
  take_out: { fill: colors.accent[500] },
  access: { fill: colors.primary[300] },
  campground: { fill: colors.secondary[400] },
  spring: { fill: colors.primary[400] },
  poi: { fill: colors.secondary[300] },
  hazard: { fill: "#E5A000" },
};

const hazardFill = (point: SocialRoutePoint) =>
  point.kind === "hazard" ? (point.severity === "danger" ? "#DC2626" : "#E5A000") : KIND_STYLE[point.kind].fill;

const toScreen = (point: JourneyPoint, camera: JourneyCamera) => ({
  x: point.x * camera.scale + camera.translateX,
  y: point.y * camera.scale + camera.translateY,
});

/** Readable endpoint pills never clip or cover the passing canoe. */
function showEndpointLabel(position: JourneyPoint, active: boolean, boat: JourneyPoint, height: number) {
  const markerScale = active ? 1.25 : 1;
  const label = { left: position.x - 43 * markerScale, right: position.x + 43 * markerScale,
    top: position.y + 31 * markerScale, bottom: position.y + 63 * markerScale };
  const clearsCanoe = label.right + 8 <= boat.x - 128 || label.left - 8 >= boat.x ||
    label.bottom + 8 <= boat.y - 76 || label.top - 8 >= boat.y + 10;
  return label.left >= 0 && label.right <= CALLOUT_W && label.top >= 0 &&
    label.bottom <= height && clearsCanoe;
}

/**
 * A truthful river journey. Frame 0 is the whole float — every bend, every
 * stop, the put-in named — so the grid thumbnail is a complete card; the
 * terrain camera stays north-up while Eddy follows the PostGIS LineString.
 * Legacy mapless previews retain their following camera.
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
    timeRangeLabel,
    dateLabel,
    label = "Float Pick",
    tagline,
    evergreen = false,
    difficulty,
    photoUrl,
    terrainMapUrl,
    routeCoordinates,
    routePoints = [],
    unanchoredPoints = [],
  } = props;
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const viewport = useRouteViewport();
  const stage = { ...STAGE, height: viewport.height, boatY: viewport.height / 2 };
  const condition = evergreen
    ? EVERGREEN_STYLE
    : CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;
  const terrain = useMemo(() => terrainMapUrl ? terrainMapPlan(routeCoordinates) : null, [terrainMapUrl, routeCoordinates]);
  const journey = useMemo(() => terrain?.journey ?? buildJourney(routeCoordinates), [terrain, routeCoordinates]);

  // Every stop in float order, endpoints guaranteed: the itinerary needs them
  // as rows even when the points query failed and routePoints is empty.
  const stops = useMemo(
    () => orderedStops(routePoints, { putInName, putInMile, takeOutName, takeOutMile }),
    [routePoints, putInName, putInMile, takeOutName, takeOutMile],
  );
  const intermediate = stops.filter((point) => point.progress > 0.015 && point.progress < 0.985);
  const state = journeyState(frame, intermediate);
  const arrival = arrivalFrame(intermediate);
  const camera = journey ? (terrain
    ? terrainJourneyCamera(frame, journey.points, journey.locate(state.progress).point, arrival, stage, viewport.top)
    : journeyCamera(frame, journey.points, journey.locate(state.progress).point, stage, DEFAULT_TIMING, arrival)) : null;
  const mapTransform = camera ? terrainImageTransform(camera, viewport.top) : null;
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
  const summaryVisible =
    unanchoredPoints.length > 0 && frame >= arrival && frame < arrival + summaryFrames;
  const summaryProgress = summaryVisible
    ? Math.min(1, (frame - arrival) / 6, (arrival + summaryFrames - frame) / 6)
    : 0;
  const finishProgress = state.complete && !summaryVisible
    ? spring({ frame: frame - (durationInFrames - 88), fps, config: { damping: 14, stiffness: 120 } })
    : 0;
  const activeCallout =
    activeIntermediate ?? (launchProgress > 0 ? putIn : state.complete ? takeOut : null);
  const calloutProgress = activeIntermediate
    ? state.calloutProgress
    : summaryVisible
      ? summaryProgress
      : Math.max(launchProgress, finishProgress);


  const routeLabel = `${cleanName(putInName, 40)} → ${cleanName(takeOutName, 40)}`;
  const closing = Math.min(1, Math.max(0, (frame - (durationInFrames - 90)) / 12));

  const presence = clamp(calloutProgress, 0, 1);
  const stageProps = {
    stageHeight: viewport.height,
    stops,
    state,
    condition,
    putInMile,
    unanchoredPoints,
    activeCallout,
    calloutProgress,
    summaryVisible,
    travelledMiles,
    distanceMi,
    arrival,
  };

  return (
    <ReelPage backdrop={photoUrl ? { src: photoUrl } : undefined}>
      {terrain && terrainMapUrl && mapTransform ? <>
        <Img src={terrainMapUrl} style={{ position: "absolute", width: 1080, height: 1920,
          transformOrigin: "0 0", transform: `translate(${mapTransform.x}px, ${mapTransform.y}px) scale(${mapTransform.scale})`,
          filter: "saturate(0.45) brightness(1.04)" }} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(250,248,240,0.48)" }} />
      </> : null}
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={(audioFrame) =>
          interpolate(audioFrame, [0, FPS, durationInFrames - FPS, durationInFrames], [0, 0.42, 0.42, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      <div data-route-layout="flow" style={{ position: "absolute", top: REEL_SAFE.top,
        bottom: REEL_SAFE.bottom + (terrain ? 38 : 0), left: REEL_SAFE.left, width: CALLOUT_W,
        display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr) auto", gap: 12 }}>
        <div data-route-region="header">
          <BrandCard padding="12px 20px">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <BrandPill fill={colors.accent[500]} size={15}>{label}</BrandPill>
              <span style={{ fontFamily: fontFamilies.display, fontSize: 22, fontWeight: 700 }}>eddy.guide</span>
            </div>
            <div style={{ marginTop: 8, fontSize: tagline ? 24 : 28, lineHeight: 1.2, fontWeight: 650,
              color: colors.primary[800], display: "-webkit-box", WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {tagline || `Your next ${distanceMi.toFixed(1)}-mile float`}
            </div>
            <div style={{ fontFamily: fontFamilies.display, fontSize: riverName.length > 24 ? 40 : 52,
              fontWeight: 700, lineHeight: 1.05, marginTop: 3, display: "-webkit-box",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{riverName}</div>
            <div style={{ fontSize: 22, lineHeight: 1.2, fontWeight: 600, marginTop: 7,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{routeLabel}</div>
          </BrandCard>
        </div>

        <div data-route-region="progress" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <ProgressTicket current={travelledMiles} total={distanceMi} />
          {terrain ? <span style={{ fontSize: 19, fontWeight: 650, color: LIGHT.ink }}>N ↑</span> : null}
        </div>

        <div ref={viewport.ref} data-route-region="map" data-route-top={viewport.top} data-route-height={viewport.height}
          style={{ position: "relative", minHeight: 0 }}>
          {journey && camera
            ? <RiverStage journey={journey} camera={camera} terrain={Boolean(terrain)} {...stageProps} />
            : <ItineraryStage {...stageProps} />}
        </div>

        <div data-route-region="footer" style={{ position: "relative", zIndex: 15 }}>
          {journey && (summaryVisible || activeCallout) ?
            <div data-route-region="stop-reveal" data-presence={presence} style={{ display: "grid",
              gridTemplateRows: `${presence}fr`, opacity: presence, marginBottom: 16 * presence }}>
              <div style={{ minHeight: 0, overflow: "hidden", marginRight: -8 }}>
                <div data-route-region="stop" style={{ paddingBottom: 8, paddingRight: 8 }}>
                  {summaryVisible
                    ? <AlongCallout points={unanchoredPoints} opacity={1} style={{ width: "100%" }} />
                    : activeCallout ? <RouteCallout point={activeCallout} putInMile={putInMile} opacity={1} style={{ width: "100%" }} /> : null}
                </div>
              </div>
            </div> : null}
          <div data-route-region="stats">
            <BrandCard padding={14}>
              <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.8fr 1fr", gap: 10 }}>
                <StatTile value={timeRangeLabel ?? "Unavailable"} label={evergreen ? "Typical time" : "Est. float time"} compact wrap dense minHeight={80} />
                <StatTile value={distanceMi.toFixed(1)} unit="MI" label="Distance" compact dense minHeight={80} />
                <StatTile value={evergreen ? (difficulty ? `Class ${difficulty}` : "Favorite") : condition.label}
                  label={evergreen ? (difficulty ? "Difficulty" : "Float pick") : "Conditions"} color={condition.solid} compact dense minHeight={80} />
              </div>
              {dateLabel ? <div style={{ marginTop: 8, fontSize: 18, fontWeight: 550, lineHeight: 1.2,
                color: LIGHT.inkSecondary }}>{dateLabel}</div> : null}
            </BrandCard>
          </div>
          <div data-route-region="cta" style={{ marginTop: 16, opacity: closing, textAlign: "center",
            background: LIGHT.surface, borderRadius: 16, padding: "8px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              fontFamily: fontFamilies.display, fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>
              <svg width="26" height="30" viewBox="0 0 24 28" fill={colors.accent[500]} stroke={LIGHT.ink} strokeWidth="2.5">
                <path d="M4 2h16v23l-8-5-8 5z" />
              </svg>
              {CTA.saveFloat}
            </div>
            <div style={{ fontSize: 24, lineHeight: 1.2, fontWeight: 650, marginTop: 4, color: colors.primary[800] }}>{CTA.planInApp}</div>
          </div>
        </div>
      </div>
      {terrain ? <div data-route-region="attribution" style={{ position: "absolute", left: REEL_SAFE.left,
        bottom: REEL_SAFE.bottom, display: "flex", alignItems: "center", gap: 12,
        padding: "3px 8px", borderRadius: 6, background: colors.primary[800], color: "#FFFFFF", fontSize: 16 }}>
        <Img src={staticFile("mapbox-logo.svg")} style={{ width: 88, height: 24 }} />
        <span>© Mapbox © OpenStreetMap</span>
      </div> : null}
    </ReelPage>
  );
};

// ─── Shared stage inputs ────────────────────────────────────────────────────

type ConditionStyle = { solid: string; bg: string; glow: string; label: string };

interface StageProps {
  stageHeight: number;
  stops: SocialRoutePoint[];
  state: JourneyState;
  condition: ConditionStyle;
  putInMile: number;
  unanchoredPoints: UnanchoredRoutePoint[];
  activeCallout: SocialRoutePoint | null;
  calloutProgress: number;
  summaryVisible: boolean;
  travelledMiles: number;
  distanceMi: number;
  arrival: number;
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

const RiverStage: React.FC<StageProps & { journey: Journey; camera: JourneyCamera; terrain: boolean }> = ({
  journey,
  terrain,
  camera,
  stops,
  state,
  condition,
  activeCallout,
  stageHeight,
}) => {
  const route = journey.points;
  const located = journey.locate(state.progress);
  const boatScreen = toScreen(located.point, camera);

  // Strokes are authored at travel scale; counter-scale so the overview still
  // reads as a channel rather than a hairline, without ballooning mid-zoom.
  const strokeK = 1 / Math.max(camera.scale, 0.45);

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: -REEL_SAFE.left,
          width: 1080,
          height: stageHeight,
          overflow: "hidden",
        }}
      >
        <svg width={1080} height={stageHeight} viewBox={`0 0 1080 ${stageHeight}`}>
          <defs>
            <linearGradient id="routeEdgeFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="black" /><stop offset="0.06" stopColor="white" /><stop offset="0.94" stopColor="white" /><stop offset="1" stopColor="black" /></linearGradient>
            <mask id="routeStrokeMask"><rect width={1080} height={stageHeight} fill="url(#routeEdgeFade)" /></mask>
            <filter id="flowSoft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g mask="url(#routeStrokeMask)"><g transform={`translate(${camera.translateX + REEL_SAFE.left} ${camera.translateY}) scale(${camera.scale})`}>
            <path d={toPath(route)} fill="none" stroke={colors.primary[700]} strokeWidth={(terrain ? 16 : 44) * strokeK} strokeLinecap="round" strokeLinejoin="round" />
            <path d={toPath(route)} fill="none" stroke={colors.primary[200]} strokeWidth={(terrain ? 10 : 32) * strokeK} strokeLinecap="round" strokeLinejoin="round" />
            <path
              d={toPath(route)}
              fill="none"
              stroke={condition.solid}
              strokeWidth={(terrain ? 6 : 11) * strokeK}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - located.renderedProgress}
              filter={terrain ? undefined : "url(#flowSoft)"}
            />
          </g></g>
          <g transform={`translate(${camera.translateX + REEL_SAFE.left} ${camera.translateY}) scale(${camera.scale})`}>
            {stops.map((point) => (
              <RouteMarker
                key={point.id}
                point={point}
                position={journey.locate(point.progress).point}
                counterScale={1 / camera.scale}
                visited={point.progress <= state.progress + 0.001}
                active={activeCallout?.id === point.id}
                showLabel={showEndpointLabel(toScreen(journey.locate(point.progress).point, camera),
                  activeCallout?.id === point.id, boatScreen, stageHeight)}
              />
            ))}
          </g>
        </svg>
        <Boat x={boatScreen.x + REEL_SAFE.left} y={boatScreen.y} conditionColor={condition.solid} />
      </div>

    </>
  );
};

// ─── The itinerary stage (no geometry) ──────────────────────────────────────
// A schematic channel down the left of the stage with the stops as rows in
// float order — spaced evenly, NOT to scale (the miles are on each row). Eddy
// paddles from row to row on the same journeyState clock the river stage uses,
// so the pauses, the arrival hold and the duration Root computes are identical
// whichever stage renders. Mile-only features (guidebook springs with no
// coordinate) are rows too — slotted by their nominal mile and drawn as
// approximate — rather than a floating card, which has nowhere to sit in a
// list without covering a row. The arrival hold highlights them.

const LINE_X = 130;
const ROW_LEFT = LINE_X + 60;
const ROW_W = CALLOUT_W - ROW_LEFT;
const ROW_H = 92;
// Keep the full canoe above the first row and the endpoint label below the
// last. Longer lists scroll through the measured map viewport.
const ITINERARY_TOP = 80;
const ITINERARY_BOTTOM = 84;
const ROW_PITCH_MIN = 106;
const ROW_PITCH_MAX = 200;

type ItineraryRow =
  | { kind: "stop"; point: SocialRoutePoint; stopIndex: number }
  | { kind: "approx"; point: UnanchoredRoutePoint };

/**
 * Stops in float order with the mile-only features slotted between them by
 * river mile. Their miles are on the guidebook's scale, which can disagree
 * with the DB's by over a mile, so a mile-only row is placed by its nominal
 * mile and DRAWN as approximate (dashed, "≈ MM", an APPROX. pill), and is
 * always kept inside the endpoints: after the put-in, before the take-out.
 */
function itineraryRows(
  stops: ReadonlyArray<SocialRoutePoint>,
  unanchored: ReadonlyArray<UnanchoredRoutePoint>,
): ItineraryRow[] {
  const rows: ItineraryRow[] = stops.map((point, stopIndex) => ({ kind: "stop", point, stopIndex }));
  const byMile = [...unanchored].sort((a, b) => a.riverMile - b.riverMile);
  for (const point of byMile) {
    const downstream = rows.findIndex((row) => row.kind === "stop" && row.point.riverMile > point.riverMile);
    const at = downstream === -1 ? Math.max(1, rows.length - 1) : Math.max(1, downstream);
    rows.splice(at, 0, { kind: "approx", point });
  }
  return rows;
}

const ItineraryStage: React.FC<StageProps> = ({
  stops,
  state,
  condition,
  putInMile,
  unanchoredPoints,
  activeCallout,
  calloutProgress,
  summaryVisible,
  stageHeight,
}) => {
  const rows = useMemo(() => itineraryRows(stops, unanchoredPoints), [stops, unanchoredPoints]);
  const n = rows.length;
  const pitch = n > 1 ? clamp((stageHeight - ITINERARY_TOP - ITINERARY_BOTTOM) / (n - 1), ROW_PITCH_MIN, ROW_PITCH_MAX) : 0;
  const contentH = ITINERARY_TOP + ITINERARY_BOTTOM + Math.max(0, n - 1) * pitch;
  const rowY = (index: number) => ITINERARY_TOP + index * pitch;
  // Row index of each stop, so the boat's row-to-row path skips the approx rows
  // it has no progress value for (it glides past them).
  const stopRow: number[] = [];
  rows.forEach((row, index) => {
    if (row.kind === "stop") stopRow[row.stopIndex] = index;
  });

  // Boat: piecewise-linear from stop row to stop row by the stops' own
  // progress, so it arrives at a row exactly when the journey clock pauses there.
  const boatContentY = boatYAt(stops, state.progress, (stopIndex) => rowY(stopRow[stopIndex] ?? 0));
  // Short itineraries sit centred; long ones scroll so the boat stays in the
  // reading zone, clamped at either end like the river camera.
  const offsetY =
    contentH <= stageHeight
      ? (stageHeight - contentH) / 2
      : clamp(stageHeight * 0.45 - boatContentY, stageHeight - contentH, 0);
  const boatY = boatContentY + offsetY;
  const lineTop = rowY(0);
  const lineBottom = rowY(n - 1);
  const drawn = lineBottom > lineTop ? clamp((boatContentY - lineTop) / (lineBottom - lineTop), 0, 1) : 1;

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: stageHeight,
          overflow: "hidden",
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
            {rows.map((row, index) =>
              row.kind === "stop" ? (
                <RouteMarker
                  key={row.point.id}
                  point={row.point}
                  position={{ x: LINE_X, y: rowY(index) }}
                  counterScale={1}
                  visited={row.point.progress <= state.progress + 0.001}
                  active={activeCallout?.id === row.point.id && !summaryVisible}
                  showLabel={showEndpointLabel({ x: LINE_X, y: rowY(index) + offsetY },
                    activeCallout?.id === row.point.id && !summaryVisible, { x: LINE_X, y: boatY }, stageHeight)}
                />
              ) : (
                <ApproxMarker key={row.point.id} point={row.point} y={rowY(index)} active={summaryVisible} />
              ),
            )}
          </svg>
          {rows.map((row, index) =>
            row.kind === "stop" ? (
              <StopRow
                key={row.point.id}
                point={row.point}
                putInMile={putInMile}
                top={rowY(index) - ROW_H / 2}
                visited={row.point.progress <= state.progress + 0.001}
                active={activeCallout?.id === row.point.id && !summaryVisible}
                activeProgress={activeCallout?.id === row.point.id ? calloutProgress : 0}
              />
            ) : (
              <ApproxRow
                key={row.point.id}
                point={row.point}
                top={rowY(index) - ROW_H / 2}
                active={summaryVisible}
                activeProgress={summaryVisible ? calloutProgress : 0}
              />
            ),
          )}
        </div>
      </div>

      <Boat x={LINE_X} y={boatY} conditionColor={condition.solid} />
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
}> = ({ point, putInMile, top, visited, active }) => {
  const accent = hazardFill(point);
  const milesIn = Math.max(0, point.riverMile - putInMile);
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
        boxShadow: `5px 5px 0 ${active ? accent : LIGHT.shadow}`,
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
        <StopIcon kind={point.kind} />
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
        {milesIn.toFixed(1)} MI
        <br />
        FROM START
      </span>
    </div>
  );
};

/** A mile-only feature's mark on the schematic channel: hollow and dashed, so
 *  it reads as "about here" next to the solid, coordinate-true stop marks. */
const ApproxMarker: React.FC<{ point: UnanchoredRoutePoint; y: number; active: boolean }> = ({ point, y, active }) => {
  const style = KIND_STYLE[point.kind];
  return (
    <g transform={`translate(${LINE_X} ${y}) scale(${active ? 1.25 : 1})`} opacity={active ? 1 : 0.85}>
      {active ? <circle r={29} fill="none" stroke={style.fill} strokeWidth={5} opacity={0.5} /> : null}
      <circle r={18} fill={LIGHT.surface} stroke={colors.neutral[900]} strokeWidth={4} strokeDasharray="6 5" />
      <g transform="translate(-12 -12)"><StopIcon kind={point.kind} /></g>
    </g>
  );
};

/**
 * The itinerary row for a mile-only feature. Same card as a stop, but dashed,
 * with "≈ MM" and an APPROX. pill: the float passes it, the guidebook says
 * roughly where, and nothing here claims more than that.
 */
const ApproxRow: React.FC<{
  point: UnanchoredRoutePoint;
  top: number;
  active: boolean;
  activeProgress: number;
}> = ({ point, top, active }) => {
  const accent = KIND_STYLE[point.kind].fill;
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
        borderStyle: "dashed",
        opacity: active ? 1 : 0.8,
        boxShadow: `5px 5px 0 ${active ? accent : LIGHT.shadow}`,
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
          background: LIGHT.surface,
          color: colors.neutral[700],
          border: `3px dashed ${LIGHT.chipRule}`,
          fontFamily: fontFamilies.mono,
          fontSize: 15,
          fontWeight: 850,
        }}
      >
        <StopIcon kind={point.kind} />
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
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
            {point.detail || "Along this float"}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontFamily: fontFamilies.mono,
              fontSize: 11,
              fontWeight: 700,
              color: colors.primary[800],
              border: `2px solid ${colors.primary[700]}`,
              borderRadius: 999,
              padding: "1px 7px",
              letterSpacing: 0.6,
              whiteSpace: "nowrap",
            }}
          >
            APPROX.
          </span>
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
        ≈ MM {point.riverMile.toFixed(1)}
        <br />
        GUIDEBOOK MILE
      </span>
    </div>
  );
};

// ─── Pieces both stages share ───────────────────────────────────────────────

/** Eddy in the canoe, paddling on the left of the boat dot. */
const Boat: React.FC<{ x: number; y: number; conditionColor: string }> = ({ x, y, conditionColor }) => (
  <>
    <div data-route-region="canoe" style={{ position: "absolute", top: y - 76, left: x - 128, zIndex: 5 }}>
      {/* Negative delay: the entrance spring is already settled at frame 0,
          so the thumbnail has Eddy in the boat rather than an empty put-in. */}
      <EddyMascot variant="canoe" size={128} delay={-30} float={false} />
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

const ProgressTicket: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <span style={{ flexShrink: 0, fontFamily: fontFamilies.mono, fontSize: 24, lineHeight: 1.2, fontWeight: 700,
    color: LIGHT.ink, background: LIGHT.surface, padding: "6px 10px", borderRadius: 8 }}>
    {current.toFixed(1)} / {total.toFixed(1)} mi
  </span>
);

const RouteMarker: React.FC<{
  point: SocialRoutePoint;
  position: JourneyPoint;
  counterScale: number;
  visited: boolean;
  active: boolean;
  showLabel?: boolean;
}> = ({ point, position, counterScale, visited, active, showLabel = true }) => {
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
          <g transform="translate(-12 -12)"><StopIcon kind={point.kind} /></g>
        </>
      )}
      {endpoint && showLabel ? <>
        <rect data-route-label={point.kind} x={-42} y={32} width={84} height={30} rx={8} fill={LIGHT.surface} stroke={LIGHT.rule} strokeWidth={2} />
        <text y={54} textAnchor="middle" fontFamily={fontFamilies.display} fontSize={22} fontWeight={700} fill={LIGHT.ink}>
          {point.kind === "put_in" ? "Start" : "Finish"}
        </text>
      </> : null}
    </g>
  );
};

/** Consistent vector symbols; never A/C initials that look like stop order. */
const StopIcon: React.FC<{ kind: RoutePointKind }> = ({ kind }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    {kind === "campground" ? <><path d="m3 20 9-17 9 17H3Z" /><path d="m8 20 4-8 4 8" /></>
      : kind === "spring" ? <><path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" /><path d="M8 15a4 4 0 0 0 4 4" /></>
      : kind === "hazard" ? <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3v.1" /></>
      : kind === "take_out" ? <><path d="M5 22V3m0 0h15l-4 5 4 5H5" /></>
      : kind === "put_in" || kind === "access" ? <><path d="M3 17h18l-4 4H7l-4-4Zm3-13 12 12m-6-6 4-6 4 4-6 4" /></>
      : <><path d="M19 9c0 5-7 13-7 13S5 14 5 9a7 7 0 1 1 14 0Z" /><circle cx="12" cy="9" r="2" /></>}
  </svg>
);

const RouteCallout: React.FC<{ point: SocialRoutePoint; putInMile: number; opacity: number; style: React.CSSProperties }> = ({ point, putInMile, opacity, style }) => {
  const accent = hazardFill(point);
  const milesIn = Math.max(0, point.riverMile - putInMile);
  const title = cleanName(point.name, 70);
  const kindLabel = point.kind === "put_in" ? "Start · Put-in" : point.kind === "take_out" ? "Finish · Take-out" : point.detail || point.kind.replace(/_/g, " ");
  return (
    <BrandCallout accent={accent} width={CALLOUT_W} opacity={opacity} style={style}
      header={<><KindBadge><StopIcon kind={point.kind} /></KindBadge><span>{kindLabel}</span></>}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {point.photoUrl ? <div style={{ width: 130, height: 96, flexShrink: 0, overflow: "hidden", borderRadius: 10, background: colors.secondary[100] }}>
          <SafeImg src={point.photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div> : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: fontFamilies.display, fontSize: title.length > 40 ? 30 : 34,
            lineHeight: 1.05, fontWeight: 700, color: LIGHT.ink, display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
          <div style={{ marginTop: 6, fontSize: 22, lineHeight: 1.2, fontWeight: 550, color: LIGHT.inkSecondary }}>
            {point.kind === "put_in" ? "Your float starts here" : `${milesIn.toFixed(1)} miles from launch`}
          </div>
          {point.photoCredit ? <div style={{ marginTop: 4, fontSize: 14, lineHeight: 1.2, color: LIGHT.inkMuted }}>{point.photoCredit}</div> : null}
        </div>
      </div>
    </BrandCallout>
  );
};

/**
 * Features on the float with no coordinate. Named once at arrival, marked
 * approximate, never pinned or paused at: the guidebook's mile scale can be a
 * mile off the DB's, so a pin would be a lie in a graphic that is otherwise
 * exact — but the float still passes them, and the reel should say so.
 */
const AlongCallout: React.FC<{ points: UnanchoredRoutePoint[]; opacity: number; style: React.CSSProperties; progress?: React.ReactNode }> = ({ points, opacity, style, progress }) => {
  const shown = points.slice(0, 4);
  const more = points.length - shown.length;
  return (
    <BrandCallout
      accent={colors.primary[100]}
      width={CALLOUT_W}
      opacity={opacity}
      style={style}
      header={<span>Along this float · Approx.{more > 0 ? ` (+${more})` : ""}</span>}
      headerAside={progress}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 18px", marginTop: -2 }}>
        {shown.map((point) => (
          <div key={point.id} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: fontFamilies.display, fontSize: 22, fontWeight: 650, color: LIGHT.ink, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cleanName(point.name, 24)}</span>
            <span style={{ fontFamily: fontFamilies.mono, fontSize: 16, fontWeight: 650, color: LIGHT.inkMuted, whiteSpace: "nowrap" }}>≈ MM {point.riverMile.toFixed(1)}</span>
          </div>
        ))}

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
