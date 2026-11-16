// River trails: the map's moving network, drawn the way Earth Nullschool draws
// wind — many short-lived particles leaving trails that fade — but bound to
// the river lines themselves, never to the space between them.
//
// What the motion means (and does not):
//   * MAPPED DOWNSTREAM DIRECTION ONLY. Particles travel each line in its
//     digitized downstream direction at a constant on-screen pace per class.
//     No speed is a measured velocity, no reading is spread along a river, and
//     a moving trail does not claim a stream is carrying water now (ADR 0018).
//     Measurements stay on the gauges.
//   * A hierarchy, so the network reads at a glance: trunk rivers carry the
//     most light, then major rivers, then regional ones; tributaries (order 4)
//     and selected small streams (order 3) are thinner, fainter and sparser.
//
// Budget. Particles go to channels ON SCREEN, at a steady density per screen
// pixel of channel (so zooming in fills the view instead of thinning out), and
// classes are served in priority order — the big rivers always get their
// share first; streams take what is left of the cap.
//
// Small streams nationally: order 3 is ~1,600 lines in the lower 48 alone —
// equal treatment would turn the East into a tangle — so at the national
// scale only lines chosen by length and spacing run (one per grid cell,
// longest first). Zoomed in, where those lines are drawn, all of them run.
//
// Mechanics: the trails canvas is never fully cleared while running; each
// frame fades it a little (destination-out) and every particle strokes the
// short segment from its last screen position to its new one. A camera move
// clears it, so a pan or zoom never smears trails across the map.

import type { DecodedLine } from '@/lib/national-map/geometry';
import { applyAffine, type Layout } from '@/lib/national-map/projection';

type Source = 'base' | 'detail';

export interface TrailClass {
  key: string;
  source: Source;
  /** Which lines of the source belong to the class. */
  has: (l: DecodedLine) => boolean;
  /** Particles per frame px of channel at the national fit (zoomed in: per frame px × zoom, i.e. steady on screen). */
  density: number;
  /** On-screen pace, CSS px/s at the 760 px reference. */
  speed: number;
  width: number;
  alpha: number;
  /** Explore runs the class from this zoom; the wall runs it at the national fit. */
  minZoom: number;
  /** Below this zoom only the spacing-selected lines run (small streams). */
  allFromZoom?: number;
  /** Uses the stream ink (palette.traceStream) instead of the river trace. */
  stream?: boolean;
}

/** In priority order: the cap is served top to bottom. */
export const TRAIL_CLASSES: TrailClass[] = [
  { key: 'trunk', source: 'base', has: (l) => l.component !== 'hi' && l.order >= 7, density: 1 / 18, speed: 46, width: 1.5, alpha: 0.9, minZoom: 0 },
  { key: 'major', source: 'base', has: (l) => l.component !== 'hi' && l.order === 6, density: 1 / 26, speed: 36, width: 1.15, alpha: 0.75, minZoom: 0 },
  { key: 'regional', source: 'base', has: (l) => l.component !== 'hi' && l.order === 5, density: 1 / 34, speed: 26, width: 0.9, alpha: 0.6, minZoom: 2 },
  // Hawaii's streams are short (its base lines are orders 2–3): its own class,
  // so the islands move with the rest of the country.
  { key: 'hawaii', source: 'base', has: (l) => l.component === 'hi', density: 1 / 30, speed: 22, width: 0.85, alpha: 0.6, minZoom: 0 },
  { key: 'tributary', source: 'detail', has: (l) => l.component !== 'hi' && l.order === 4, density: 1 / 46, speed: 21, width: 0.7, alpha: 0.5, minZoom: 0, stream: true },
  {
    key: 'stream', source: 'detail', has: (l) => l.component !== 'hi' && l.order === 3,
    density: 1 / 60, speed: 17, width: 0.55, alpha: 0.42, minZoom: 0, allFromZoom: 2.2, stream: true,
  },
];

