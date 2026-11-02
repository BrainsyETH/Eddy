// River trails: the map's moving network, drawn the way Earth Nullschool draws
// wind — many short-lived particles leaving trails that fade — but bound to
// the river lines themselves, never to the space between them.
//
// What the motion means (and does not):
//   * DIRECTION ONLY. Particles travel each line in its digitized downstream
//     direction at a constant on-screen pace per river class (trunk fastest,
//     regional slowest). No speed is a measured velocity and no reading is
//     spread along a river (ADR 0018) — this is the same claim the dashed
//     traces made, drawn more legibly.
//   * Density follows river size, so the big rivers carry the most light.
//
// Mechanics: the trails canvas is never fully cleared while running; each
// frame fades it a little (destination-out) and every particle strokes the
// short segment from its last screen position to its new one. A camera move
// clears it, so a pan or zoom never smears trails across the map.

import type { DecodedLine } from '@/lib/national-map/geometry';
import { applyAffine, type Layout } from '@/lib/national-map/projection';

/** Per river class: particles per frame-px of line, on-screen pace (CSS px/s at the 760 px reference), width, alpha. */
export const TRAIL_CLASSES = [
  { order: 5, density: 1 / 34, speed: 26, width: 0.9, alpha: 0.6, minZoom: 2 },
  { order: 6, density: 1 / 26, speed: 36, width: 1.15, alpha: 0.75, minZoom: 0 },
  { order: 7, density: 1 / 18, speed: 46, width: 1.5, alpha: 0.9, minZoom: 0 },
] as const;
/** A cap so a 4K wall never runs more than this many particles. */
const MAX_PARTICLES = 3200;
/** Share of the trail removed each frame: lower = longer trails. */
const FADE = 0.09;

interface Line {
  xy: Float32Array; // layout space
  cum: Float32Array; // cumulative length at each vertex
  length: number;
}

interface ClassState {
  lines: Line[];
  /** Prefix sums of line lengths, for length-weighted spawning. */
  prefix: Float64Array;
  total: number;
  count: number;
  line: Int32Array;
  seg: Int32Array;
  s: Float32Array;
  life: Float32Array;
  px: Float32Array;
  py: Float32Array;
  fresh: Uint8Array;
}

export class RiverTrails {
  private classes: ClassState[] = [];
  private lastCamera = '';
  private lastT = 0;
  private seed = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  /** Build the network from the base rivers (orders 5–7, not Hawaii) in layout space. */
  setNetwork(rivers: DecodedLine[] | null, layout: Layout | null) {
    this.classes = [];
    this.clear();
    if (!rivers || !layout) return;
    let budget = 0;
    const perClass = TRAIL_CLASSES.map((c) => {
      const lines: Line[] = [];
      for (const r of rivers) {
        if (r.component === 'hi') continue;
        if (c.order === 7 ? r.order < 7 : r.order !== c.order) continue;
        const a = layout.affine[r.component];
        const xy = new Float32Array(r.xy.length);
        const cum = new Float32Array(r.xy.length / 2);
        let run = 0;
        for (let i = 0; i + 1 < r.xy.length; i += 2) {
          const [x, y] = applyAffine(a, r.xy[i], r.xy[i + 1]);
          xy[i] = x;
          xy[i + 1] = y;
          if (i > 0) run += Math.hypot(x - xy[i - 2], y - xy[i - 1]);
          cum[i / 2] = run;
        }
        if (run > 0) lines.push({ xy, cum, length: run });
      }
      const prefix = new Float64Array(lines.length);
      let total = 0;
      lines.forEach((l, i) => {
        total += l.length;
        prefix[i] = total;
      });
      const want = Math.round(total * c.density);
      budget += want;
      return { lines, prefix, total, want };
    });
    const scale = budget > MAX_PARTICLES ? MAX_PARTICLES / budget : 1;
    this.classes = perClass.map(({ lines, prefix, total, want }) => {
      const count = lines.length ? Math.max(1, Math.round(want * scale)) : 0;
      const st: ClassState = {
        lines, prefix, total, count,
        line: new Int32Array(count), seg: new Int32Array(count), s: new Float32Array(count), life: new Float32Array(count),
        px: new Float32Array(count), py: new Float32Array(count), fresh: new Uint8Array(count),
      };
      for (let i = 0; i < count; i++) this.spawn(st, i, true);
      return st;
    });
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
    o: { scale: number; tx: number; ty: number; dpr: number; screen: number; zoom: number; wall: boolean; focus: number; color: string },
  ) {
    const g = this.canvas.getContext('2d');
    if (!g || !this.classes.length) return;
    const cam = `${o.scale}|${o.tx}|${o.ty}|${this.canvas.width}`;
    if (cam !== this.lastCamera) {
      // A new view: start clean so nothing streaks across the move.
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.lastCamera = cam;
      for (const st of this.classes) st.fresh.fill(1);
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
    g.strokeStyle = o.color;
    const zf = Math.min(1.8, 1 + Math.log2(Math.max(1, o.zoom)) * 0.25);

    TRAIL_CLASSES.forEach((c, ci) => {
      const st = this.classes[ci];
      if (!st || !st.count) return;
      // The wall runs every class at the national fit; Explore adds the
      // regional class once zoomed in, as the dashed traces did.
      if (o.zoom < c.minZoom && !o.wall) return;
      const ds = (c.speed * o.screen * zf * dt) / 1000 / o.scale; // layout units this frame
      g.lineWidth = c.width * o.screen * zf;
      g.globalAlpha = (o.wall ? Math.min(1, c.alpha * 1.15) : c.alpha) * (1 - 0.7 * o.focus);
      g.beginPath();
      for (let i = 0; i < st.count; i++) {
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
    g.globalAlpha = 1;
  }

  /** Put particle i somewhere new on its class's network, weighted by line length. */
  private spawn(st: ClassState, i: number, initial: boolean) {
    const r = this.random() * st.total;
    let lo = 0;
    let hi = st.prefix.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (st.prefix[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const line = st.lines[lo];
    // Start anywhere along the line (initially), or near its upstream half
    // later so particles travel visibly before they expire.
    const s = this.random() * line.length * (initial ? 1 : 0.85);
    let seg = 0;
    while (seg < line.cum.length - 2 && line.cum[seg + 1] < s) seg++;
    st.line[i] = lo;
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
