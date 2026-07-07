'use client';

// Animated flow layer — comet particles riding the curated rivers'
// real geometry, downstream, at a speed set by each river's condition.
// The nullschool/Windy technique, minus the tile dependency: one canvas,
// one rAF loop, zero React re-renders per frame.
//
// Perf budget (docs/mo-surface-water-observatory.md): ≤700 particles on
// desktop, ≤300 on small/low-end devices; dt clamped; paused when the
// tab is hidden, the layer is toggled off, or reduced motion is set.
// Self-degrading: if the rolling frame time stays over ~24 ms, the
// particle count halves (floor 120) before the map ever gets janky.

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
  /** Gradient axis + stops (matches the SVG linearGradient painting). */
  axis: { x1: number; y1: number; x2: number; y2: number } | null;
  stops: Array<{ offset: number; color: string }>;
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
  /** 24-bucket color LUT along the reach (head colors, pre-stringified). */
  lut: string[];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

export default function FlowLayer({
  rivers,
  viewRef,
  enabled,
  maxParticles,
  style,
}: {
  rivers: FlowRiver[];
  /** Live view state owned by MOMap — read per frame, never re-rendered. */
  viewRef: RefObject<ViewBox>;
  enabled: boolean;
  maxParticles: number;
  /** Optional canvas styling (MOMap fades the layer up with the rivers). */
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled || rivers.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── Build runtimes ──
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
        // Color LUT along the gradient axis — matches the SVG paint.
        const stops = r.stops.length
          ? r.stops.map((s) => ({ offset: s.offset, rgb: hexToRgb(s.color) }))
          : [{ offset: 0, rgb: [163, 209, 219] as [number, number, number] }];
        const axis = r.axis;
        const lut: string[] = [];
        for (let b = 0; b < 24; b++) {
          // Point at fraction f along the LINE; project onto gradient axis.
          const f = b / 23;
          let t = f;
          if (axis) {
            const target = f * total;
            let idx = 1;
            while (idx < cum.length - 1 && cum[idx] < target) idx++;
            const p = r.pts[idx];
            const dx = axis.x2 - axis.x1;
            const dy = axis.y2 - axis.y1;
            const lenSq = dx * dx + dy * dy || 1;
            t = Math.max(0, Math.min(1, ((p[0] - axis.x1) * dx + (p[1] - axis.y1) * dy) / lenSq));
          }
          let lo = stops[0];
          let hi = stops[stops.length - 1];
          for (let i = 0; i < stops.length - 1; i++) {
            if (t >= stops[i].offset && t <= stops[i + 1].offset) {
              lo = stops[i];
              hi = stops[i + 1];
              break;
            }
          }
          const span = hi.offset - lo.offset || 1;
          const k = Math.max(0, Math.min(1, (t - lo.offset) / span));
          const rgb = [0, 1, 2].map((c) => Math.round(lo.rgb[c] + (hi.rgb[c] - lo.rgb[c]) * k));
          lut.push(`${rgb[0]},${rgb[1]},${rgb[2]}`);
        }
        return { pts: r.pts, cum, total, speed: speedFor(r.verdict, r.percentile), lut };
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
    // Rolling degradation check. The small-budget tier is already on
    // constrained hardware, so it gets half the reaction window — ~0.75s
    // of slow frames instead of ~1.5s before the particle count halves.
    const SLOW_FRAME_LIMIT = maxParticles <= 300 ? 30 : 60;
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
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      for (const p of particles) {
        const r = runtimes[p.river];
        p.s += r.speed * p.jitter * dt;
        if (p.s >= r.total) p.s -= r.total;
        const [x, y] = pointAt(r, p.s);
        // Comet tail points upstream. CLAMPED at the headwater, never
        // wrapped — a wrapped tail draws a chord clean across the map
        // from the river's mouth back to its source.
        const tailLen = Math.min(14, 2.5 + r.speed * 0.45);
        const [tx, ty] = pointAt(r, Math.max(0.01, p.s - tailLen));
        const color = r.lut[Math.min(23, Math.floor((p.s / r.total) * 24))];

        const hx = x * s + ox;
        const hy = y * s + oy;
        ctx.strokeStyle = `rgba(${color},0.28)`;
        ctx.lineWidth = Math.max(1, 1.4 * dpr);
        ctx.beginPath();
        ctx.moveTo(tx * s + ox, ty * s + oy);
        ctx.lineTo(hx, hy);
        ctx.stroke();

        ctx.fillStyle = `rgba(255,255,255,0.55)`;
        ctx.beginPath();
        ctx.arc(hx, hy, Math.max(0.8, 0.9 * dpr), 0, Math.PI * 2);
        ctx.fill();
      }

      if (!firstFrameLogged) {
        firstFrameLogged = true;
        console.info(`[mosw-flow] first-frame ${Math.round(performance.now())}ms`);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [rivers, enabled, maxParticles, viewRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={style}
    />
  );
}