/** The cap: a 4K wall never runs more than this many particles. */
export const MAX_PARTICLES = 4200;
/**
 * Share of the trail removed each frame: lower = longer trails. (8-bit
 * rounding leaves crossed pixels at alpha 1/255 — measured, 2026-11-02 —
 * which is invisible, so no clean-up pass is needed.)
 */
const FADE = 0.09;
/**
 * Rated rivers (a state view): denser and a touch wider than the major rivers'
 * trails — they are what the view is about — with their own particle budget.
 */
const RATED_DENSITY = 1 / 9;
const RATED_SPEED = 30;
const RATED_WIDTH = 1.25;
const RATED_MAX = 1400;
/** Small-stream selection at the national scale: grid cell, frame px (~960 wide frame). */
const STREAM_CELL = 22;
/** …and the shortest small stream worth a trail there, frame px. */
const STREAM_MIN_LENGTH = 9;

interface Line {
  xy: Float32Array; // layout space
  cum: Float32Array; // cumulative length at each vertex
  length: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Runs at the national scale (always true outside the small-stream class). */
  selected: boolean;
}

interface ClassState {
  lines: Line[];
  /** Lines eligible this view (visible, and selected where that applies). */
  live: Int32Array;
  liveCount: number;
  /** Prefix sums of eligible line lengths, for length-weighted spawning. */
  prefix: Float64Array;
  liveLength: number;
  /** Particles allocated to the class, and how many run this view. */
  count: number;
  active: number;
  line: Int32Array;
  seg: Int32Array;
  s: Float32Array;
  life: Float32Array;
  px: Float32Array;
  py: Float32Array;
  fresh: Uint8Array;
}

/** Channel length (frame px × zoom, i.e. relative screen length) → particles wanted. */
export function wantedParticles(length: number, density: number): number {
  return Math.max(0, Math.round(length * density));
}

/** Serve classes in priority order until the cap runs out. */
export function allocate(wants: number[], cap: number): number[] {
  let left = cap;
  return wants.map((w) => {
    const n = Math.min(w, left);
    left -= n;
    return n;
  });
}

/**
 * Small streams at the national scale: longest first, at most one per grid
 * cell (by the line's midpoint) and long enough to show movement.
 */
export function selectBySpacing(lines: Array<{ length: number; midX: number; midY: number }>, cell: number, minLength: number): boolean[] {
  const order = lines.map((_, i) => i).sort((a, b) => lines[b].length - lines[a].length);
  const taken = new Set<string>();
  const out = new Array<boolean>(lines.length).fill(false);
  for (const i of order) {
    const l = lines[i];
    if (l.length < minLength) continue;
    const key = `${Math.floor(l.midX / cell)}:${Math.floor(l.midY / cell)}`;
    if (taken.has(key)) continue;
    taken.add(key);
    out[i] = true;
  }
  return out;
}

