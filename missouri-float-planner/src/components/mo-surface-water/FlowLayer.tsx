'use client';

// Animated flow layer — soft light "sweeps" gliding down the curated rivers'
// real geometry, at a speed set by each river's condition. One canvas, one
// rAF loop, zero React re-renders per frame.
//
// Design: the condition COLOR lives on the SVG band underneath; this layer's
// only job is MOTION. Each sweep is a stretch of the real polyline drawn as a
// soft near-white glow — brightest at its center, fading to nothing at both
// ends — that travels downstream, like light running along moving water. It
// FOLLOWS the channel's curve (sampled along the polyline, never a straight
// chord across a meander) and stays neutral white so it reads cleanly over
// every condition color instead of competing with it. Sweeps are spaced
// evenly along each reach, so long and short rivers pulse at a similar cadence.
//
// Cheap by construction: a handful of sweeps per river, not hundreds of
// particles. dt clamped; paused when the tab is hidden, the layer is toggled
// off, or reduced motion is set; self-degrades if frame time creeps up.

import { useEffect, useRef, type RefObject } from 'react';
import type { StageVerdict } from '@/lib/usgs/mo-statewide-data';

export interface FlowRiver {
  id: string;
  /** Projected polyline in viewBox units. */
  pts: Array<[number, number]>;
  /** Overall verdict — sets the reach's base particle speed. */
  verdict: StageVerdict;
  /**
   * USGS flow-statistics percentile (0–100) at the river's primary gauge,
   * or null when no stats are available. Modulates speed continuously
   * within the verdict's band — percentile, never raw CFS, because CFS
   * isn't comparable across rivers.
   */
  percentile: number | null;
}

interface ViewBox { x: number; y: number; w: number; h: number }

/** Viewbox-units per second, by condition — same story the dash overlay
 *  used to tell: barely-moving when bony, sprinting at flood. */
const SPEED: Record<StageVerdict, number> = {
  too_low: 1.6,
  low: 3.2,
  good: 6.5,
  flowing: 10,
  high: 17,
  dangerous: 26,
  unknown: 4,
};

/**
 * Continuous speed within a condition band: the flow percentile sweeps a
 * ±20% envelope around the verdict's base speed (P0 → 0.8×, P100 → 1.2×).
 * ±20% is the widest symmetric band that keeps adjacent conditions strictly
 * ordered (good×1.2 = 7.8 < flowing×0.8 = 8.0, high×1.2 = 20.4 <
 * dangerous×0.8 = 20.8), so the 7-level taxonomy still reads at a glance.
 * No percentile → base speed, exactly the old step behavior.
 */
function speedFor(verdict: StageVerdict, percentile: number | null): number {
  const base = SPEED[verdict] ?? SPEED.unknown;
  if (percentile == null || Number.isNaN(percentile)) return base;
  const p = Math.max(0, Math.min(100, percentile));
  return base * (0.8 + 0.4 * (p / 100));
}

// A light "sweep" is a glow that travels down a river's centerline: a stretch
// of the real polyline, SWEEP_LEN long, drawn brightest at its center and
// fading to nothing at both ends, advancing at the reach's flow speed. Sweeps
// sit SWEEP_SPACING apart (capped per river) so the cadence reads the same on
// a 200-mile river and a 20-mile creek. SWEEP_STEPS is how many short segments
// each sweep is sampled into — enough to trace a meander smoothly. The tone is
// a neutral near-white so the pulse reads as light on the water without
// competing with the condition color the band already carries.
const SWEEP_LEN = 46;
const SWEEP_SPACING = 95;
const SWEEP_MAX = 6;
const SWEEP_STEPS = 12;
const SWEEP_PEAK = 0.5;
const SWEEP_COLOR = '248,252,254';

interface Particle {
  river: number;
  s: number;       // distance along polyline (viewBox units)
  jitter: number;  // 0.85–1.15 speed variance so streams don't march in lockstep
}

