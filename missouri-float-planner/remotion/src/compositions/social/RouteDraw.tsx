import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  DEFAULT_TIMING,
  arrivalFrame,
  buildJourney,
  journeyCamera,
  journeyState,
  type JourneyCamera,
  type JourneyPoint,
  type JourneyStage,
  type RoutePointKind,
  type SocialRoutePoint,
  type UnanchoredRoutePoint,
} from "../../../../shared/social-route-journey";
import { EddyMascot } from "../../components/EddyMascot";
import { colors } from "../../design-tokens/colors";
import { fontFamilies } from "../../design-tokens/fonts";
import { REEL_SAFE } from "../../lib/reel-safe";
import { CONDITION_COLORS, type RouteDrawProps } from "../../lib/social-props";
import { SectionGuide } from "./SectionGuide";

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
const DOCK_BOTTOM = REEL_SAFE.bottom + 52;
const CALLOUT_W = 390;
const CALLOUT_H = 160;

// ─── Organic Brutalist tokens (mirrors src/app/globals.css) ─────────────────
// Cards: white surface, 2px primary-700 border, 8px radius, 3px neutral-400
// offset shadow. Buttons: accent-500, 2px neutral-900 border, 6px radius.
// Scaled ~2.5× for a 1080px canvas viewed at phone width.
const BRUTAL = {
  ground: colors.neutral[50],
  surface: "#FFFFFF",
  ink: colors.neutral[900],
  inkSecondary: colors.neutral[600],
  inkMuted: colors.neutral[500],
  cardBorder: `5px solid ${colors.primary[700]}`,
  cardRadius: 22,
  cardShadow: `8px 8px 0 ${colors.neutral[400]}`,
  tileBg: colors.secondary[50],
  tileBorder: `4px solid ${colors.primary[600]}`,
  tileRadius: 16,
  tileShadow: `5px 5px 0 ${colors.neutral[300]}`,
  buttonBorder: `4px solid ${colors.neutral[900]}`,
  buttonRadius: 14,
  buttonShadow: `6px 6px 0 ${colors.neutral[400]}`,
} as const;

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

const toScreen = (point: JourneyPoint, camera: JourneyCamera) => ({
  x: point.x * camera.scale + camera.translateX,
  y: point.y * camera.scale + camera.translateY,
});