export class RiverTrails {
  private classes: ClassState[] = [];
  /** Eddy's rated rivers (a state, Flow): one particle system, coloured per section. */
  private rated: ClassState | null = null;
  private ratedColors: Array<string | null> = [];
  private lastCamera = '';
  private lastT = 0;
  private seed = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  /** Build the network from the base and (when loaded) detail rivers, in layout space. */
  setNetwork(base: DecodedLine[] | null, detail: DecodedLine[] | null, layout: Layout | null) {
    this.classes = [];
    this.clear();
    if (!base || !layout) return;
    const sources: Record<Source, DecodedLine[]> = { base, detail: detail ?? [] };
    const built = TRAIL_CLASSES.map((c) => {
      const lines: Line[] = [];
      const mids: Array<{ length: number; midX: number; midY: number }> = [];
      for (const r of sources[c.source]) {
        if (!c.has(r)) continue;
        const a = layout.affine[r.component];
        const xy = new Float32Array(r.xy.length);
        const cum = new Float32Array(r.xy.length / 2);
        let run = 0;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i + 1 < r.xy.length; i += 2) {
          const [x, y] = applyAffine(a, r.xy[i], r.xy[i + 1]);
          xy[i] = x;
          xy[i + 1] = y;
          if (i > 0) run += Math.hypot(x - xy[i - 2], y - xy[i - 1]);
          cum[i / 2] = run;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        if (run <= 0) continue;
        const mid = (xy.length >> 2) << 1;
        lines.push({ xy, cum, length: run, minX, minY, maxX, maxY, selected: true });
        mids.push({ length: run, midX: xy[mid], midY: xy[mid + 1] });
      }
      if (c.allFromZoom !== undefined) {
        const keep = selectBySpacing(mids, STREAM_CELL, STREAM_MIN_LENGTH);
        lines.forEach((l, i) => (l.selected = keep[i]));
      }
      // Allocation is sized for the national fit: everything on screen.
      const nationalLength = lines.reduce((sum, l) => sum + (l.selected ? l.length : 0), 0);
      return { lines, want: wantedParticles(nationalLength, c.density) };
    });
    // Zoomed in, a class may want more than the national fit did (all small
    // streams run; density per screen px holds): allow up to 2× per class,
    // still inside the cap, big rivers first.
    const counts = allocate(built.map((b) => b.want * 2), MAX_PARTICLES);
    this.classes = built.map(({ lines }, ci) => {
      const count = lines.length ? counts[ci] : 0;
      return {
        lines,
        live: new Int32Array(lines.length),
        liveCount: 0,
        prefix: new Float64Array(lines.length),
        liveLength: 0,
        count,
        active: 0,
        line: new Int32Array(count), seg: new Int32Array(count), s: new Float32Array(count), life: new Float32Array(count),
        px: new Float32Array(count), py: new Float32Array(count), fresh: new Uint8Array(count),
      };
    });
  }

  /**
   * Trails on Eddy's rated rivers, layout-space lines each with its section's
   * condition colour (null: no current reading — the plain trace). Only lines
   * whose downstream direction is confirmed are passed in (rated.ts).
   */
  setRated(sections: Array<{ xy: Float32Array; color: string | null }> | null) {
    this.rated = null;
    this.ratedColors = [];
    this.lastCamera = '';
    if (!sections?.length) return;
    const lines: Line[] = [];
    for (const sec of sections) {
      const n = sec.xy.length / 2;
      if (n < 2) continue;
      const cum = new Float32Array(n);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = sec.xy[i * 2];
        const y = sec.xy[i * 2 + 1];
        if (i) cum[i] = cum[i - 1] + Math.hypot(x - sec.xy[i * 2 - 2], y - sec.xy[i * 2 - 1]);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      if (!(cum[n - 1] > 0)) continue;
      lines.push({ xy: sec.xy, cum, length: cum[n - 1], minX, minY, maxX, maxY, selected: true });
      this.ratedColors.push(sec.color);
    }
    if (!lines.length) return;
    const count = RATED_MAX;
    this.rated = {
      lines,
      live: new Int32Array(lines.length),
      liveCount: 0,
      prefix: new Float64Array(lines.length),
      liveLength: 0,
      count,
      active: 0,
      line: new Int32Array(count), seg: new Int32Array(count), s: new Float32Array(count), life: new Float32Array(count),
      px: new Float32Array(count), py: new Float32Array(count), fresh: new Uint8Array(count),
    };
  }

  clear() {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.lastCamera = '';
  }

