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
  buildJourneyRoute,
  journeyState,
  pointAtRouteProgress,
  type JourneyPoint,
  type RoutePointKind,
  type SocialRoutePoint,
} from "../../../../shared/social-route-journey";
import { EddyMascot } from "../../components/EddyMascot";
import { colors } from "../../design-tokens/colors";
import { fontFamilies } from "../../design-tokens/fonts";
import { CONDITION_COLORS, type RouteDrawProps } from "../../lib/social-props";
import { SectionGuide } from "./SectionGuide";

const FPS = 30;
const STAGE_TOP = 300;
const STAGE_HEIGHT = 1110;
const BOAT_X = 540;
const BOAT_Y = 565;

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

/**
 * A truthful scrolling river journey. The selected PostGIS LineString moves
 * beneath a fixed Eddy canoe; intermediate points pause in the reading zone.
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
  } = props;
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const condition = evergreen
    ? EVERGREEN_STYLE
    : CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;
  const route = useMemo(() => buildJourneyRoute(routeCoordinates), [routeCoordinates]);

  if (!route) {
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

  const intermediate = routePoints.filter((point) => point.progress > 0.015 && point.progress < 0.985);
  const state = journeyState(frame, intermediate);
  const current = pointAtRouteProgress(route, state.progress);
  const cameraX = BOAT_X - current.x;
  const cameraY = BOAT_Y - current.y;
  const travelledMiles = Math.min(distanceMi, distanceMi * state.progress);
  const activeIntermediate = state.activeStop === null ? null : intermediate[state.activeStop];
  const putIn = routePoints.find((point) => point.kind === "put_in");
  const takeOut = routePoints.find((point) => point.kind === "take_out");
  const launchProgress = interpolate(frame, [3, 18, 28], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const finishProgress = state.complete
    ? spring({ frame: frame - (durationInFrames - 88), fps, config: { damping: 14, stiffness: 120 } })
    : 0;
  const activeCallout = activeIntermediate ?? (launchProgress > 0 ? putIn : finishProgress > 0 ? takeOut : null);
  const calloutProgress = activeIntermediate ? state.calloutProgress : Math.max(launchProgress, finishProgress);

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

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.neutral[50],
        color: colors.neutral[900],
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

      {/* Quiet paper/topographic texture—structure, not a faux basemap. */}
      <AbsoluteFill
        style={{
          opacity: 0.55,
          backgroundImage:
            "radial-gradient(circle at 20% 18%, rgba(45,120,137,.11) 0 2px, transparent 2px), radial-gradient(circle at 76% 65%, rgba(184,157,114,.13) 0 2px, transparent 2px)",
          backgroundSize: "54px 54px, 71px 71px",
        }}
      />

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
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)",
        }}
      >
        <svg width={1080} height={STAGE_HEIGHT} viewBox={`0 0 1080 ${STAGE_HEIGHT}`}>
          <defs>
            <filter id="flowSoft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g transform={`translate(${cameraX} ${cameraY})`}>
            <path d={toPath(route)} fill="none" stroke={colors.primary[900]} strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" />
            <path d={toPath(route)} fill="none" stroke={colors.primary[300]} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
            <path
              d={toPath(route)}
              fill="none"
              stroke={condition.solid}
              strokeWidth={11}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - state.progress}
              filter="url(#flowSoft)"
            />
            {routePoints.map((point) => (
              <RouteMarker
                key={point.id}
                point={point}
                position={pointAtRouteProgress(route, point.progress)}
                visited={point.progress <= state.progress + 0.001}
                active={activeCallout?.id === point.id}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Eddy stays in the reading zone while the geographic world moves. */}
      <div style={{ position: "absolute", top: STAGE_TOP + BOAT_Y - 68, left: BOAT_X - 120, zIndex: 5 }}>
        <EddyMascot variant="canoe" size={112} delay={10} float={false} />
      </div>
      <div
        style={{
          position: "absolute",
          top: STAGE_TOP + BOAT_Y - 10,
          left: BOAT_X - 10,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: condition.solid,
          border: `4px solid ${colors.neutral[900]}`,
          boxShadow: `3px 3px 0 ${colors.neutral[300]}`,
          zIndex: 6,
        }}
      />

      {activeCallout ? (
        <RouteCallout
          point={activeCallout}
          putInMile={putInMile}
          opacity={calloutProgress}
        />
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
  <div style={{ position: "absolute", top: 58, left: 64, right: 64, zIndex: 10 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ background: colors.accent[500], border: `2px solid ${colors.neutral[900]}`, borderRadius: 999, padding: "7px 15px", fontFamily: fontFamilies.display, fontSize: 22, fontWeight: 650, color: "white", letterSpacing: 1, textTransform: "uppercase", boxShadow: `3px 3px 0 ${colors.neutral[900]}` }}>
        {label}
      </span>
      <span style={{ fontFamily: fontFamilies.display, fontSize: 24, fontWeight: 650, color: colors.primary[900] }}>eddy.guide</span>
    </div>
    <div style={{ marginTop: 22, fontFamily: fontFamilies.display, fontSize: 70, lineHeight: 0.98, fontWeight: 680, color: colors.neutral[900], letterSpacing: -1.5 }}>
      {riverName}
    </div>
    <div style={{ marginTop: 10, fontSize: 25, color: colors.neutral[600], fontWeight: 560 }}>{subtitle}</div>
  </div>
);

const ProgressTicket: React.FC<{ current: number; total: number; conditionColor: string }> = ({ current, total, conditionColor }) => (
  <div style={{ position: "absolute", top: STAGE_TOP + 72, right: 52, zIndex: 8, background: "white", border: `2px solid ${colors.neutral[900]}`, borderRadius: 12, padding: "10px 15px", boxShadow: `4px 4px 0 ${colors.primary[800]}`, display: "flex", alignItems: "baseline", gap: 7 }}>
    <span style={{ fontFamily: fontFamilies.mono, fontSize: 25, fontWeight: 750, color: conditionColor }}>{current.toFixed(1)}</span>
    <span style={{ fontFamily: fontFamilies.mono, fontSize: 16, color: colors.neutral[500] }}>/ {total.toFixed(1)} MI</span>
  </div>
);

const RouteMarker: React.FC<{ point: SocialRoutePoint; position: JourneyPoint; visited: boolean; active: boolean }> = ({ point, position, visited, active }) => {
  const style = KIND_STYLE[point.kind];
  const scale = active ? 1.25 : 1;
  return (
    <g transform={`translate(${position.x} ${position.y}) scale(${scale})`} opacity={visited ? 1 : 0.58}>
      {active ? <circle r={29} fill="none" stroke={style.fill} strokeWidth={5} opacity={0.5} /> : null}
      <circle r={18} fill={visited ? style.fill : colors.neutral[100]} stroke={colors.neutral[900]} strokeWidth={4} />
      <text y={5} textAnchor="middle" fontFamily={fontFamilies.mono} fontSize={point.kind === "put_in" || point.kind === "take_out" ? 8 : 13} fontWeight={850} fill={visited ? colors.neutral[900] : colors.neutral[500]}>
        {style.short}
      </text>
    </g>
  );
};

const RouteCallout: React.FC<{ point: SocialRoutePoint; putInMile: number; opacity: number }> = ({ point, putInMile, opacity }) => {
  const isHazard = point.kind === "hazard";
  const accent = isHazard ? (point.severity === "danger" ? "#DC2626" : "#E5A000") : KIND_STYLE[point.kind].fill;
  const milesIn = Math.max(0, point.riverMile - putInMile);
  return (
    <div style={{ position: "absolute", zIndex: 12, left: 610, top: STAGE_TOP + BOAT_Y - 82, width: 390, opacity, transform: `translateX(${interpolate(opacity, [0, 1], [22, 0])}px) scale(${interpolate(opacity, [0, 1], [0.96, 1])})`, background: "white", border: `3px solid ${colors.neutral[900]}`, borderRadius: 16, boxShadow: `7px 7px 0 ${accent}`, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 15px", background: accent, borderBottom: `3px solid ${colors.neutral[900]}` }}>
        <span style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: "50%", border: `2px solid ${colors.neutral[900]}`, background: colors.neutral[50], fontFamily: fontFamilies.mono, fontWeight: 850 }}>{KIND_STYLE[point.kind].short}</span>
        <span style={{ fontFamily: fontFamilies.display, fontSize: 21, fontWeight: 700, color: isHazard ? colors.neutral[900] : "white", textTransform: "uppercase", letterSpacing: 0.8 }}>{point.detail || point.kind.replace(/_/g, " ")}</span>
      </div>
      <div style={{ padding: "15px 17px 16px" }}>
        <div style={{ fontFamily: fontFamilies.display, fontSize: 34, lineHeight: 1.05, fontWeight: 680, color: colors.neutral[900] }}>{cleanName(point.name, 35)}</div>
        <div style={{ marginTop: 8, fontFamily: fontFamilies.mono, fontSize: 18, fontWeight: 650, color: colors.neutral[500] }}>{milesIn.toFixed(1)} MI INTO FLOAT · MM {point.riverMile.toFixed(1)}</div>
      </div>
    </div>
  );
};

const StatsDock: React.FC<{ hours: number; distance: number; conditionLabel: string; conditionColor: string; detail: string; cta: number; followCta?: string }> = ({ hours, distance, conditionLabel, conditionColor, detail, cta, followCta }) => (
  <div style={{ position: "absolute", left: 58, right: 58, bottom: 58, zIndex: 15 }}>
    <div style={{ background: "white", border: `3px solid ${colors.neutral[900]}`, borderRadius: 20, boxShadow: `8px 8px 0 ${colors.primary[900]}`, padding: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13 }}>
        <StatTile value={`~${hours.toFixed(1)}`} unit="HRS" label="Float time" />
        <StatTile value={distance.toFixed(1)} unit="MI" label="Distance" />
        <StatTile value={conditionLabel} label="Conditions" color={conditionColor} compact />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, marginTop: 16, padding: "0 5px" }}>
        <span style={{ fontSize: 20, fontWeight: 620, color: colors.neutral[600] }}>{detail}</span>
        <span style={{ opacity: cta, transform: `translateY(${interpolate(cta, [0, 1], [8, 0])}px)`, background: colors.accent[500], color: "white", border: `2px solid ${colors.neutral[900]}`, borderRadius: 12, boxShadow: `4px 4px 0 ${colors.neutral[900]}`, padding: "10px 16px", fontFamily: fontFamilies.display, fontSize: 23, fontWeight: 680, whiteSpace: "nowrap" }}>Plan this float →</span>
      </div>
    </div>
    {followCta ? <div style={{ opacity: cta, marginTop: 17, textAlign: "center", fontFamily: fontFamilies.display, fontSize: 20, fontWeight: 600, color: colors.primary[700] }}>{followCta}</div> : null}
  </div>
);

const StatTile: React.FC<{ value: string; unit?: string; label: string; color?: string; compact?: boolean }> = ({ value, unit, label, color = colors.neutral[900], compact = false }) => (
  <div style={{ minHeight: 112, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: colors.neutral[50], border: `2px solid ${colors.neutral[900]}`, borderRadius: 12, boxShadow: `3px 3px 0 ${colors.neutral[300]}`, padding: "10px 8px", textAlign: "center" }}>
    <div style={{ fontFamily: fontFamilies.display, fontSize: compact ? 30 : 43, lineHeight: 1, fontWeight: 720, color }}>
      {value}{unit ? <span style={{ marginLeft: 5, fontFamily: fontFamilies.mono, fontSize: 16, color: colors.neutral[500] }}>{unit}</span> : null}
    </div>
    <div style={{ marginTop: 8, fontSize: 14, fontWeight: 750, letterSpacing: 1.2, textTransform: "uppercase", color: colors.neutral[500] }}>{label}</div>
  </div>
);

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
