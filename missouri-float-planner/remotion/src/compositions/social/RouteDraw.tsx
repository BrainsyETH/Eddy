import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  staticFile,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { Watermark } from "../../components/Watermark";
import { BrandCTA } from "../../components/BrandCTA";
import { ReelMasthead } from "../../components/ReelMasthead";
import { ENTRANCE } from "../../lib/spring-presets";
import { REEL_SAFE, reelLoopOpacity } from "../../lib/reel-safe";
import {
  CONDITION_COLORS,
  getOtterVariant,
  type RouteDrawProps,
} from "../../lib/social-props";
import { colors } from "../../design-tokens/colors";

const FPS = 30;

// Springs read as cool inflows — a distinct sky tone from the condition color
// and the put-in (accent) / take-out (condition) markers.
const SPRING_COLOR = "#7dd3fc";

// Evergreen "favorite" accent — a calm brand water-teal used instead of a live
// condition color when the post isn't tied to today's gauge (Favorite Floats).
const EVERGREEN_STYLE = {
  solid: colors.primary[300],
  bg: "rgba(114,181,196,0.12)",
  glow: "rgba(114,181,196,0.45)",
  label: "Favorite",
};

type Pt = [number, number];

/** Build a smooth serpentine "river" polyline from put-in (top) to take-out
 *  (bottom) within the given pixel bounds. Many points → straight segments read
 *  as a smooth meander while keeping arc-length math trivial and deterministic. */
function buildRoute(
  centerX: number,
  topY: number,
  bottomY: number,
  amplitude: number,
): Pt[] {
  const N = 40;
  return Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    const y = topY + t * (bottomY - topY);
    // 2.5 bends, tapering near the ends so the markers sit on a calm stretch.
    const taper = Math.sin(t * Math.PI);
    const x = centerX + Math.sin(t * Math.PI * 2.5) * amplitude * taper;
    return [x, y];
  });
}

/** Point at fraction p (0..1) of total polyline length, plus the drawn prefix. */
function along(pts: Pt[], p: number): { point: Pt; drawn: Pt[] } {
  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segLen.push(d);
    total += d;
  }
  const target = p * total;
  const drawn: Pt[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = segLen[i - 1];
    if (acc + d >= target) {
      const f = d === 0 ? 0 : (target - acc) / d;
      const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
      const y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
      drawn.push([x, y]);
      return { point: [x, y], drawn };
    }
    acc += d;
    drawn.push(pts[i]);
  }
  return { point: pts[pts.length - 1], drawn };
}

function toPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  return (
    `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} ` +
    pts
      .slice(1)
      .map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ")
  );
}

/**
 * Self-drawing route reel — 12s, 1080x1920.
 *
 * The put-in → take-out line draws itself while a glowing "boat" rides the
 * leading edge, then the current float time is stamped on the route. A static
 * conditions card looks like anyone made it; a route that draws itself reads as
 * a live instrument — visual proof there's real data underneath.
 */
