// The national River Map's canvas renderer.
//
// Layers, bottom to top:
//   base   land, lakes, state lines, rivers, state labels — redrawn on camera,
//          theme or geometry change; never per animation frame.
//   fx     downstream traces and flood event rings — the only per-frame layer,
//          capped at 30 fps and stopped when motion is off or the page hidden.
//   marks  gauge marks (two canvases, cross-faded when a NEW FRAME arrives so
//          updated values change smoothly instead of flashing; camera moves
//          draw straight into the visible one).
//
// Gestures are compositor-only: while a pan / pinch / wheel is live, the base
// and marks canvases keep their last full drawing and move by a CSS transform;
// one full redraw follows once input settles. Redrawing ~14,000 marks and the
// river network per pointer event is what made a national pan stutter.
//
// Everything is drawn from layout-frame coordinates through the camera, so a
// pan or zoom is a transform change, not a re-projection. Marks are stamped
// from cached sprites — 14,000 drawImage calls are a few milliseconds, where
// 14,000 arc fills are not.

import type { Camera, Viewport } from '@/lib/national-map/camera';
import type { DecodedGeometry, DecodedLine, DecodedPolygon } from '@/lib/national-map/geometry';
import type { MarkShape, MarkStyle } from '@/lib/national-map/marks';
import { applyAffine, type Layout } from '@/lib/national-map/projection';
import type { MapPalette } from '@/lib/national-map/theme';

export interface RenderMark {
  /** Laid-out position. */
  x: number;
  y: number;
  style: MarkStyle;
  /** Stable per-site phase, so event rings never pulse in unison. */
  phase: number;
}

const FX_FPS = 30;
const RING_PERIOD_MS = 5000;
/**
 * Downstream traces by river class, in CSS px at the national fit on a
 * 760 px screen; everything scales with the screen so a wall display gets
 * highlights it can see across a room. Trunk rivers carry the longest,
 * brightest, quickest highlights — the hierarchy is part of the motion.
 * Direction only: none of these speeds is a measured velocity.
 */
const TRACE_CLASSES = [
  { key: 'tracesRegional', minZoom: 2, width: 1.0, dash: 3.5, gap: 52, speed: 8, alpha: 0.7 },
  { key: 'tracesMajor', minZoom: 0, width: 1.35, dash: 5, gap: 58, speed: 11, alpha: 0.82 },
  { key: 'tracesTrunk', minZoom: 0, width: 1.8, dash: 8, gap: 68, speed: 15, alpha: 0.95 },
] as const;
/** The spotlight's arrival sweep and the old spot's fade. */
const SPOT_ARRIVE_MS = 1100;
/** Event rings go to the most severe sites only; a widespread flood is not a field of pulses. */
const MAX_RINGS = 60;

function resolveColor(p: MapPalette, key: string): string {
  const [a, b] = key.split('.');
  const v = b ? (p as unknown as Record<string, Record<string, string>>)[a]?.[b] : (p as unknown as Record<string, string>)[a];
  return typeof v === 'string' ? v : '#888';
}

interface LaidPaths {
  land: Path2D;
  lakes: Path2D;
  /** Base rivers by Strahler order. */
  rivers: Map<number, Path2D>;
  detail: Map<number, Path2D>;
  /** Channels that carry downstream traces, by class (see TRACE_CLASSES). */
  tracesTrunk: Path2D;
  tracesMajor: Path2D;
  tracesRegional: Path2D;
  labels: Array<{ code: string; x: number; y: number }>;
}

function ringPath(path: Path2D, ring: Float32Array, layout: Layout, poly: DecodedPolygon) {
  const a = layout.affine[poly.component];
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const [x, y] = applyAffine(a, ring[i], ring[i + 1]);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
}