/**
 * A truthful river journey. Frame 0 is the whole float — every bend, every
 * stop, the put-in named — so the grid thumbnail is a complete card; the
 * camera then pushes in and the selected PostGIS LineString scrolls beneath a
 * fixed Eddy canoe, pausing at each intermediate feature in the reading zone.
 * Missing geometry falls back to the factual, non-geographic section card.
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

  if (!journey) {
    return (
      <SectionGuide
        riverName={riverName}
        conditionCode={conditionCode}
        putInName={putInName}
        putInMile={putInMile}
        takeOutName={takeOutName}
        takeOutMile={takeOutMile}
        distanceMi={distanceMi}
        hoursToday={hoursToday}
        hoursTypical={hoursTypical}
        dateLabel={dateLabel}
        followCta={followCta}
        format={props.format}
      />
    );
  }

  const route = journey.points;
  const intermediate = routePoints.filter((point) => point.progress > 0.015 && point.progress < 0.985);
  const state = journeyState(frame, intermediate);
  // Every on-screen position is a RAW arc-length fraction mapped through the
  // journey — boat, markers and drawn line alike — so all of them agree with
  // the stored geometry to within journey.maxDeviationPx.
  const located = journey.locate(state.progress);
  const current = located.point;
  const camera = journeyCamera(frame, route, current, STAGE);
  const boatScreen = toScreen(current, camera);
  const travelledMiles = Math.min(distanceMi, distanceMi * state.progress);
  const activeIntermediate = state.activeStop === null ? null : intermediate[state.activeStop];
  const putIn = routePoints.find((point) => point.kind === "put_in");
  const takeOut = routePoints.find((point) => point.kind === "take_out");

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

  // Callout placement: attach to the active point on screen and open on the
  // side the channel is NOT heading toward, so the card never covers the
  // next bend. Clamped into the stage and the horizontal safe zone.
  let calloutStyle: React.CSSProperties | null = null;
  if (activeCallout) {
    const p = activeCallout.progress;
    const here = journey.locate(p).point;
    const probe = journey.locate(p >= 0.99 ? p - 0.06 : Math.min(1, p + 0.06)).point;
    const headingX = p >= 0.99 ? here.x - probe.x : probe.x - here.x;
    const anchor = toScreen(here, camera);
    const openLeft = headingX > 0;
    const cardH = summaryVisible
      ? 96 + 38 * Math.min(4, unanchoredPoints.length) + (unanchoredPoints.length > 4 ? 28 : 0)
      : CALLOUT_H;
    // Eddy paddles on the left of the boat dot (see the mascot offset below),
    // so a card opening left needs a wider gap or it lands on the otter.
    const left = clamp(
      openLeft ? anchor.x - 200 - CALLOUT_W : anchor.x + 70,
      REEL_SAFE.left,
      1080 - REEL_SAFE.right - CALLOUT_W,
    );
    const top = clamp(STAGE_TOP + anchor.y - cardH / 2, STAGE_TOP + 12, STAGE_TOP + STAGE_HEIGHT - cardH - 12);
    calloutStyle = {
      left,
      top,
      transform: `translateX(${interpolate(calloutProgress, [0, 1], [openLeft ? -22 : 22, 0])}px) scale(${interpolate(calloutProgress, [0, 1], [0.96, 1])})`,
    };
  }

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

  // Strokes are authored at travel scale; counter-scale so the overview still
  // reads as a channel rather than a hairline, without ballooning mid-zoom.
  const strokeK = 1 / Math.max(camera.scale, 0.45);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRUTAL.ground,
        color: BRUTAL.ink,
        fontFamily: fontFamilies.body,
        overflow: "hidden",
      }}
    >
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={(audioFrame) =>
          interpolate(audioFrame, [0, FPS, durationInFrames - FPS, durationInFrames], [0, 0.42, 0.42, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      {photoUrl ? (
        <AbsoluteFill style={{ opacity: 0.07 }}>
          <SafeImg src={photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      ) : null}

      <Header
        label={label}
        riverName={riverName}
        subtitle={tagline || dateLabel || `${putInName} to ${takeOutName}`}
      />

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
            {routePoints.map((point) => (
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

      {/* Eddy rides the boat position — fixed once the camera is following. */}
      <div style={{ position: "absolute", top: STAGE_TOP + boatScreen.y - 68, left: boatScreen.x - 120, zIndex: 5 }}>
        {/* Negative delay: the entrance spring is already settled at frame 0,
            so the thumbnail has Eddy in the boat rather than an empty put-in. */}
        <EddyMascot variant="canoe" size={112} delay={-30} float={false} />
      </div>
      <div
        style={{
          position: "absolute",
          top: STAGE_TOP + boatScreen.y - 10,
          left: boatScreen.x - 10,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: condition.solid,
          border: `4px solid ${BRUTAL.ink}`,
          boxShadow: `3px 3px 0 ${colors.neutral[300]}`,
          zIndex: 6,
        }}
      />

      {activeCallout && calloutStyle ? (
        summaryVisible ? (
          <AlongCallout points={unanchoredPoints} opacity={calloutProgress} style={calloutStyle} />
        ) : (
          <RouteCallout point={activeCallout} putInMile={putInMile} opacity={calloutProgress} style={calloutStyle} />
        )
      ) : null}

      <ProgressTicket current={travelledMiles} total={distanceMi} conditionColor={condition.solid} />
      <StatsDock
        hours={hoursToday}
        distance={distanceMi}
        conditionLabel={evergreen ? (difficulty ? `Class ${difficulty}` : "Favorite") : condition.label}
        conditionColor={condition.solid}
        detail={deltaCopy}
        cta={cta}
        followCta={followCta}
      />
    </AbsoluteFill>
  );
};