  /**
   * Advance and draw one frame. `focus` (0–1) quiets the trails while a
   * river journey commands the screen.
   */
  step(
    t: number,
    o: {
      scale: number; tx: number; ty: number; dpr: number; screen: number; zoom: number; wall: boolean; focus: number;
      color: string; streamColor: string; width: number; height: number;
      /** A condition hue as drawn in trails: lifted on dark, deepened on parchment. */
      ratedTint?: (hex: string) => string;
    },
  ) {
    const g = this.canvas.getContext('2d');
    if (!g || !this.classes.length) return;
    const cam = `${o.scale}|${o.tx}|${o.ty}|${this.canvas.width}|${this.canvas.height}`;
    if (cam !== this.lastCamera) {
      // A new view: start clean so nothing streaks across the move, and send
      // the particles to the channels now on screen.
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.lastCamera = cam;
      this.retarget(o);
    }
    const dt = this.lastT ? Math.min(100, t - this.lastT) : 33;
    this.lastT = t;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = `rgba(0, 0, 0, ${FADE})`;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.globalCompositeOperation = 'source-over';
    g.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    g.lineCap = 'round';
    const zf = Math.min(1.8, 1 + Math.log2(Math.max(1, o.zoom)) * 0.25);

    TRAIL_CLASSES.forEach((c, ci) => {
      const st = this.classes[ci];
      if (!st || !st.active || !st.liveCount) return;
      const ds = (c.speed * o.screen * zf * dt) / 1000 / o.scale; // layout units this frame
      g.strokeStyle = c.stream ? o.streamColor : o.color;
      g.lineWidth = c.width * o.screen * zf;
      g.globalAlpha = (o.wall ? Math.min(1, c.alpha * 1.15) : c.alpha) * (1 - 0.7 * o.focus);
      g.beginPath();
      for (let i = 0; i < st.active; i++) {
        st.life[i] -= dt;
        const line = st.lines[st.line[i]];
        const s = st.s[i] + ds;
        if (st.life[i] <= 0 || s >= line.length) {
          this.spawn(st, i, false);
          continue;
        }
        let seg = st.seg[i];
        while (seg < line.cum.length - 2 && line.cum[seg + 1] < s) seg++;
        st.s[i] = s;
        st.seg[i] = seg;
        const s0 = line.cum[seg];
        const s1 = line.cum[seg + 1];
        const u = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
        const x = (line.xy[seg * 2] + (line.xy[seg * 2 + 2] - line.xy[seg * 2]) * u) * o.scale + o.tx;
        const y = (line.xy[seg * 2 + 1] + (line.xy[seg * 2 + 3] - line.xy[seg * 2 + 1]) * u) * o.scale + o.ty;
        if (!st.fresh[i]) {
          g.moveTo(st.px[i], st.py[i]);
          g.lineTo(x, y);
        }
        st.fresh[i] = 0;
        st.px[i] = x;
        st.py[i] = y;
      }
      g.stroke();
    });

    // Rated rivers: the same particles, one path per condition colour.
    const rt = this.rated;
    if (rt && rt.active && rt.liveCount) {
      const ds = (RATED_SPEED * o.screen * zf * dt) / 1000 / o.scale;
      const paths = new Map<string, Path2D>();
      for (let i = 0; i < rt.active; i++) {
        rt.life[i] -= dt;
        const li = rt.line[i];
        const line = rt.lines[li];
        const s = rt.s[i] + ds;
        if (rt.life[i] <= 0 || s >= line.length) {
          this.spawn(rt, i, false);
          continue;
        }
        let seg = rt.seg[i];
        while (seg < line.cum.length - 2 && line.cum[seg + 1] < s) seg++;
        rt.s[i] = s;
        rt.seg[i] = seg;
        const s0 = line.cum[seg];
        const s1 = line.cum[seg + 1];
        const u = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
        const x = (line.xy[seg * 2] + (line.xy[seg * 2 + 2] - line.xy[seg * 2]) * u) * o.scale + o.tx;
        const y = (line.xy[seg * 2 + 1] + (line.xy[seg * 2 + 3] - line.xy[seg * 2 + 1]) * u) * o.scale + o.ty;
        if (!rt.fresh[i]) {
          const hue = this.ratedColors[li];
          const key = hue && o.ratedTint ? o.ratedTint(hue) : o.color;
          const path = paths.get(key) ?? paths.set(key, new Path2D()).get(key)!;
          path.moveTo(rt.px[i], rt.py[i]);
          path.lineTo(x, y);
        }
        rt.fresh[i] = 0;
        rt.px[i] = x;
        rt.py[i] = y;
      }
      g.lineWidth = RATED_WIDTH * o.screen * zf;
      g.globalAlpha = 0.95 * (1 - 0.7 * o.focus);
      for (const [color, path] of paths) {
        g.strokeStyle = color;
        g.stroke(path);
      }
    }
    g.globalAlpha = 1;
  }