export const RouteDraw: React.FC<RouteDrawProps> = ({
  riverName,
  conditionCode,
  putInName,
  putInMile,
  takeOutName,
  takeOutMile,
  distanceMi,
  hoursToday,
  hoursTypical,
  springs = [],
  dateLabel,
  format,
  label = "Float of the Day",
  tagline,
  evergreen = false,
  difficulty,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  // Favorites are evergreen — not tied to today's gauge — so they use a neutral
  // brand accent instead of a live condition color.
  const condition = evergreen
    ? EVERGREEN_STYLE
    : CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown;
  const isPortrait = format === "portrait";
  const loopOpacity = isPortrait ? reelLoopOpacity(frame, durationInFrames) : 1;

  // ─── Route geometry ──────────────────────────────────────
  const centerX = width / 2;
  // Route sits between the put-in lane (below the header) and the take-out lane
  // (above the float-time stamp). Labels live in those lanes — never on the path.
  const topY = height * 0.33;
  const bottomY = height * 0.51;
  const amplitude = width * 0.18;
  const route = buildRoute(centerX, topY, bottomY, amplitude);
  const putIn = route[0];
  const takeOut = route[route.length - 1];

  // ─── Float-time delta (the decision-grade number) ─────────
  const deltaHrs = hoursTypical - hoursToday; // + = faster than usual today
  const absDelta = Math.abs(deltaHrs);
  const faster = deltaHrs > 0;
  const significantDelta = absDelta >= 0.3;
  // Evergreen favorites aren't a live snapshot — show the typical pace, never a
  // "faster/slower today" delta (there's no today to compare against).
  const deltaText = evergreen
    ? "typical pace"
    : significantDelta
      ? `${absDelta.toFixed(1)} hrs ${faster ? "faster" : "slower"}`
      : "about the usual pace";
  const deltaColor = evergreen || !significantDelta
    ? "rgba(255,255,255,0.6)"
    : faster
      ? condition.solid
      : "#eab308";

  // ─── Animations ──────────────────────────────────────────
  const bgOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const titleEntrance = spring({ frame, fps, config: ENTRANCE });
  const riverEntrance = spring({ frame: frame - 10, fps, config: ENTRANCE });
  const dateEntrance = spring({ frame: frame - 20, fps, config: ENTRANCE });

  // The line draws itself over frames 45-205 (~5.3s).
  const drawProgress = interpolate(frame, [45, 205], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const { point: boat, drawn } = along(route, drawProgress);
  const drawComplete = drawProgress >= 0.999;

  // Springs placed by mile fraction along the route; each fades in as the drawn
  // line passes it. Clamp slightly off the ends so they don't sit under the
  // put-in / take-out markers.
  const mileSpan = takeOutMile - putInMile;
  const springDots = springs.map((s) => {
    const frac = mileSpan > 0 ? (s.mile - putInMile) / mileSpan : 0;
    const p = Math.min(0.97, Math.max(0.03, frac));
    return { p, point: along(route, p).point };
  });
  const boatPulse = 1 + 0.25 * Math.sin(frame / 5);

  // Float-time stamp + take-out reveal land as the line finishes.
  const stampEntrance = spring({ frame: frame - 190, fps, config: ENTRANCE });
  const takeOutReveal = interpolate(drawProgress, [0.9, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ctaEntrance = spring({ frame: frame - 290, fps, config: { damping: 12, mass: 0.5, stiffness: 100 } });

  const labelFont = "'Geist Sans', system-ui, sans-serif";
  const displayFont = "'Fredoka', system-ui, sans-serif";

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], opacity: loopOpacity }}>
      <Audio
        src={staticFile("audio/background-music.wav")}
        volume={(f) =>
          interpolate(f, [0, FPS, durationInFrames - FPS, durationInFrames], [0, 0.5, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />

      {/* Ambient condition glow behind the route */}
      <div
        style={{
          position: "absolute",
          top: "48%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 760,
          height: 760,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${condition.glow} 0%, transparent 65%)`,
          opacity: 0.3,
        }}
      />

      {/* ─── SVG route ─────────────────────────────────────── */}
      <AbsoluteFill style={{ opacity: bgOpacity }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute" }}>
          <defs>
            <filter id="routeGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Full route as a faint "remaining" track */}
          <path
            d={toPath(route)}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2 14"
          />

          {/* Drawn portion — condition-colored, glowing */}
          <path
            d={toPath(drawn)}
            fill="none"
            stroke={condition.solid}
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#routeGlow)"
          />

          {/* Put-in marker (always present from the start) */}
          <circle cx={putIn[0]} cy={putIn[1]} r={14} fill={colors.accent[400]} filter="url(#routeGlow)" />
          <circle cx={putIn[0]} cy={putIn[1]} r={6} fill="#fff" />

          {/* Springs along the run — fade in as the line passes each one */}
          {springDots.map((s, i) => {
            const op = interpolate(drawProgress, [s.p, Math.min(1, s.p + 0.04)], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <g key={i} opacity={op}>
                <circle cx={s.point[0]} cy={s.point[1]} r={12} fill={SPRING_COLOR} opacity={0.25} filter="url(#routeGlow)" />
                <circle cx={s.point[0]} cy={s.point[1]} r={6.5} fill={SPRING_COLOR} filter="url(#routeGlow)" />
                <circle cx={s.point[0]} cy={s.point[1]} r={2.5} fill="#fff" />
              </g>
            );
          })}

          {/* Leading "boat" dot rides the draw edge */}
          {!drawComplete && (
            <>
              <circle cx={boat[0]} cy={boat[1]} r={18 * boatPulse} fill={condition.solid} opacity={0.25} />
              <circle cx={boat[0]} cy={boat[1]} r={10} fill="#fff" filter="url(#routeGlow)" />
            </>
          )}

          {/* Take-out marker fades in as the route completes */}
          <g opacity={takeOutReveal}>
            <circle cx={takeOut[0]} cy={takeOut[1]} r={16} fill={condition.solid} filter="url(#routeGlow)" />
            <circle cx={takeOut[0]} cy={takeOut[1]} r={6} fill="#fff" />
          </g>
        </svg>

        {/* Put-in lane — above the route, centered, cleaned + truncated name */}
        <EndpointRow
          top={putIn[1] - (isPortrait ? 150 : 112)}
          tag="Put-in"
          name={cleanName(putInName)}
          mile={putInMile}
          color={colors.accent[400]}
          opacity={riverEntrance}
          isPortrait={isPortrait}
          labelFont={labelFont}
          displayFont={displayFont}
        />
        {/* Take-out lane — below the route */}
        <EndpointRow
          top={takeOut[1] + (isPortrait ? 44 : 30)}
          tag="Take-out"
          name={cleanName(takeOutName)}
          mile={takeOutMile}
          color={condition.solid}
          opacity={takeOutReveal}
          isPortrait={isPortrait}
          labelFont={labelFont}
          displayFont={displayFont}
        />
      </AbsoluteFill>

      {/* ─── Header ─────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: isPortrait ? REEL_SAFE.top : 48,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Favorites relabel the eyebrow + show the guide's section name as the
            tagline ("why"); otherwise the date. */}
        <ReelMasthead
          eyebrow={label}
          title={riverName}
          subtitle={tagline || dateLabel}
          subtitleItalic={!!tagline}
          glow={condition.glow}
          isPortrait={isPortrait}
          eyebrowOpacity={titleEntrance}
          titleOpacity={riverEntrance}
          subtitleOpacity={dateEntrance}
        />
      </div>

      {/* ─── Float-time stamp (hero) ────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: isPortrait ? REEL_SAFE.bottom + 40 : 80,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        {/* Float Time + Distance as co-equal hero stats (same size). */}
        <div
          style={{
            opacity: stampEntrance,
            transform: `scale(${interpolate(stampEntrance, [0, 1], [0.85, 1])})`,
            display: "flex",
            alignItems: "stretch",
            gap: isPortrait ? 40 : 30,
            backgroundColor: "rgba(10,30,35,0.7)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: `1.5px solid ${condition.solid}`,
            borderRadius: 22,
            padding: isPortrait ? "20px 44px" : "16px 34px",
            boxShadow: `0 0 30px ${condition.glow}`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: isPortrait ? 250 : 190 }}>
            <span style={{ fontFamily: labelFont, fontSize: isPortrait ? 20 : 16, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 2 }}>
              Float Time
            </span>
            <span style={{ fontFamily: displayFont, fontSize: isPortrait ? 64 : 48, fontWeight: 700, color: condition.solid, textShadow: `0 0 24px ${condition.glow}`, lineHeight: 1.05 }}>
              ~{hoursToday.toFixed(1)} hrs
            </span>
            <span style={{ fontFamily: labelFont, fontSize: isPortrait ? 22 : 16, fontWeight: 500, color: deltaColor, textAlign: "center" }}>
              {deltaText}
            </span>
          </div>

          <div style={{ width: 1.5, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.15)" }} />

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: isPortrait ? 250 : 190 }}>
            <span style={{ fontFamily: labelFont, fontSize: isPortrait ? 20 : 16, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 2 }}>
              Distance
            </span>
            <span style={{ fontFamily: displayFont, fontSize: isPortrait ? 64 : 48, fontWeight: 700, color: "#fff", lineHeight: 1.05 }}>
              {distanceMi.toFixed(1)} mi
            </span>
            <span style={{ fontFamily: labelFont, fontSize: isPortrait ? 22 : 16, fontWeight: 600, color: condition.solid }}>
              {evergreen ? (difficulty ? `Class ${difficulty}` : "Favorite") : condition.label}
            </span>
          </div>
        </div>

        <BrandCTA color={condition.solid} opacity={ctaEntrance} isPortrait={isPortrait} style={{ marginTop: 4 }} />
      </div>

      {/* Eddy paddles in to the right of the take-out, tucked just beside the
          label so it never overlaps the centered text or the float-time stamp. */}
      <div style={{ position: "absolute", right: isPortrait ? 56 : 48, top: takeOut[1] + (isPortrait ? 6 : 4), opacity: takeOutReveal }}>
        <EddyMascot variant={getOtterVariant(conditionCode)} size={isPortrait ? 150 : 120} delay={195} />
      </div>

      {/* Persistent eddy.guide mark — survives any mid-animation screenshot. */}
      <Watermark format={isPortrait ? "portrait" : "landscape"} />
    </AbsoluteFill>
  );
};

/** Access-point names can be long ("Hazel Creek Recreation Area and access in
 *  Mark Twain National Forest"). Keep the first clause and cap on a word
 *  boundary so the label fits one line and never overruns the graphic. */
function cleanName(s: string): string {
  // Names arrive pre-cleaned (first clause) from the picker; just cap length so
  // long ones don't overrun. We deliberately don't re-split on punctuation here,
  // which would re-break names like "Hwy. 76 Bridge".
  let t = (s || "").trim().replace(/\s+/g, " ");
  if (t.length > 26) {
    t = t.slice(0, 26);
    const sp = t.lastIndexOf(" ");
    t = (sp > 14 ? t.slice(0, sp) : t) + "…";
  }
  return t;
}

/** Put-in / take-out info in a fixed full-width lane (centered), so the label
 *  never overlaps the animated route path. */
const EndpointRow: React.FC<{
  top: number;
  tag: string;
  name: string;
  mile: number;
  color: string;
  opacity: number;
  isPortrait: boolean;
  labelFont: string;
  displayFont: string;
}> = ({ top, tag, name, mile, color, opacity, isPortrait, labelFont, displayFont }) => (
  <div
    style={{
      position: "absolute",
      top,
      left: 0,
      right: 0,
      opacity,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2,
      padding: "0 70px",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
      <span style={{ fontFamily: labelFont, fontSize: isPortrait ? 20 : 16, color, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>
        {tag}
      </span>
    </div>
    <span style={{ fontFamily: displayFont, fontSize: isPortrait ? 38 : 28, fontWeight: 600, color: "#fff", textAlign: "center", lineHeight: 1.1, textShadow: "0 2px 14px rgba(0,0,0,0.9)" }}>
      {name}
    </span>
    <span style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: isPortrait ? 28 : 20, fontWeight: 600, color: "rgba(255,255,255,0.8)", textShadow: "0 2px 12px rgba(0,0,0,0.95)" }}>
      MM {mile.toFixed(1)}
    </span>
  </div>
);
