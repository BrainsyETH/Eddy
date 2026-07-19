import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
} from "remotion";
import { SMOOTH } from "../lib/spring-presets";
import { colors } from "../design-tokens/colors";

export interface GaugeSeriesPoint {
  hoursAgo: number;
  gaugeHeightFt: number | null;
}

interface GaugeBarProps {
  /** Current gauge reading in feet */
  currentHeight: number;
  /** Bottom of optimal range — omit (with optimalMax) for a level-only bar
   *  when the river has no trustworthy ft thresholds. */
  optimalMin?: number;
  /** Top of optimal range */
  optimalMax?: number;
  /** High-water threshold — dashed line + label; the fill flips to the
   *  condition color the moment the animated level crosses it (optional). */
  levelHigh?: number;
  /** Dangerous/flood threshold — shades a red "flood" zone above it (optional). */
  levelDangerous?: number;
  /** Max value for the gauge scale (auto-calculated if omitted) */
  maxHeight?: number;
  /** Condition accent color */
  conditionColor: string;
  /** Kept for API compat — the field-instrument restyle dropped the bloom. */
  conditionGlow?: string;
  /** Delay before fill animation starts (in frames) — series-absent mode only */
  delay?: number;
  /** Bar width */
  width?: number;
  /** Bar height */
  height?: number;
  /** Hero emphasis — scales up labels, shows numeric tick values, and hides
   *  the in-bar reading pill (the composition renders the big numeral). */
  emphasis?: boolean;
  /** Real recent readings (oldest→newest). When present the fill animates
   *  THROUGH them — time-compressed and eased — landing exactly on
   *  currentHeight. Absent → the classic single spring fill-up. */
  series?: GaugeSeriesPoint[];
  /** First frame of the series-driven rise (default 15). */
  riseStartFrame?: number;
  /** Length of the series-driven rise in frames (default 90 = 3s @ 30fps). */
  riseDurationFrames?: number;
  /** Numeric ft labels on the scale ticks. Defaults to `emphasis`. */
  labeledTicks?: boolean;
}

/** Pre-crossing water color — the calm instrument teal from the brand scale. */
const WATER_TEAL = colors.primary[400]; // #4A9AAD

export interface GaugeFillState {
  /** Animated gauge value (ft) at this frame. */
  value: number;
  /** 0..1 progress of the fill animation. */
  progress: number;
  /** First frame at which the animated value reaches levelHigh, or null when
   *  it never does (or no levelHigh was given). */
  crossingFrame: number | null;
}

/**
 * The single fill model shared by the bar fill, the composition's big counting
 * numeral, and the threshold-crossing flash — so all three animate off
 * identical math.
 *
 * Series mode (≥3 valid points): the real readings are normalized by index
 * (dramatization: even pacing regardless of sampling gaps), time-compressed
 * into `riseDurationFrames`, eased with easeInOutCubic, and the FINAL sample
 * is replaced by `currentHeight` so the landing is pinned to the exact real
 * reading. Before the rise starts the level holds at the first sample (a
 * branded, non-empty first frame).
 *
 * Fallback mode (series absent/short): the original spring fill from 0 to
 * currentHeight — bit-for-bit the classic highlight behavior.
 */
export function gaugeFillModel(
  frame: number,
  fps: number,
  opts: {
    currentHeight: number;
    series?: GaugeSeriesPoint[];
    levelHigh?: number;
    riseStartFrame?: number;
    riseDurationFrames?: number;
    delay?: number;
  },
): GaugeFillState {
  const {
    currentHeight,
    series,
    levelHigh,
    riseStartFrame = 15,
    riseDurationFrames = 90,
    delay = 30,
  } = opts;

  const samples = (series ?? [])
    .filter((p) => p.gaugeHeightFt != null && Number.isFinite(p.gaugeHeightFt))
    .map((p) => p.gaugeHeightFt as number);

  const valueAt = (f: number): { value: number; progress: number } => {
    if (samples.length >= 3) {
      // Pin the landing to the exact real reading.
      const path = [...samples.slice(0, -1), currentHeight];
      const t = interpolate(f, [riseStartFrame, riseStartFrame + riseDurationFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      });
      const pos = t * (path.length - 1);
      const i = Math.min(path.length - 2, Math.floor(pos));
      const frac = pos - i;
      return { value: path[i] + (path[i + 1] - path[i]) * frac, progress: t };
    }
    // Classic spring fill (unchanged legacy behavior).
    const p = spring({ frame: f - delay, fps, config: SMOOTH });
    return { value: interpolate(p, [0, 1], [0, currentHeight]), progress: p };
  };

  const { value, progress } = valueAt(frame);

  // First frame at which the animated level reaches the high threshold. A
  // simple forward scan over the (short) animation window — pure and cheap.
  let crossingFrame: number | null = null;
  if (levelHigh != null) {
    const scanEnd = samples.length >= 3 ? riseStartFrame + riseDurationFrames : delay + 120;
    for (let f = 0; f <= scanEnd; f++) {
      if (valueAt(f).value >= levelHigh) {
        crossingFrame = f;
        break;
      }
    }
  }

  return { value, progress, crossingFrame };
}