const Header: React.FC<{ label: string; riverName: string; subtitle: string }> = ({ label, riverName, subtitle }) => (
  <div style={{ position: "absolute", top: REEL_SAFE.top, left: REEL_SAFE.left, right: REEL_SAFE.right, zIndex: 10 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span
        style={{
          background: colors.accent[500],
          border: BRUTAL.buttonBorder,
          borderRadius: 999,
          padding: "7px 16px",
          fontFamily: fontFamilies.display,
          fontSize: 22,
          fontWeight: 650,
          color: "white",
          letterSpacing: 1,
          textTransform: "uppercase",
          boxShadow: `4px 4px 0 ${colors.neutral[400]}`,
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: fontFamilies.display, fontSize: 24, fontWeight: 650, color: colors.primary[900] }}>eddy.guide</span>
    </div>
    <div style={{ marginTop: 20, fontFamily: fontFamilies.display, fontSize: 70, lineHeight: 0.98, fontWeight: 680, color: BRUTAL.ink, letterSpacing: -1.5 }}>
      {riverName}
    </div>
    <div style={{ marginTop: 8, fontSize: 25, color: BRUTAL.inkSecondary, fontWeight: 560 }}>{subtitle}</div>
  </div>
);

const ProgressTicket: React.FC<{ current: number; total: number; conditionColor: string }> = ({ current, total, conditionColor }) => (
  <div
    style={{
      position: "absolute",
      top: STAGE_TOP + 16,
      right: REEL_SAFE.right,
      zIndex: 8,
      background: BRUTAL.surface,
      border: `4px solid ${colors.primary[700]}`,
      borderRadius: 14,
      padding: "10px 15px",
      boxShadow: `5px 5px 0 ${colors.neutral[400]}`,
      display: "flex",
      alignItems: "baseline",
      gap: 7,
    }}
  >
    <span style={{ fontFamily: fontFamilies.mono, fontSize: 25, fontWeight: 750, color: conditionColor }}>{current.toFixed(1)}</span>
    <span style={{ fontFamily: fontFamilies.mono, fontSize: 16, color: BRUTAL.inkMuted }}>/ {total.toFixed(1)} MI</span>
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
  const isHazard = point.kind === "hazard";
  const accent = isHazard ? (point.severity === "danger" ? "#DC2626" : "#E5A000") : KIND_STYLE[point.kind].fill;
  const milesIn = Math.max(0, point.riverMile - putInMile);
  return (
    <div
      style={{
        position: "absolute",
        zIndex: 12,
        width: CALLOUT_W,
        opacity,
        background: BRUTAL.surface,
        border: BRUTAL.cardBorder,
        borderRadius: 20,
        boxShadow: BRUTAL.cardShadow,
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: accent, borderBottom: `4px solid ${colors.primary[700]}` }}>
        <span
          style={{
            minWidth: 30,
            height: 30,
            padding: "0 9px",
            display: "grid",
            placeItems: "center",
            borderRadius: 999,
            border: `2px solid ${colors.neutral[900]}`,
            background: colors.neutral[50],
            fontFamily: fontFamilies.mono,
            fontSize: 13,
            fontWeight: 850,
          }}
        >
          {KIND_STYLE[point.kind].short}
        </span>
        <span
          style={{
            fontFamily: fontFamilies.display,
            fontSize: 19,
            fontWeight: 700,
            color: isHazard ? colors.neutral[900] : "white",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {point.detail || point.kind.replace(/_/g, " ")}
        </span>
      </div>
      <div style={{ padding: "14px 17px 15px" }}>
        <div style={{ fontFamily: fontFamilies.display, fontSize: 34, lineHeight: 1.05, fontWeight: 680, color: BRUTAL.ink }}>{cleanName(point.name, 35)}</div>
        <div style={{ marginTop: 8, fontFamily: fontFamilies.mono, fontSize: 18, fontWeight: 650, color: BRUTAL.inkMuted }}>{milesIn.toFixed(1)} MI INTO FLOAT · MM {point.riverMile.toFixed(1)}</div>
      </div>
    </div>
  );
};

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
    <div
      style={{
        position: "absolute",
        zIndex: 12,
        width: CALLOUT_W,
        opacity,
        background: BRUTAL.surface,
        border: BRUTAL.cardBorder,
        borderRadius: 20,
        boxShadow: BRUTAL.cardShadow,
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 14px", background: colors.primary[100], borderBottom: `4px solid ${colors.primary[700]}` }}>
        <span style={{ fontFamily: fontFamilies.display, fontSize: 19, fontWeight: 700, color: colors.primary[900], textTransform: "uppercase", letterSpacing: 0.8, whiteSpace: "nowrap" }}>
          Also along this float
        </span>
        <span style={{ fontFamily: fontFamilies.mono, fontSize: 12, fontWeight: 700, color: colors.primary[800], border: `2px solid ${colors.primary[700]}`, borderRadius: 999, padding: "2px 8px", letterSpacing: 0.6, whiteSpace: "nowrap" }}>
          APPROX.
        </span>
      </div>
      <div style={{ padding: "12px 17px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map((point) => (
          <div key={point.id} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontFamily: fontFamilies.display, fontSize: 26, fontWeight: 650, color: BRUTAL.ink, lineHeight: 1.1 }}>{cleanName(point.name, 24)}</span>
            <span style={{ fontFamily: fontFamilies.mono, fontSize: 16, fontWeight: 650, color: BRUTAL.inkMuted, whiteSpace: "nowrap" }}>≈ MM {point.riverMile.toFixed(1)}</span>
          </div>
        ))}
        {more > 0 ? <span style={{ fontSize: 16, fontWeight: 600, color: BRUTAL.inkMuted }}>+{more} more</span> : null}
      </div>
    </div>
  );
};

const StatsDock: React.FC<{ hours: number; distance: number; conditionLabel: string; conditionColor: string; detail: string; cta: number; followCta?: string }> = ({ hours, distance, conditionLabel, conditionColor, detail, cta, followCta }) => (
  <>
    <div style={{ position: "absolute", left: REEL_SAFE.left, right: REEL_SAFE.right, bottom: DOCK_BOTTOM, zIndex: 15 }}>
      <div style={{ background: BRUTAL.surface, border: BRUTAL.cardBorder, borderRadius: BRUTAL.cardRadius, boxShadow: BRUTAL.cardShadow, padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13 }}>
          <StatTile value={`~${hours.toFixed(1)}`} unit="HRS" label="Float time" />
          <StatTile value={distance.toFixed(1)} unit="MI" label="Distance" />
          <StatTile value={conditionLabel} label="Conditions" color={conditionColor} compact />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, marginTop: 16, padding: "0 5px" }}>
          <span style={{ fontSize: 20, fontWeight: 620, color: BRUTAL.inkSecondary }}>{detail}</span>
          <span
            style={{
              opacity: cta,
              transform: `translateY(${interpolate(cta, [0, 1], [8, 0])}px)`,
              background: colors.accent[500],
              color: "white",
              border: BRUTAL.buttonBorder,
              borderRadius: BRUTAL.buttonRadius,
              boxShadow: BRUTAL.buttonShadow,
              padding: "10px 16px",
              fontFamily: fontFamilies.display,
              fontSize: 23,
              fontWeight: 680,
              whiteSpace: "nowrap",
            }}
          >
            Plan this float →
          </span>
        </div>
      </div>
    </div>
    {followCta ? (
      <div
        style={{
          position: "absolute",
          left: REEL_SAFE.left,
          right: REEL_SAFE.right,
          bottom: REEL_SAFE.bottom,
          zIndex: 15,
          opacity: cta,
          textAlign: "center",
          fontFamily: fontFamilies.display,
          fontSize: 20,
          fontWeight: 600,
          color: colors.primary[700],
        }}
      >
        {followCta}
      </div>
    ) : null}
  </>
);