// One log line per page load marking when the first particle frame drew —
// the "rivers are visibly moving" moment scripts/mosw-smoke.ts asserts on.
let firstFrameLogged = false;

interface RiverRuntime {
  pts: Array<[number, number]>;
  cum: Float64Array;  // cumulative segment lengths
  total: number;
  speed: number;
}

export default function FlowLayer({
  rivers,
  viewRef,
  enabled,
  maxParticles,
  pauseRef,
  style,
}: {
  rivers: FlowRiver[];
  /** Live view state owned by MOMap — read per frame, never re-rendered. */
  viewRef: RefObject<ViewBox>;
  enabled: boolean;
  maxParticles: number;
  /**
   * When set true, the rAF loop keeps ticking but skips the canvas redraw.
   * MOMap flips this during an active pan/pinch so the particle repaint
   * doesn't pile onto the imperative viewBox mutation and stall the frame.
   * A ref (not a prop toggle) so starting a gesture never re-inits the loop.
   */
  pauseRef?: RefObject<boolean>;
  /** Optional canvas styling (MOMap fades the layer up with the rivers). */
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled || rivers.length === 0) return;
    // MOMap already unmounts this layer under reduced motion, but its
    // media-query hook initializes false and flips in an effect — this
    // synchronous check closes the one-frame race where particles could
    // draw before that state propagates.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── Build runtimes (geometry + speed only; color lives on the band) ──
    const runtimes: RiverRuntime[] = rivers
      .filter((r) => r.pts.length >= 2)
      .map((r) => {
        const cum = new Float64Array(r.pts.length);
        let total = 0;
        for (let i = 1; i < r.pts.length; i++) {
          const dx = r.pts[i][0] - r.pts[i - 1][0];
          const dy = r.pts[i][1] - r.pts[i - 1][1];
          total += Math.hypot(dx, dy);
          cum[i] = total;
        }
        return { pts: r.pts, cum, total, speed: speedFor(r.verdict, r.percentile) };
      });
    if (!runtimes.length) return;

    // ── Seed light sweeps: evenly spaced along each reach so they travel as
    //    regular pulses, not a random field. Count scales with length. ──
    let particles: Particle[] = [];
    runtimes.forEach((r, idx) => {
      const n = Math.max(1, Math.min(SWEEP_MAX, Math.round(r.total / SWEEP_SPACING)));
      for (let i = 0; i < n; i++) {
        particles.push({ river: idx, s: (i / n) * r.total, jitter: 1 });
      }
    });

    // ── Canvas sizing ──
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Frame loop ──
    let raf = 0;
    let last = performance.now();
    let running = true;
    let clearedForPause = false;
    // Rolling degradation check. The small-budget tier is already on
    // constrained hardware, so it gets half the reaction window — ~0.75s
    // of slow frames instead of ~1.5s before the particle count halves.
    const SLOW_FRAME_LIMIT = maxParticles <= 150 ? 30 : 60;
    let slowFrames = 0;

    const pointAt = (r: RiverRuntime, s: number): [number, number, number] => {
      // binary search cum for s
      let lo = 1;
      let hi = r.cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (r.cum[mid] < s) lo = mid + 1;
        else hi = mid;
      }
      const i = lo;
      const seg = r.cum[i] - r.cum[i - 1] || 1;
      const k = (s - r.cum[i - 1]) / seg;
      const x = r.pts[i - 1][0] + (r.pts[i][0] - r.pts[i - 1][0]) * k;
      const y = r.pts[i - 1][1] + (r.pts[i][1] - r.pts[i - 1][1]) * k;
      return [x, y, i];
    };

    const tick = (now: number) => {
      if (!running) return;
      // Frozen mid-gesture: during an active pan/pinch the map is rewriting
      // its viewBox and re-deriving marker transforms every frame; layering a
      // few hundred particle redraws on top is what tips a mid-tier phone
      // under 30fps. Keep the loop alive but skip the canvas work, and hold
      // `last` so the current doesn't lurch forward when the gesture ends.
      // Clear once on entry: the SVG rivers pan under a static canvas, so a
      // retained frame would leave particles stranded off their channels —
      // cleaner to drop them for the gesture and fade them back on release.
      if (pauseRef?.current) {
        if (!clearedForPause) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          clearedForPause = true;
        }
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }
      clearedForPause = false;
      const dtMs = now - last;
      last = now;
      const dt = Math.min(0.05, dtMs / 1000); // clamp: background tabs, GC pauses

      // Self-degrade long before jank becomes visible.
      if (dtMs > 24) {
        if (++slowFrames >= SLOW_FRAME_LIMIT && particles.length > 120) {
          particles = particles.filter((_, i) => i % 2 === 0);
          slowFrames = 0;
          console.info(`[mosw-flow] degraded to ${particles.length} particles`);
        }
      } else if (slowFrames > 0) {
        slowFrames--;
      }

      const view = viewRef.current;
      const cw = canvas.width;
      const ch = canvas.height;
      if (!view || !cw) { raf = requestAnimationFrame(tick); return; }

      // viewBox → canvas transform (preserveAspectRatio="xMidYMid meet")
      const s = Math.min(cw / view.w, ch / view.h);
      const ox = (cw - view.w * s) / 2 - view.x * s;
      const oy = (ch - view.h * s) / 2 - view.y * s;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      // Normal compositing — this paints over a LIGHT parchment landmass,
      // where additive ('lighter') would just wash everything toward white.
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const p of particles) {
        const r = runtimes[p.river];
        p.s += r.speed * p.jitter * dt;
        if (p.s >= r.total) p.s -= r.total;

        // Draw the sweep as a run of short segments along the ACTUAL polyline
        // (so the glow follows the channel), with a cos² bell on both alpha
        // and width — brightest at the center, fading to nothing at both ends.
        // Sampling is clamped to the reach so a sweep near an end fades out
        // instead of wrapping a chord across the map from mouth to source.
        const half = SWEEP_LEN / 2;
        let px = 0;
        let py = 0;
        for (let k = 0; k <= SWEEP_STEPS; k++) {
          const sk = p.s - half + (SWEEP_LEN * k) / SWEEP_STEPS;
          const q = pointAt(r, Math.max(0.01, Math.min(r.total - 0.01, sk)));
          const cx = q[0] * s + ox;
          const cy = q[1] * s + oy;
          if (k > 0) {
            const center = (k - 0.5) / SWEEP_STEPS;           // 0..1 along sweep
            const bell = Math.cos((center - 0.5) * Math.PI);  // 1 mid → 0 ends
            const a = SWEEP_PEAK * bell * bell;
            if (a > 0.02) {
              ctx.strokeStyle = `rgba(${SWEEP_COLOR},${a.toFixed(3)})`;
              ctx.lineWidth = Math.max(1, (1.3 + 1.4 * bell) * dpr);
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(cx, cy);
              ctx.stroke();
            }
          }
          px = cx;
          py = cy;
        }
      }

      if (!firstFrameLogged) {
        firstFrameLogged = true;
        console.info(`[mosw-flow] first-frame ${Math.round(performance.now())}ms`);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Test hook: the smoke suite asserts the loop pauses under an expanded
    // sheet and resumes on collapse.
    (window as Window & { __moswFlowRunning?: boolean }).__moswFlowRunning = true;

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
        (window as Window & { __moswFlowRunning?: boolean }).__moswFlowRunning = false;
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
        (window as Window & { __moswFlowRunning?: boolean }).__moswFlowRunning = true;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      (window as Window & { __moswFlowRunning?: boolean }).__moswFlowRunning = false;
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [rivers, enabled, maxParticles, viewRef, pauseRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={style}
    />
  );
}
