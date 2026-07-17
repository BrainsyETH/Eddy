'use client';

// src/components/map/FlowParticlesLayer.tsx
// The Observatory's animated flow field (mo-surface-water/FlowLayer),
// ported to the MapLibre planner map: a downstream particle field drawn
// with a FADING ACCUMULATION BUFFER — every frame stamps only each
// particle's new head and fades the previous frame slightly toward
// transparent, so the trail of recent heads decays into a smooth streak.
// That's what turns moving dots into flowing water.
//
// The MapLibre twist: the Observatory animates in a fixed SVG viewBox and
// transforms per frame; here the camera owns the projection, so river
// polylines are re-projected to screen pixels ON CAMERA SETTLE (moveend)
// and the loop animates in that frozen screen space. During a pan/pinch
// the canvas hard-clears and the loop idles — layering particle repaints
// onto an active gesture is what tips mid-tier phones under 30fps — and
// trails rebuild in a few still frames after release (same pause
// discipline as the Observatory's pauseRef).
//
// Speed encodes condition (barely moving when bony, sprinting at flood),
// modulated ±20% by the primary gauge's flow percentile, and scaled by
// zoom so the current reads "closer" rather than "slower" as you zoom in.
// The marks are a soft near-white that reads over every condition color
// on both the Natural style and satellite imagery. Motion only — the
// condition COLOR lives on the network/river line layers underneath.
//
// Perf budget mirrors the Observatory: ≤420 particles on fine-pointer
// devices, ≤200 on coarse; budget is spent only on rivers intersecting
// the viewport; the loop self-degrades under sustained slow frames and
// pauses when the tab hides. Reduced motion renders nothing.

import { useEffect } from 'react';
import { useMap } from './MapContainer';
import { useConditionNetwork } from '@/hooks/useStatewideConditions';
import type { ConditionCode } from '@shared/condition-system';

/** Base speed by condition, in screen px/s at REF_ZOOM (same ordering
 *  story as the Observatory's viewBox-units table). */
const SPEED: Record<ConditionCode, number> = {
  too_low: 1.6,
  low: 3.2,
  good: 6.5,
  flowing: 10,
  high: 17,
  dangerous: 26,
  unknown: 4,
};

// The zoom where 1px here ≈ 1 viewBox unit in the Observatory (its 1600px
// stage spans Missouri, which MapLibre shows at ~z8.3). The 2^Δzoom factor
// keeps water-speed physical across zooms; the clamp keeps the statewide
// frame from freezing and the gravel-bar frame from strobing.
const REF_ZOOM = 8.3;
const ZOOM_FACTOR_MIN = 0.5;
const ZOOM_FACTOR_MAX = 6;

/** Percentile sweeps a ±20% envelope around the verdict's base speed —
 *  the widest symmetric band that keeps adjacent conditions ordered. */
function speedFor(code: ConditionCode, percentile: number | null): number {
  const base = SPEED[code] ?? SPEED.unknown;
  if (percentile == null || Number.isNaN(percentile)) return base;
  const p = Math.max(0, Math.min(100, percentile));
  return base * (0.8 + 0.4 * (p / 100));
}

const FADE_ALPHA = 0.055;
const PARTICLE_COLOR = '250,252,254';
const HEAD_ALPHA = 0.6;
/** Screen-space decimation: drop projected vertices closer than this to
 *  the last kept one, so statewide framings don't drag full-res NHD lines
 *  through the per-frame binary search. */
const MIN_SEG_PX = 2.5;
/** Rivers whose projected bbox misses the canvas by more than this margin
 *  get no particle budget this camera. */
const VIEW_MARGIN_PX = 80;

interface Runtime {
  pts: Array<[number, number]>; // projected, decimated, CSS px
  cum: Float64Array;
  total: number;
  speed: number; // px/s at this camera
}

interface Particle {
  river: number;
  s: number; // distance along polyline, CSS px
  jitter: number; // 0.85–1.15 so streams don't march in lockstep
}