const StatTile: React.FC<{ value: string; unit?: string; label: string; color?: string; compact?: boolean }> = ({ value, unit, label, color = colors.neutral[900], compact = false }) => (
  <div
    style={{
      minHeight: 112,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      background: BRUTAL.tileBg,
      border: BRUTAL.tileBorder,
      borderRadius: BRUTAL.tileRadius,
      boxShadow: BRUTAL.tileShadow,
      padding: "10px 8px",
      textAlign: "center",
    }}
  >
    <div style={{ fontFamily: fontFamilies.display, fontSize: compact ? 30 : 43, lineHeight: 1, fontWeight: 720, color }}>
      {value}{unit ? <span style={{ marginLeft: 5, fontFamily: fontFamilies.mono, fontSize: 16, color: BRUTAL.inkMuted }}>{unit}</span> : null}
    </div>
    <div style={{ marginTop: 8, fontSize: 14, fontWeight: 750, letterSpacing: 1.2, textTransform: "uppercase", color: BRUTAL.inkMuted }}>{label}</div>
  </div>
);

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

class SafeImg extends React.Component<{ src: string; style?: React.CSSProperties }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {}
  render() {
    if (this.state.failed) return null;
    return <Img src={this.props.src} onError={() => this.setState({ failed: true })} style={this.props.style} />;
  }
}
