'use client';

// Animated flow layer — soft light "wisps" riding the curated rivers' real
// geometry downstream, at a speed set by each river's condition. One canvas,
// one rAF loop, zero React re-renders per frame.
//
// Design: the condition COLOR lives on the SVG band underneath; this layer's
// only job is MOTION. Each wisp is a translucent, faintly-cool white streak
// that FOLLOWS the channel's curve — sampled along the real polyline, never a
// straight chord across a meander — and tapers from a soft leading glint back
// to nothing, like light catching moving water. Neutral white reads cleanly
// over every condition color; the old version tinted each particle its
// reach's own color and drew it as a straight dash over a band of that same
// color, which is exactly why it looked like scratchy, low-contrast noise.
//
// Perf budget (docs/mo-surface-water-observatory.md): ≤240 wisps on desktop,
// ≤110 on small/low-end devices; dt clamped; paused when the tab is hidden,
// the layer is toggled off, or reduced motion is set. Self-degrading: if the
// rolling frame time stays over ~24 ms, the count halves (floor 120) before
// the map ever gets janky.

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

// Trail sampled as this many short segments along the real river polyline —
// enough to bend cleanly through a meander without over-drawing.
const TRAIL_SEGMENTS = 6;
// Wisp tone: a faint, barely-cool white that reads as a glint of light on the
// colored water regardless of the condition color underneath. Motion only —
// the band carries the color.
const WISP_BODY = '240,248,251'; // faint full-length streak
const WISP_HEAD = '248,252,254'; // brighter leading glint

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

    // ── Seed particles (deterministic LCG — stable across re-inits) ──
    const totalLen = runtimes.reduce((s, r) => s + r.total, 0);
    const particleBudget = maxParticles;
    let seed = 1234567;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let particles: Particle[] = [];
    runtimes.forEach((r, idx) => {
      const n = Math.max(6, Math.round((r.total / totalLen) * particleBudget));
      for (let i = 0; i < n; i++) {
        particles.push({ river: idx, s: rand() * r.total, jitter: 0.85 + rand() * 0.3 });
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

        // Trail streaks upstream, sampled along the ACTUAL polyline in short
        // steps so the wisp bends with the channel instead of chording across
        // a meander. Length grows gently with speed — flood water streaks
        // longer. Clamped at the headwater, never wrapped (a wrapped tail
        // would draw a chord clean across the map from mouth to source).
        const tailLen = Math.min(18, 5 + r.speed * 0.5);

        // Body: one faint soft-white stroke through every sample point, so it
        // reads as a single curved wisp rather than a stack of segments.
        let x0 = 0;
        let y0 = 0;
        let x1 = 0;
        let y1 = 0;
        ctx.strokeStyle = `rgba(${WISP_BODY},0.13)`;
        ctx.lineWidth = Math.max(1, 1.25 * dpr);
        ctx.beginPath();
        for (let k = 0; k <= TRAIL_SEGMENTS; k++) {
          const sk = Math.max(0.01, p.s - (tailLen * k) / TRAIL_SEGMENTS);
          const q = pointAt(r, sk);
          const cx = q[0] * s + ox;
          const cy = q[1] * s + oy;
          if (k === 0) {
            ctx.moveTo(cx, cy);
            x0 = cx;
            y0 = cy;
          } else {
            ctx.lineTo(cx, cy);
            if (k === 1) {
              x1 = cx;
              y1 = cy;
            }
          }
        }
        ctx.stroke();

        // Leading glint: the head-most segment, brighter and a touch wider —
        // light catching the front of the moving water. No dot, no speckle.
        ctx.strokeStyle = `rgba(${WISP_HEAD},0.44)`;
        ctx.lineWidth = Math.max(1, 1.7 * dpr);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
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