export default function FlowParticlesLayer({
  visibleConditions = null,
  onlyRiverId,
}: {
  /** Match the network layer's condition filter so streaks never trace
   *  rivers the legend chips have hidden. */
  visibleConditions?: ConditionCode[] | null;
  /** Restrict to one river (the hero) — used when the nearby-rivers
   *  network is toggled off but the selected river is still drawn. */
  onlyRiverId?: string;
}) {
  const map = useMap();
  // All curated rivers, hero included — flow belongs on the star of the
  // page too (the network layer excludes it only to avoid double-drawing
  // color, which doesn't apply to motion).
  const { collection } = useConditionNetwork();

  useEffect(() => {
    if (!map || !collection) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const features = collection.features.filter(
      (f) =>
        (!onlyRiverId || f.properties.riverId === onlyRiverId) &&
        (!visibleConditions || visibleConditions.includes(f.properties.code)) &&
        Array.isArray(f.geometry?.coordinates) &&
        f.geometry.coordinates.length >= 2,
    );
    if (!features.length) return;

    const maxParticles = window.matchMedia('(pointer: coarse)').matches ? 200 : 420;

    // ── Canvas: above the GL canvas, below every marker (DOM order inside
    //    the canvas container decides paint order) ──
    const container = map.getCanvasContainer();
    const glCanvas = map.getCanvas();
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    container.insertBefore(canvas, glCanvas.nextSibling);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      return;
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cssW = 0;
    let cssH = 0;
    const sizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    };
    sizeCanvas();

    // ── Screen-space runtimes + particles, rebuilt on every camera settle.
    //    Deterministic LCG so the same camera + data seeds the same layout
    //    (no flicker on the 15-min data ticks). ──
    let runtimes: Runtime[] = [];
    let particles: Particle[] = [];

    const rebuild = () => {
      const zoomFactor = Math.min(
        ZOOM_FACTOR_MAX,
        Math.max(ZOOM_FACTOR_MIN, 2 ** (map.getZoom() - REF_ZOOM)),
      );
      runtimes = [];
      for (const f of features) {
        const coords = f.geometry.coordinates as [number, number][];
        const pts: Array<[number, number]> = [];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < coords.length; i++) {
          const p = map.project([coords[i][0], coords[i][1]]);
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
          const last = pts[pts.length - 1];
          if (last && i < coords.length - 1) {
            const dx = p.x - last[0];
            const dy = p.y - last[1];
            if (dx * dx + dy * dy < MIN_SEG_PX * MIN_SEG_PX) continue;
          }
          pts.push([p.x, p.y]);
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        if (pts.length < 2) continue;
        // Off-screen rivers get no budget this camera.
        if (
          maxX < -VIEW_MARGIN_PX ||
          maxY < -VIEW_MARGIN_PX ||
          minX > cssW + VIEW_MARGIN_PX ||
          minY > cssH + VIEW_MARGIN_PX
        ) {
          continue;
        }
        const cum = new Float64Array(pts.length);
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
          total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          cum[i] = total;
        }
        if (total < 8) continue; // sub-pixel reach at this zoom — skip
        runtimes.push({
          pts,
          cum,
          total,
          speed: speedFor(f.properties.code, f.properties.percentile) * zoomFactor,
        });
      }

      particles = [];
      if (!runtimes.length) return;
      const totalLen = runtimes.reduce((sum, r) => sum + r.total, 0) || 1;
      let seed = 1234567;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      for (let idx = 0; idx < runtimes.length; idx++) {
        const r = runtimes[idx];
        const n = Math.max(2, Math.round((r.total / totalLen) * maxParticles));
        for (let i = 0; i < n; i++) {
          particles.push({ river: idx, s: rand() * r.total, jitter: 0.85 + rand() * 0.3 });
        }
      }
    };
    rebuild();

    const pointAt = (r: Runtime, s: number): [number, number] => {
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
      return [
        r.pts[i - 1][0] + (r.pts[i][0] - r.pts[i - 1][0]) * k,
        r.pts[i - 1][1] + (r.pts[i][1] - r.pts[i - 1][1]) * k,
      ];
    };

    // ── Frame loop (Observatory's, minus the per-frame viewBox transform —
    //    the camera is frozen while we animate) ──
    let raf = 0;
    let last = performance.now();
    let running = true;
    // True during an active camera move. Mounting mid-flight (camera easing
    // to a newly selected river) means movestart already fired before we
    // bound — start paused; the pending moveend rebuilds and resumes.
    let paused = map.isMoving();
    let clearedForPause = false;
    const SLOW_FRAME_LIMIT = maxParticles <= 250 ? 30 : 60;
    let slowFrames = 0;

    const clearAll = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const tick = (now: number) => {
      if (!running) return;
      if (paused) {
        if (!clearedForPause) {
          clearAll();
          clearedForPause = true;
        }
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }
      clearedForPause = false;
      const dtMs = now - last;
      last = now;
      const dt = Math.min(0.05, dtMs / 1000);

      // Self-degrade long before jank becomes visible.
      if (dtMs > 24) {
        if (++slowFrames >= SLOW_FRAME_LIMIT && particles.length > 120) {
          particles = particles.filter((_, i) => i % 2 === 0);
          slowFrames = 0;
        }
      } else if (slowFrames > 0) {
        slowFrames--;
      }

      if (!particles.length || !canvas.width) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // Accumulation buffer: fade the previous frame toward transparent so
      // trails linger and decay (destination-out lowers existing alpha).
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${FADE_ALPHA})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const headR = 0.9;
      ctx.fillStyle = `rgba(${PARTICLE_COLOR},${HEAD_ALPHA})`;
      ctx.strokeStyle = `rgba(${PARTICLE_COLOR},${HEAD_ALPHA})`;
      ctx.lineWidth = 1.1;
      for (const p of particles) {
        const r = runtimes[p.river];
        const step = r.speed * p.jitter * dt;
        p.s += step;
        if (p.s >= r.total) p.s -= r.total;

        // Stamp only the head; the fade buffer turns past heads into a
        // streak. A short stroke to last frame's head keeps fast streams
        // continuous — except right after a wrap (no chord from mouth back
        // to source).
        const [x1, y1] = pointAt(r, p.s);
        if (p.s - step >= 0.01) {
          const [x0, y0] = pointAt(r, p.s - step);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x1, y1, headR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // ── Camera + lifecycle wiring ──
    const onMoveStart = () => {
      paused = true;
    };
    const onMoveEnd = () => {
      rebuild();
      paused = false;
      last = performance.now();
    };
    const onResize = () => {
      sizeCanvas();
      rebuild();
    };
    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEnd);
    map.on('resize', onResize);

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
      document.removeEventListener('visibilitychange', onVisibility);
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEnd);
      map.off('resize', onResize);
      canvas.remove();
    };
  }, [map, collection, visibleConditions, onlyRiverId]);

  return null;
}
