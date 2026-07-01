import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
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

// Evergreen "favorite" accent — a warm editorial gold, deliberately OFF the
// cool live-condition palette so "Eddy's Favorite Float" reads as a curated,
// timeless postcard rather than today's gauge snapshot (Float of the Day).
const EVERGREEN_STYLE = {
  solid: "#e0b057",
  bg: "rgba(224,176,87,0.12)",
  glow: "rgba(224,176,87,0.45)",
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
  dateLabel,
  followCta,
  format,
  label = "Float of the Day",
  tagline,
  evergreen = false,
  difficulty,
  photoUrl,
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

  // Float of the Day pulses the leading "boat" — a live-instrument tell. Evergreen
  // favorites draw with a calm, steady marker so they don't read as live.
  const boatPulse = evergreen ? 1 : 1 + 0.25 * Math.sin(frame / 5);

  // The payoff (float time + distance) lands first — front-loaded into the first
  // second for retention — while the route keeps drawing as live "proof" beneath
  // it. The take-out reveal still ties to the line finishing.
  const stampEntrance = spring({ frame: frame - 25, fps, config: ENTRANCE });
  const takeOutReveal = interpolate(drawProgress, [0.9, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // CTA enters ~70 frames before the end so it lands late regardless of the
  // duration Root's calculateMetadata chooses (360 default, tighter otherwise);
  // clamped so it never fires before the route/stamp choreography (frame 120).
  const ctaStart = Math.min(120, Math.max(60, durationInFrames - 70));
  const ctaEntrance = spring({ frame: frame - ctaStart, fps, config: { damping: 12, mass: 0.5, stiffness: 100 } });

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

      {/* Favorites composite a real section photo behind the graphic; a dimmed
          teal wash keeps the white text legible + on-brand. A dead/slow URL
          degrades to the solid background (SafeImg) so the daily render never
          fails. Daily Float-of-the-Day passes no photoUrl → solid bg unchanged. */}
      {photoUrl && (
        <AbsoluteFill style={{ opacity: bgOpacity }}>
          <SafeImg
            src={photoUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(15,45,53,0.74) 0%, rgba(15,45,53,0.58) 46%, rgba(15,45,53,0.85) 100%)",
            }}
          />
        </AbsoluteFill>
      )}

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
            tagline ("why"); otherwise the date. The eyebrow renders at full
            opacity from frame 0 (no entrance fade) so the first autoplay frame /
            grid thumbnail is branded, not empty. */}
        <ReelMasthead
          eyebrow={label}
          title={riverName}
          subtitle={tagline || dateLabel}
          subtitleItalic={!!tagline}
          glow={condition.glow}
          isPortrait={isPortrait}
          eyebrowOpacity={1}
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

        {/* CTA + optional smaller followCta line beneath (lower emphasis). */}
        <BrandCTA color={condition.solid} opacity={ctaEntrance} isPortrait={isPortrait} style={{ marginTop: 4 }} />
        {followCta && (
          <span
            style={{
              opacity: ctaEntrance,
              fontFamily: displayFont,
              fontSize: isPortrait ? 22 : 18,
              fontWeight: 500,
              color: "rgba(255,255,255,0.6)",
              letterSpacing: 0.5,
              textAlign: "center",
            }}
          >
            {followCta}
          </span>
        )}
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

/**
 * Full-bleed image that degrades to nothing — the solid brand background shows
 * through — if the source fails to load. Favorites pass a real (public) section
 * photo URL; a dead or slow URL must never fail the daily posting render, so we
 * both pass Remotion's `onError` (which keeps the render from failing) and catch
 * any synchronous error as a belt-and-suspenders fallback.
 */
class SafeImg extends React.Component<
  { src: string; style?: React.CSSProperties },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // Swallow — the fallback (solid background) renders instead.
  }
  render() {
    if (this.state.failed) return null;
    return (
      <Img
        src={this.props.src}
        onError={() => this.setState({ failed: true })}
        style={this.props.style}
      />
    );
  }
}