/** Linear hex-color mix (t: 0 → a, 1 → b) for the threshold-cross flip. */
function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace("#", "");
  const pb = b.replace("#", "");
  const ch = (o: number) => {
    const va = parseInt(pa.slice(o, o + 2), 16);
    const vb = parseInt(pb.slice(o, o + 2), 16);
    return Math.round(va + (vb - va) * Math.min(1, Math.max(0, t)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

/** #rrggbb + alpha → rgba() string (for the translucent zone scale). */
function hexA(hex: string, a: number): string {
  const p = hex.replace("#", "");
  const r = parseInt(p.slice(0, 2), 16);
  const g = parseInt(p.slice(2, 4), 16);
  const b = parseInt(p.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Canonical condition hues for the labeled zone scale — the SAME learnable
 *  colors used across the app (see shared/condition-system.ts): low=yellow,
 *  good=green, high=orange, flood=red. */
const ZONE_COLORS = {
  low: "#eab308",
  good: "#10b981",
  high: "#f97316",
  flood: "#ef4444",
} as const;

export interface GaugeZone {
  from: number;
  to: number;
  color: string;
  label: string;
}

/**
 * Build the fixed, labeled semantic scale for the instrument (emphasis) bar
 * from whatever ft thresholds exist, covering [0, maxHeight] with no gaps:
 *   LOW  [0, optimalMin)         yellow
 *   GOOD [optimalMin, highBottom) green   (highBottom = levelHigh ?? optimalMax)
 *   HIGH [highBottom, dangerous)  orange
 *   FLOOD[dangerous, maxHeight]   red
 * Missing thresholds collapse their zone gracefully (a CFS-only gauge with no ft
 * bounds yields a single unlabeled scale rather than a fabricated band).
 */
export function buildGaugeZones(opts: {
  maxHeight: number;
  optimalMin?: number;
  optimalMax?: number;
  levelHigh?: number;
  levelDangerous?: number;
}): GaugeZone[] {
  const { maxHeight, optimalMin, optimalMax, levelHigh, levelDangerous } = opts;
  const zones: GaugeZone[] = [];
  let cursor = 0;
  const add = (top: number | undefined, color: string, label: string) => {
    if (top == null) return;
    const t = Math.min(top, maxHeight);
    if (t > cursor + 0.02) {
      zones.push({ from: cursor, to: t, color, label });
      cursor = t;
    }
  };
  const highBottom = levelHigh ?? optimalMax;
  // No trustworthy ft thresholds at all → no scale. Return empty so the caller
  // renders an honest LEVEL-ONLY instrument rather than inventing a full-bar
  // "HIGH" zone (which would mislabel every reading as high water). This is the
  // case for CFS-primary gauges whose ft mirror is absent/discredited.
  if (optimalMin == null && highBottom == null && levelDangerous == null) return [];
  add(optimalMin, ZONE_COLORS.low, "LOW");
  add(highBottom, ZONE_COLORS.good, "GOOD");
  if (levelDangerous != null) {
    add(levelDangerous, ZONE_COLORS.high, "HIGH");
    add(maxHeight, ZONE_COLORS.flood, "FLOOD");
  } else {
    add(maxHeight, ZONE_COLORS.high, "HIGH");
  }
  return zones;
}

/**
 * Animated vertical gauge — the "field instrument". Solid panel with a hard
 * shadow (no glassmorphism/glow), a numeric ft scale, a labeled GOOD band, a
 * dashed high-water threshold that flashes when the rising fill crosses it,
 * and a fill that starts water-teal and flips to the condition color at the
 * crossing. With `series` the fill replays the real last-24h readings.
 */
export const GaugeBar: React.FC<GaugeBarProps> = ({
  currentHeight,
  optimalMin,
  optimalMax,
  levelHigh,
  levelDangerous,
  maxHeight: maxHeightProp,
  conditionColor,
  delay = 30,
  width = 85,
  height = 420,
  emphasis = false,
  series,
  riseStartFrame = 15,
  riseDurationFrames = 90,
  labeledTicks,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const showTickLabels = labeledTicks ?? emphasis;

  // Include the dangerous threshold in the scale so its zone is always visible,
  // even when the current reading sits below it. A series can peak above the
  // current reading — keep the peak on-scale too.
  const seriesPeak = Math.max(
    0,
    ...(series ?? []).map((p) => (p.gaugeHeightFt != null ? p.gaugeHeightFt : 0)),
  );
  const maxHeight =
    maxHeightProp ??
    Math.max(currentHeight * 1.3, seriesPeak * 1.15, (optimalMax ?? 0) * 1.2, (levelDangerous ?? 0) * 1.08, 5);

  const highFraction = levelHigh != null ? Math.min(1, levelHigh / maxHeight) : null;
  const dangerFraction =
    levelDangerous != null ? Math.min(1, levelDangerous / maxHeight) : null;

  // GOOD band: only when real bounds exist, and never extending above the
  // high-water threshold — water can't be both "good" and "high", and an
  // unclamped band once showed a HIGH WATER reading inside the green zone.
  const bandTopFt =
    optimalMax != null ? (levelHigh != null ? Math.min(optimalMax, levelHigh) : optimalMax) : null;
  const hasBand = optimalMin != null && bandTopFt != null && bandTopFt > optimalMin;

  const fill = gaugeFillModel(frame, fps, {
    currentHeight,
    series,
    levelHigh,
    riseStartFrame,
    riseDurationFrames,
    delay,
  });

  const fillFraction = Math.min(1, Math.max(0, fill.value / maxHeight));
  const optMinFraction = hasBand ? optimalMin! / maxHeight : 0;
  const optMaxFraction = hasBand ? bandTopFt! / maxHeight : 0;

  // Water color: teal until the level crosses the high threshold, then a
  // 10-frame crossfade into the condition color. No threshold → condition
  // color throughout (legacy look).
  const crossT =
    fill.crossingFrame == null
      ? levelHigh != null
        ? 0
        : 1
      : interpolate(frame, [fill.crossingFrame, fill.crossingFrame + 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const waterColor = mixHex(WATER_TEAL, conditionColor, crossT);

  // Threshold flash: 12 frames of white→orange pop as the level crosses.
  const flashT =
    fill.crossingFrame == null
      ? 1
      : interpolate(frame, [fill.crossingFrame, fill.crossingFrame + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const thresholdColor = fill.crossingFrame == null ? "rgba(253,186,116,0.9)" : mixHex("#FFFFFF", "#FDBA74", flashT);
  const thresholdScale = fill.crossingFrame == null ? 1 : 1 + 0.15 * Math.sin(Math.min(1, flashT) * Math.PI);

  // Numeric scale ticks in whole feet, stepped so ~3-6 labels fit.
  const tickStep = maxHeight > 12 ? 4 : maxHeight > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let ft = tickStep; ft < maxHeight; ft += tickStep) ticks.push(ft);

  // Emphasis ("field instrument") mode renders a fixed, LABELED color scale
  // instead of the compact bar's single recoloring fill + overlaid GOOD band —
  // the combination that muddied into olive and put "GOOD" inside high water.
  const zones = emphasis
    ? buildGaugeZones({ maxHeight, optimalMin, optimalMax, levelHigh, levelDangerous })
    : [];

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: "rgba(15,45,53,0.92)",
        border: "3px solid rgba(255,255,255,0.14)",
        boxShadow: "10px 10px 0 rgba(0,0,0,0.45)",
      }}
    >
      {/* Numeric scale ticks — above the water fill (zIndex) so the scale
          stays readable as the level rises past it */}
      {ticks.map((ft) => (
        <div
          key={ft}
          style={{
            position: "absolute",
            bottom: `${(ft / maxHeight) * 100}%`,
            left: 0,
            right: 0,
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: showTickLabels ? 14 : 10,
              height: 2,
              backgroundColor: "rgba(255,255,255,0.35)",
            }}
          />
          {showTickLabels && (
            <div
              style={{
                position: "absolute",
                left: 18,
                top: "50%",
                transform: "translateY(-50%)",
                fontFamily: "'Geist Mono', monospace",
                fontSize: emphasis ? 20 : 14,
                color: "rgba(255,255,255,0.6)",
                letterSpacing: 0.5,
                whiteSpace: "nowrap",
                textShadow: "0 1px 3px rgba(0,0,0,0.7)",
              }}
            >
              {ft} ft
            </div>
          )}
        </div>
      ))}

      {/* ── Instrument (emphasis) scale ─────────────────────────────
          A fixed, LABELED color scale — low/good/high/flood in the canonical
          condition hues — replaces the compact bar's recoloring fill + overlaid
          green band. The live level is shown by keeping the reached scale bright
          and dimming the rest (not by tinting the water), so the colors never
          mix into mud and the reading always lands in a clearly-labeled zone. */}
      {emphasis &&
        zones.map((z, i) => {
          const bottomPct = (z.from / maxHeight) * 100;
          const heightPct = ((z.to - z.from) / maxHeight) * 100;
          return (
            <div
              key={`${z.label}-${i}`}
              style={{
                position: "absolute",
                bottom: `${bottomPct}%`,
                height: `${heightPct}%`,
                left: 0,
                right: 0,
                backgroundColor: hexA(z.color, 0.55),
                // Divider between zones (skip the topmost one — it meets the frame).
                borderTop: i === zones.length - 1 ? undefined : "1px solid rgba(255,255,255,0.18)",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "flex-end",
                zIndex: 1,
              }}
            >
              {/* Zone label sits at the BOTTOM of its band, so labels of the
                  zones the water has passed through stay bright (below the dim
                  scrim) and never collide with a mid-zone reading marker. */}
              {heightPct > 5 && (
                <span
                  style={{
                    fontFamily: "'Geist Sans', system-ui, sans-serif",
                    fontSize: 15,
                    fontWeight: 800,
                    letterSpacing: 2,
                    color: z.color,
                    padding: "0 10px 6px 0",
                    textShadow: "0 1px 4px rgba(0,0,0,0.95)",
                  }}
                >
                  {z.label}
                </span>
              )}
            </div>
          );
        })}

      {/* Level indicator — dim the not-yet-reached part of the scale so the
          reached level reads bright. The bright/dim boundary IS the waterline.
          Only with a real zone scale; level-only uses the neutral fill below. */}
      {emphasis && zones.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: `${fillFraction * 100}%`,
            height: `${(1 - fillFraction) * 100}%`,
            left: 0,
            right: 0,
            backgroundColor: "rgba(8,26,31,0.62)",
            zIndex: 1,
          }}
        />
      )}

      {/* Level-only fill — no trustworthy ft thresholds (e.g. CFS-primary
          gauges): show the water level with a neutral condition-colored fill and
          NO semantic zones, so the instrument never implies a low/good/high
          reading it can't back. The banner + big numeral still carry the
          condition; the bar just reports "here's the level". */}
      {emphasis && zones.length === 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            height: `${fillFraction * 100}%`,
            left: 0,
            right: 0,
            background: `linear-gradient(to top, ${waterColor}, ${waterColor}aa)`,
            zIndex: 1,
          }}
        />
      )}

      {/* Subtle surface sheen just under the waterline (a hint of "wet"). */}
      {emphasis && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            height: `${fillFraction * 100}%`,
            left: 0,
            right: 0,
            background: "linear-gradient(to top, rgba(255,255,255,0.07), rgba(255,255,255,0) 45%)",
            zIndex: 1,
          }}
        />
      )}

      {/* Reading marker — ONE bright waterline + a value pill pinned to the
          level, condition-colored (teal until it crosses HIGH, then the alarm
          hue). This is the single "you are here" pointer. */}
      {emphasis && (
        <>
          <div
            style={{
              position: "absolute",
              bottom: `${fillFraction * 100}%`,
              left: 0,
              right: 0,
              height: 5,
              backgroundColor: waterColor,
              boxShadow: `0 0 16px ${waterColor}`,
              transform: "translateY(2.5px)",
              opacity: fill.progress,
              zIndex: 5,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: `${fillFraction * 100}%`,
              right: 6,
              transform: "translateY(50%)",
              backgroundColor: waterColor,
              color: "#fff",
              padding: "4px 11px",
              borderRadius: 8,
              border: "2px solid rgba(255,255,255,0.35)",
              fontFamily: "'Geist Mono', monospace",
              fontSize: 17,
              fontWeight: 700,
              whiteSpace: "nowrap",
              opacity: fill.progress,
              boxShadow: "3px 3px 0 rgba(0,0,0,0.35)",
              zIndex: 5,
            }}
          >
            {fill.value.toFixed(1)} ft
          </div>
        </>
      )}

      {/* GOOD range band — green-tinted with its own label; above the fill so
          the safe zone stays marked even when the level submerges it. The tint
          is strong enough to read over the saturated water fill (at 0.18 it
          visually vanished underwater, so the band appeared to shrink as the
          level rose). Compact bar only — emphasis uses the labeled scale above. */}
      {hasBand && !emphasis && (
        <div
          style={{
            position: "absolute",
            bottom: `${optMinFraction * 100}%`,
            height: `${(optMaxFraction - optMinFraction) * 100}%`,
            width: "100%",
            backgroundColor: "rgba(78,184,107,0.30)",
            borderTop: "2px dashed rgba(149,217,167,0.8)",
            borderBottom: "2px dashed rgba(149,217,167,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            zIndex: 2,
          }}
        >
          {/* Text label only at instrument (emphasis) sizes — on the compact
              bar it collides with the waterline reading pill. */}
          {emphasis && (
            <span
              style={{
                fontFamily: "'Geist Sans', system-ui, sans-serif",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: 2,
                color: "rgba(198,240,210,0.95)",
                paddingRight: 10,
                textShadow: "0 1px 4px rgba(0,0,0,0.9)",
              }}
            >
              GOOD
            </span>
          )}
        </div>
      )}

      {/* Animated water fill — teal until the high-threshold crossing.
          Compact bar only; the emphasis instrument shows level via the
          bright/dim scale split + marker above. */}
      {!emphasis && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            width: "100%",
            height: `${fillFraction * 100}%`,
            background: `linear-gradient(to top, ${waterColor}, ${waterColor}aa)`,
            borderRadius: "0 0 16px 16px",
          }}
        >
          {/* Waterline highlight */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              backgroundColor: "rgba(255,255,255,0.55)",
            }}
          />
        </div>
      )}

      {/* Dangerous / flood zone (red tint from the flood threshold to the top).
          Compact bar only — emphasis renders a labeled FLOOD zone in the scale. */}
      {dangerFraction != null && !emphasis && (
        <div
          style={{
            position: "absolute",
            bottom: `${dangerFraction * 100}%`,
            height: `${(1 - dangerFraction) * 100}%`,
            width: "100%",
            backgroundColor: "rgba(239,68,68,0.22)",
            borderTop: "2px solid rgba(239,68,68,0.95)",
            zIndex: 2,
          }}
        />
      )}

      {/* High-water threshold — dashed line that flashes at the crossing.
          Compact bar only; in the emphasis scale the GOOD→HIGH color change
          already marks this line. */}
      {highFraction != null && !emphasis && (
        <div
          style={{
            position: "absolute",
            bottom: `${highFraction * 100}%`,
            left: 0,
            right: 0,
            borderTop: `3px dashed ${thresholdColor}`,
            transform: `scaleY(${thresholdScale})`,
            zIndex: 3,
          }}
        />
      )}

      {/* Threshold labels (inside, right-aligned — parent clips overflow).
          Compact bar only — the emphasis instrument labels its zones directly. */}
      {highFraction != null && !emphasis && (
        <ThresholdLabel
          fraction={highFraction}
          text="high"
          color={thresholdColor}
        />
      )}
      {dangerFraction != null && !emphasis && (
        <ThresholdLabel
          fraction={dangerFraction}
          text="flood"
          color="rgba(239,68,68,0.95)"
        />
      )}

      {/* Current reading pill — hidden in emphasis mode (the composition
          renders the big counting numeral instead) */}
      {!emphasis && (
        <div
          style={{
            position: "absolute",
            bottom: `${fillFraction * 100}%`,
            left: "50%",
            transform: "translate(-50%, 50%)",
            backgroundColor: waterColor,
            color: "#fff",
            padding: "6px 12px",
            borderRadius: 10,
            border: "2px solid rgba(255,255,255,0.25)",
            fontFamily: "'Geist Mono', monospace",
            fontSize: 18,
            fontWeight: 700,
            whiteSpace: "nowrap",
            opacity: fill.progress,
            boxShadow: "4px 4px 0 rgba(0,0,0,0.35)",
          }}
        >
          {fill.value.toFixed(1)} ft
        </div>
      )}
    </div>
  );
};

/** Small label pinned to a threshold fraction, INSIDE the bar (the parent clips
 *  overflow, so an outside-right callout would be hidden) and right-aligned with
 *  a shadow so it stays legible over the animated fill. */
const ThresholdLabel: React.FC<{
  fraction: number;
  text: string;
  color: string;
  emphasis?: boolean;
  mono?: boolean;
}> = ({ fraction, text, color, emphasis = false, mono = false }) => (
  <div
    style={{
      position: "absolute",
      right: emphasis ? 10 : 6,
      bottom: `${fraction * 100}%`,
      transform: "translateY(-4px)",
      color,
      fontSize: emphasis ? 18 : 11,
      fontWeight: 700,
      fontFamily: mono ? "'Geist Mono', monospace" : "'Geist Sans', system-ui, sans-serif",
      whiteSpace: "nowrap",
      letterSpacing: 0.5,
      textShadow: "0 1px 3px rgba(0,0,0,0.8)",
    }}
  >
    {text}
  </div>
);