  /** Which lines each class runs in this view, and how many particles. */
  private retarget(o: { scale: number; tx: number; ty: number; zoom: number; wall: boolean; width: number; height: number }) {
    // The view in layout space, with a margin so trails enter from the edges.
    const pad = 24;
    const x0 = (-pad - o.tx) / o.scale;
    const y0 = (-pad - o.ty) / o.scale;
    const x1 = (o.width + pad - o.tx) / o.scale;
    const y1 = (o.height + pad - o.ty) / o.scale;
    TRAIL_CLASSES.forEach((c, ci) => {
      const st = this.classes[ci];
      if (!st) return;
      st.liveCount = 0;
      st.liveLength = 0;
      // Explore keeps the regional class for zoomed-in views, as before; the
      // wall runs every class at the national fit.
      const on = o.wall || o.zoom >= c.minZoom;
      const all = c.allFromZoom === undefined || o.zoom >= c.allFromZoom;
      if (on) {
        for (let li = 0; li < st.lines.length; li++) {
          const l = st.lines[li];
          if (!all && !l.selected) continue;
          if (l.maxX < x0 || l.minX > x1 || l.maxY < y0 || l.minY > y1) continue;
          st.liveLength += l.length;
          st.prefix[st.liveCount] = st.liveLength;
          st.live[st.liveCount++] = li;
        }
      }
      // Steady density per screen px of visible channel, up to the allocation.
      st.active = Math.min(st.count, wantedParticles(st.liveLength * Math.max(1, o.zoom), c.density));
      for (let i = 0; i < st.active; i++) this.spawn(st, i, true);
    });
    const rt = this.rated;
    if (rt) {
      rt.liveCount = 0;
      rt.liveLength = 0;
      for (let li = 0; li < rt.lines.length; li++) {
        const l = rt.lines[li];
        if (l.maxX < x0 || l.minX > x1 || l.maxY < y0 || l.minY > y1) continue;
        rt.liveLength += l.length;
        rt.prefix[rt.liveCount] = rt.liveLength;
        rt.live[rt.liveCount++] = li;
      }
      rt.active = Math.min(rt.count, wantedParticles(rt.liveLength * Math.max(1, o.zoom), RATED_DENSITY));
      for (let i = 0; i < rt.active; i++) this.spawn(rt, i, true);
    }
  }

  /** Put particle i somewhere new on its class's eligible lines, weighted by length. */
  private spawn(st: ClassState, i: number, initial: boolean) {
    if (!st.liveCount) return;
    const r = this.random() * st.liveLength;
    let lo = 0;
    let hi = st.liveCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (st.prefix[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const li = st.live[lo];
    const line = st.lines[li];
    // Start anywhere along the line (initially), or within its upper reaches
    // later so particles travel visibly before they expire.
    const s = this.random() * line.length * (initial ? 1 : 0.85);
    let seg = 0;
    while (seg < line.cum.length - 2 && line.cum[seg + 1] < s) seg++;
    st.line[i] = li;
    st.seg[i] = seg;
    st.s[i] = s;
    st.life[i] = 1800 + this.random() * 4200;
    st.fresh[i] = 1;
  }

  /** A small deterministic generator: the same network always starts the same way. */
  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
}