function linePath(path: Path2D, line: DecodedLine, layout: Layout) {
  const a = layout.affine[line.component];
  for (let i = 0; i + 1 < line.xy.length; i += 2) {
    const [x, y] = applyAffine(a, line.xy[i], line.xy[i + 1]);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
}

/** Area-weighted label point of a state's largest ring. */
function labelPoint(poly: DecodedPolygon, layout: Layout): [number, number] | null {
  let best: Float32Array | null = null;
  let bestArea = 0;
  for (const ring of poly.rings) {
    let a = 0;
    for (let i = 0; i + 3 < ring.length; i += 2) a += ring[i] * ring[i + 3] - ring[i + 2] * ring[i + 1];
    if (Math.abs(a) > bestArea) {
      bestArea = Math.abs(a);
      best = ring;
    }
  }
  if (!best) return null;
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0; i + 3 < best.length; i += 2) {
    const f = best[i] * best[i + 3] - best[i + 2] * best[i + 1];
    cx += (best[i] + best[i + 2]) * f;
    cy += (best[i + 1] + best[i + 3]) * f;
    area += f;
  }
  if (Math.abs(area) < 1e-9) return null;
  return applyAffine(layout.affine[poly.component], cx / (3 * area), cy / (3 * area));
}

function buildPaths(base: DecodedGeometry, detail: DecodedGeometry | null, layout: Layout): LaidPaths {
  const land = new Path2D();
  const labels: LaidPaths['labels'] = [];
  for (const st of base.states) {
    for (const ring of st.rings) ringPath(land, ring, layout, st);
    const lp = st.code ? labelPoint(st, layout) : null;
    if (lp && st.code) labels.push({ code: st.code, x: lp[0], y: lp[1] });
  }
  const lakes = new Path2D();
  for (const lake of base.lakes) for (const ring of lake.rings) ringPath(lakes, ring, layout, lake);
  const rivers = new Map<number, Path2D>();
  const tracesTrunk = new Path2D();
  const tracesMajor = new Path2D();
  const tracesRegional = new Path2D();
  for (const line of base.rivers) {
    const p = rivers.get(line.order) ?? new Path2D();
    linePath(p, line, layout);
    rivers.set(line.order, p);
    // Hawaii's streams are short and steep; traces there would be noise.
    if (line.component !== 'hi') {
      if (line.order >= 7) linePath(tracesTrunk, line, layout);
      else if (line.order === 6) linePath(tracesMajor, line, layout);
      else if (line.order === 5) linePath(tracesRegional, line, layout);
    }
  }
  const detailPaths = new Map<number, Path2D>();
  for (const line of detail?.rivers ?? []) {
    const p = detailPaths.get(line.order) ?? new Path2D();
    linePath(p, line, layout);
    detailPaths.set(line.order, p);
  }
  return { land, lakes, rivers, detail: detailPaths, tracesTrunk, tracesMajor, tracesRegional, labels };
}

interface Sprite {
  canvas: HTMLCanvasElement;
  half: number;
}

export class NationalRenderer {
  private readonly base: HTMLCanvasElement;
  private readonly fx: HTMLCanvasElement;
  private readonly marksA: HTMLCanvasElement;
  private readonly marksB: HTMLCanvasElement;
  private front: HTMLCanvasElement;
  private dpr = 1;
  private vp: Viewport = { width: 1, height: 1 };
  private camera: Camera = { scale: 1, tx: 0, ty: 0 };
  /** The camera the base and marks canvases were last fully drawn with. */
  private drawn: Camera | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private fitScale = 1;
  private palette: MapPalette;
  private layout: Layout | null = null;
  private geometry: DecodedGeometry | null = null;
  private detail: DecodedGeometry | null = null;
  private paths: LaidPaths | null = null;
  private marks: RenderMark[] = [];
  /** The ring-eligible marks, most severe last, capped at MAX_RINGS. */
  private ringMarks: RenderMark[] = [];
  private selected: { x: number; y: number } | null = null;
  private featured: { x: number; y: number } | null = null;
  /** Where the spotlight was, and when it moved — for the arrival sweep. */
  private featuredPrev: { x: number; y: number } | null = null;
  private featuredSince = 0;
  private showLabels = true;
  /** Fullscreen wall: every trace class at the national fit, stronger event rings. */
  private wall = false;
  private motion = true;
  /** False while every observation is stale: geography stays, motion stops. */
  private dataLive = false;
  private sprites = new Map<string, Sprite>();
  private frameHandle = 0;
  private fxHandle = 0;
  private lastFx = 0;
  private dirtyBase = true;
  private dirtyMarks = true;
  private labelFont = '600 11px system-ui, sans-serif';
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    palette: MapPalette,
  ) {
    this.palette = palette;
    const make = (z: number) => {
      const c = document.createElement('canvas');
      c.style.position = 'absolute';
      c.style.inset = '0';
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.zIndex = String(z);
      c.style.pointerEvents = 'none';
      c.setAttribute('aria-hidden', 'true');
      host.appendChild(c);
      return c;
    };
    this.base = make(0);
    this.fx = make(1);
    this.marksA = make(2);
    this.marksB = make(3);
    this.marksB.style.opacity = '0';
    this.front = this.marksA;
    for (const c of [this.marksA, this.marksB]) {
      c.style.transition = 'opacity var(--duration-slower) var(--ease-default)';
    }
    const family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    // Follow the reader's text size (browser text zoom changes the root font).
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    this.labelFont = `600 ${Math.round(11 * (rootPx / 16))}px ${family}`;
  }

  destroy() {
    this.destroyed = true;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    cancelAnimationFrame(this.frameHandle);
    cancelAnimationFrame(this.fxHandle);
    for (const c of [this.base, this.fx, this.marksA, this.marksB]) c.remove();
  }

  resize(vp: Viewport) {
    this.vp = vp;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    for (const c of [this.base, this.fx, this.marksA, this.marksB]) {
      c.width = Math.max(1, Math.round(vp.width * this.dpr));
      c.height = Math.max(1, Math.round(vp.height * this.dpr));
    }
    this.sprites.clear();
    this.dirtyBase = this.dirtyMarks = true;
    this.request();
  }

  setPalette(p: MapPalette) {
    this.palette = p;
    this.sprites.clear();
    this.dirtyBase = this.dirtyMarks = true;
    this.request();
  }

  setGeometry(base: DecodedGeometry | null, detail: DecodedGeometry | null) {
    this.geometry = base;
    this.detail = detail;
    this.rebuildPaths();
  }

  setLayout(layout: Layout) {
    this.layout = layout;
    this.rebuildPaths();
  }

  private rebuildPaths() {
    this.paths = this.geometry && this.layout ? buildPaths(this.geometry, this.detail, this.layout) : null;
    this.dirtyBase = true;
    this.request();
  }

  /**
   * `live`: part of an ongoing gesture — transform the last drawing now and
   * redraw fully once input pauses. Otherwise redraw on the next frame.
   */
  setCamera(cam: Camera, fitScale: number, live = false) {
    this.camera = cam;
    this.fitScale = fitScale;
    if (live && this.drawn) {
      const k = cam.scale / this.drawn.scale;
      const dx = cam.tx - this.drawn.tx * k;
      const dy = cam.ty - this.drawn.ty * k;
      const t = `matrix(${k}, 0, 0, ${k}, ${dx}, ${dy})`;
      for (const c of [this.base, this.marksA, this.marksB]) {
        c.style.transformOrigin = '0 0';
        c.style.transform = t;
      }
      if (this.settleTimer) clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => {
        this.settleTimer = null;
        this.dirtyBase = this.dirtyMarks = true;
        this.request();
      }, 140);
      if (!this.fxHandle) this.request();
      return;
    }
    this.dirtyBase = this.dirtyMarks = true;
    this.request();
  }

  private clearGestureTransform() {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    for (const c of [this.base, this.marksA, this.marksB]) c.style.transform = '';
  }

  /** New marks. `fade` cross-fades (a new frame); otherwise draw in place (view change). */
  setMarks(marks: RenderMark[], fade: boolean) {
    this.marks = marks;
    // Marks arrive sorted by salience, so the tail is the most severe.
    this.ringMarks = marks.filter((m) => m.style.ring).slice(-MAX_RINGS);
    if (fade && this.motion && !this.settleTimer) {
      const back = this.front === this.marksA ? this.marksB : this.marksA;
      this.drawMarks(back);
      back.style.opacity = '1';
      this.front.style.opacity = '0';
      this.front = back;
    } else {
      this.dirtyMarks = true;
      this.request();
    }
  }

  setHighlights(selected: { x: number; y: number } | null, featured: { x: number; y: number } | null) {
    this.selected = selected;
    const moved = featured?.x !== this.featured?.x || featured?.y !== this.featured?.y;
    if (moved) {
      this.featuredPrev = this.featured;
      this.featuredSince = performance.now();
    }
    this.featured = featured;
    this.dirtyMarks = true;
    this.request();
  }

  setLabels(show: boolean) {
    if (show === this.showLabels) return;
    this.showLabels = show;
    this.dirtyBase = true;
    this.request();
  }

  setWall(wall: boolean) {
    if (wall === this.wall) return;
    this.wall = wall;
    this.dirtyBase = this.dirtyMarks = true;
    this.request();
  }

  setMotion(motion: boolean, dataLive: boolean) {
    this.motion = motion;
    this.dataLive = dataLive;
    // The spotlight is animated on the fx layer when motion runs and drawn
    // statically on the marks layer otherwise.
    this.dirtyMarks = true;
    this.syncFxLoop();
    this.request();
  }

  /** The per-frame loop runs only while it has something to animate and can be seen. */
  syncFxLoop() {
    cancelAnimationFrame(this.fxHandle);
    this.fxHandle = 0;
    if (this.destroyed) return;
    if (!this.motion || !this.dataLive || document.hidden) {
      this.drawFx(0);
      return;
    }
    const loop = (t: number) => {
      if (this.destroyed) return;
      if (t - this.lastFx >= 1000 / FX_FPS - 1) {
        this.lastFx = t;
        this.drawFx(t);
      }
      this.fxHandle = requestAnimationFrame(loop);
    };
    this.fxHandle = requestAnimationFrame(loop);
  }

  private request() {
    if (this.frameHandle || this.destroyed) return;
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = 0;
      if (this.dirtyBase || this.dirtyMarks) this.clearGestureTransform();
      if (this.dirtyBase) this.drawBase();
      if (this.dirtyMarks) this.drawMarks(this.front);
      if (!this.fxHandle) this.drawFx(performance.now());
      this.drawn = this.camera;
      this.dirtyBase = this.dirtyMarks = false;
    });
  }

  private zoom(): number {
    return this.fitScale > 0 ? this.camera.scale / this.fitScale : 1;
  }

  private ctx(c: HTMLCanvasElement, layoutSpace: boolean): CanvasRenderingContext2D {
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    if (layoutSpace) {
      const s = this.camera.scale * this.dpr;
      g.setTransform(s, 0, 0, s, this.camera.tx * this.dpr, this.camera.ty * this.dpr);
    }
    return g;
  }

  private drawBase() {
    const p = this.palette;
    const g = this.ctx(this.base, false);
    g.fillStyle = p.background;
    g.fillRect(0, 0, this.base.width, this.base.height);
    const paths = this.paths;
    if (!paths) return;
    const s = this.camera.scale * this.dpr;
    g.setTransform(s, 0, 0, s, this.camera.tx * this.dpr, this.camera.ty * this.dpr);
    const px = 1 / this.camera.scale; // one CSS pixel in layout units
    const z = this.zoom();

    // Coast: stroke every state wide, then fill land over it. Shared borders are
    // covered from both sides; only the outer edge keeps its line.
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = p.coast;
    g.lineWidth = 1.6 * px;
    g.stroke(paths.land);
    g.fillStyle = p.land;
    g.fill(paths.land);
    g.strokeStyle = p.stateLine;
    g.lineWidth = 0.7 * px;
    g.stroke(paths.land);
    g.fillStyle = p.lake;
    g.fill(paths.lakes, 'evenodd');

    // Rivers: tributaries fade in with zoom; the hierarchy is the texture.
    // The trunk rivers are the composition: on big screens they widen with
    // the screen while tributaries stay hairlines, so the hierarchy reads
    // from across a room.
    const big = Math.max(1, Math.min(2, this.screenScale()));
    const widthFor = (order: number) =>
      order >= 7 ? 2.3 * big : order >= 6 ? 1.5 * big : order >= 5 ? 0.95 * Math.sqrt(big) : order >= 4 ? 0.7 : 0.55;
    const zoomBoost = Math.min(1.8, 1 + Math.log2(Math.max(1, z)) * 0.25);
    g.strokeStyle = p.river;
    if (z >= 2.2) {
      const fadeIn = Math.min(1, (z - 2.2) / 1.5);
      for (const [order, path] of [...paths.detail.entries()].sort((a, b) => a[0] - b[0])) {
        g.globalAlpha = p.riverAlpha[order] * fadeIn;
        g.lineWidth = widthFor(order) * zoomBoost * px;
        g.stroke(path);
      }
    }
    if (p.riverGlow > 0) {
      // Wall: a soft underglow on the trunk rivers lifts the network above land.
      for (const [order, path] of paths.rivers) {
        if (order < 6) continue;
        g.globalAlpha = p.riverGlow;
        g.lineWidth = widthFor(order) * zoomBoost * 4 * px;
        g.stroke(path);
      }
    }
    for (const [order, path] of [...paths.rivers.entries()].sort((a, b) => a[0] - b[0])) {
      g.globalAlpha = p.riverAlpha[Math.min(order, 7)];
      g.lineWidth = widthFor(order) * zoomBoost * px;
      g.stroke(path);
    }
    g.globalAlpha = 1;

    // State labels: Explore only, and only once zoomed to regional scale.
    if (this.showLabels && z >= 2.2) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.font = this.labelFont;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = p.labelHalo;
      g.fillStyle = p.label;
      g.scale(this.dpr, this.dpr);
      for (const l of paths.labels) {
        const sx = l.x * this.camera.scale + this.camera.tx;
        const sy = l.y * this.camera.scale + this.camera.ty;
        if (sx < -20 || sy < -20 || sx > this.vp.width + 20 || sy > this.vp.height + 20) continue;
        g.strokeText(l.code, sx, sy);
        g.fillText(l.code, sx, sy);
      }
    }
  }

  /** Room-distance factor: phones 0.6, a 760 px screen 1, a TV up to 2.2. */
  private screenScale(): number {
    return Math.max(0.6, Math.min(2.2, Math.min(this.vp.width, this.vp.height) / 760));
  }

  /** Mark radius multiplier: grows with zoom, and with the screen for room-distance viewing. */
  private markScale(): number {
    const z = this.zoom();
    // Phones get smaller marks than desktop (floor 0.6): at desktop size the
    // dense eastern network merged into one carpet on a 390 px screen.
    const screen = Math.max(0.6, Math.min(2.2, Math.min(this.vp.width, this.vp.height) / 760));
    return screen * Math.min(2.6, 1 + Math.log2(Math.max(1, z)) * 0.5);
  }

  private sprite(style: MarkStyle, radius: number): Sprite {
    const r = Math.max(0.6, Math.round(radius * 4) / 4);
    const color = resolveColor(this.palette, style.color);
    const backed = this.palette.backed.includes(style.color);
    const halo = style.halo ? this.palette.halo : null;
    const key = `${style.shape}|${color}|${style.keyline ? 1 : 0}|${backed ? 1 : 0}|${halo}|${r}|${this.dpr}`;
    const hit = this.sprites.get(key);
    if (hit) return hit;
    const keyline = style.color.startsWith('flood') ? this.palette.floodKeyline : this.palette.flowKeyline;
    const pad = style.halo ? 4 : 2.5;
    const half = Math.ceil((r + pad) * this.dpr);
    const c = document.createElement('canvas');
    c.width = c.height = half * 2;
    const g = c.getContext('2d')!;
    g.translate(half, half);
    g.scale(this.dpr, this.dpr);
    if (halo) {
      shapePath(g, style.shape, r + 2.2);
      g.fillStyle = halo;
      g.fill();
    }
    drawMarkShape(g, style, r, color, keyline, backed ? this.palette.backing : null, this.palette.backedFillAlpha);
    const sprite = { canvas: c, half };
    this.sprites.set(key, sprite);
    return sprite;
  }

  private drawMarks(target: HTMLCanvasElement) {
    const g = this.ctx(target, false);
    const z = this.zoom();
    const k = this.markScale();
    const { scale, tx, ty } = this.camera;
    const w = this.vp.width;
    const h = this.vp.height;
    for (const m of this.marks) {
      if (z < m.style.minZoom) continue;
      const sx = m.x * scale + tx;
      const sy = m.y * scale + ty;
      if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) continue;
      const sp = this.sprite(m.style, m.style.radius * k);
      g.globalAlpha = m.style.alpha ?? 1;
      g.drawImage(sp.canvas, Math.round(sx * this.dpr) - sp.half, Math.round(sy * this.dpr) - sp.half);
    }
    g.globalAlpha = 1;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const ring = (pt: { x: number; y: number }, r: number, width: number) => {
      g.beginPath();
      g.arc(pt.x * scale + tx, pt.y * scale + ty, r, 0, Math.PI * 2);
      g.strokeStyle = this.palette.selection;
      g.lineWidth = width;
      g.stroke();
    };
    if (this.featured && !(this.motion && this.dataLive)) ring(this.featured, 9 * Math.min(1.6, k), 1.5);
    if (this.selected) ring(this.selected, 8 * Math.min(1.6, k), 2);
  }

  private drawFx(t: number) {
    const g = this.ctx(this.fx, false);
    if (!this.paths || !this.motion || !this.dataLive) return;
    const p = this.palette;
    const z = this.zoom();
    const { scale, tx, ty } = this.camera;

    // Downstream traces: sparse light dashes travelling the digitized
    // direction of major channels. Direction only — never a measured velocity.
    const s = scale * this.dpr;
    g.setTransform(s, 0, 0, s, tx * this.dpr, ty * this.dpr);
    const px = 1 / scale;
    const sf = this.screenScale();
    const zf = Math.min(1.8, 1 + Math.log2(Math.max(1, z)) * 0.25);
    g.strokeStyle = p.trace;
    g.lineCap = 'round';
    for (const c of TRACE_CLASSES) {
      // The wall runs every class at the national fit: the moving network is
      // the background texture there, not the routine gauges.
      if (z < c.minZoom && !this.wall) continue;
      g.lineWidth = c.width * sf * zf * px;
      g.setLineDash([c.dash * sf * px, c.gap * sf * px]);
      g.lineDashOffset = -((t / 1000) * c.speed * sf) * px;
      g.globalAlpha = this.wall ? Math.min(1, c.alpha * 1.15) : c.alpha;
      g.stroke(this.paths[c.key]);
    }
    g.setLineDash([]);
    g.globalAlpha = 1;

    // Event rings: slow, low-amplitude expansion on current flood gauges only.
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const k = this.markScale();
    for (const m of this.ringMarks) {
      const sx = m.x * scale + tx;
      const sy = m.y * scale + ty;
      if (sx < -60 || sy < -60 || sx > this.vp.width + 60 || sy > this.vp.height + 60) continue;
      const r0 = m.style.radius * k;
      g.strokeStyle = resolveColor(p, m.style.color);
      // Wall: wider, brighter pulses; major flooding carries two, half a
      // period apart, so the most severe events are never between beats.
      const reach = (this.wall ? 24 : 11) * Math.min(1.6, k);
      const pulses = this.wall && m.style.salience >= 9 ? 2 : 1;
      for (let n = 0; n < pulses; n++) {
        const phase = ((t / RING_PERIOD_MS + m.phase + n / pulses) % 1 + 1) % 1;
        g.beginPath();
        g.arc(sx, sy, r0 + phase * reach, 0, Math.PI * 2);
        g.globalAlpha = (1 - phase) * (this.wall ? 0.75 : 0.55);
        g.lineWidth = this.wall ? 2 * Math.min(1.6, Math.max(1, k * 0.7)) : 1.2;
        g.stroke();
      }
    }
    g.globalAlpha = 1;

    // The spotlight: a slow breathing ring on the current highlight. When it
    // moves, a wide ring sweeps in to the new place while the old one fades —
    // emphasis travels; the camera never does.
    if (this.featured) {
      const since = t - this.featuredSince;
      const arrive = Math.max(0, Math.min(1, since / SPOT_ARRIVE_MS));
      const ease = 1 - (1 - arrive) ** 3;
      const base = 11 * Math.min(1.8, k);
      const fx = this.featured.x * scale + tx;
      const fy = this.featured.y * scale + ty;
      const breathe = Math.sin(t / 1300) * 1.6 * Math.min(1.8, k);
      g.strokeStyle = p.selection;
      g.lineWidth = 2 * Math.min(1.6, Math.max(1, k * 0.8));
      g.globalAlpha = 0.85 * ease;
      g.beginPath();
      g.arc(fx, fy, base + breathe + (1 - ease) * base * 4, 0, Math.PI * 2);
      g.stroke();
      if (this.featuredPrev && arrive < 1) {
        g.globalAlpha = 0.85 * (1 - ease);
        g.beginPath();
        g.arc(this.featuredPrev.x * scale + tx, this.featuredPrev.y * scale + ty, base * (1 + ease * 0.6), 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }
}

/**
 * One mark, centred at the origin. Shared by the canvas sprites and nothing
 * else on purpose — the legend's SVG symbols mirror these rules in Legend.tsx.
 *   * backed: a neutral disc behind a fill that is invisible on this theme's
 *     land; the fill keeps its canonical colour and reads against the disc.
 *   * ring + keyline: an outer keyline under the ring (action stage on parchment).
 */
function drawMarkShape(
  g: CanvasRenderingContext2D,
  style: MarkStyle,
  r: number,
  color: string,
  keyline: string,
  backing: string | null,
  backedFillAlpha = 1,
) {
  if (style.shape === 'cross') {
    // Unavailable data: a small ×, never a fill and never a ring.
    const a = r * 0.85;
    g.beginPath();
    g.moveTo(-a, -a);
    g.lineTo(a, a);
    g.moveTo(a, -a);
    g.lineTo(-a, a);
    g.strokeStyle = color;
    g.lineWidth = Math.max(0.7, r * 0.42);
    g.lineCap = 'round';
    g.stroke();
    return;
  }
  if (style.shape === 'ring') {
    const w = Math.max(0.75, r * 0.4);
    shapePath(g, style.shape, r);
    if (style.keyline) {
      g.strokeStyle = keyline;
      g.lineWidth = w + 1.2;
      g.stroke();
    }
    g.strokeStyle = color;
    g.lineWidth = w;
    g.stroke();
    return;
  }
  if (backing) {
    shapePath(g, style.shape, r + 0.7);
    g.fillStyle = backing;
    g.fill();
  }
  shapePath(g, style.shape, r);
  g.fillStyle = color;
  if (backing) g.globalAlpha = backedFillAlpha;
  g.fill();
  g.globalAlpha = 1;
  if (style.keyline && !backing) {
    g.strokeStyle = keyline;
    // Hairline on the smallest marks: enough edge for 3:1, not so much that
    // a field of quiet Normal dots turns grey.
    g.lineWidth = r < 1.2 ? 0.4 : r < 2 ? 0.6 : 0.85;
    g.stroke();
  }
}

function shapePath(g: CanvasRenderingContext2D, shape: MarkShape, r: number) {
  g.beginPath();
  switch (shape) {
    case 'diamond':
      g.moveTo(0, -r * 1.15);
      g.lineTo(r * 1.15, 0);
      g.lineTo(0, r * 1.15);
      g.lineTo(-r * 1.15, 0);
      g.closePath();
      break;
    case 'triangle':
      g.moveTo(0, -r * 1.2);
      g.lineTo(r * 1.1, r * 0.8);
      g.lineTo(-r * 1.1, r * 0.8);
      g.closePath();
      break;
    default:
      g.arc(0, 0, r, 0, Math.PI * 2);
  }
}
