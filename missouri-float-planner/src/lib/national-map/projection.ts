// src/lib/national-map/projection.ts
// The national River Map's composite projection: the lower 48 in Albers
// equal-area, with Alaska and Hawaii in stable insets.
//
// ── Why not d3's geoAlbersUsa ──────────────────────────────────────────────
// The parameters below ARE geoAlbersUsa's (same parallels, rotations, centers,
// inset scales and offsets), so the composition looks like the national map
// people already recognize. What differs is how a point picks its inset:
//   * d3 routes by clip rectangles, which drops the western Aleutians — they
//     sit outside its Alaska clip box. The plan requires Alaska to keep its
//     real geometry, so here a point routes by GEOGRAPHY (see componentOf)
//     and nothing is clipped.
//   * The antimeridian needs no special case: Alaska's rotation (154°) maps
//     172°E to -34° and 179°W to -25°, one continuous range, so the Aleutians
//     project as one chain instead of tearing across the frame.
// It is ~40 lines of arithmetic, which is cheaper than a dependency the build
// script, the API and the browser renderer would all have to agree on.
//
// Pure, no imports: the geometry build script (tsx), the frame route (Next)
// and the canvas renderer (browser) must project identically, and the test
// suite pins the numbers.

export type MapComponent = 'l48' | 'ak' | 'hi';

const RAD = Math.PI / 180;

interface ConicParams {
  /** Rotation of λ, in degrees (d3 `rotate([r, 0])`). */
  rotate: number;
  /** Projection center in ROTATED degrees (d3 `center`). */
  center: [number, number];
  parallels: [number, number];
  /** Scale multiplier on the composite scale k. */
  scale: number;
  /** Offset of this component's center from the composite origin, in units of k. */
  offset: [number, number];
}

/** geoAlbersUsa's three components. */
const COMPONENTS: Record<MapComponent, ConicParams> = {
  l48: { rotate: 96, center: [-0.6, 38.7], parallels: [29.5, 45.5], scale: 1, offset: [0, 0] },
  ak: { rotate: 154, center: [-2, 58.5], parallels: [55, 65], scale: 0.35, offset: [-0.307, 0.201] },
  hi: { rotate: 157, center: [-3, 19.9], parallels: [8, 18], scale: 1, offset: [-0.205, 0.212] },
};

/** Each inset's scale relative to the lower 48 (Alaska is drawn at 0.35). */
export const COMPONENT_SCALE: Record<MapComponent, number> = {
  l48: COMPONENTS.l48.scale,
  ak: COMPONENTS.ak.scale,
  hi: COMPONENTS.hi.scale,
};

/**
 * geoAlbersUsa's default scale and translate. The landscape frame is therefore
 * the familiar ~960×500 composition; the renderer fits it to any viewport.
 */
export const COMPOSITE_SCALE = 1070;
export const COMPOSITE_ORIGIN: [number, number] = [480, 250];

interface Raw {
  n: number;
  c: number;
  r0: number;
  cx: number;
  cy: number;
}

function conicRaw(p: ConicParams): Raw {
  const sy0 = Math.sin(p.parallels[0] * RAD);
  const n = (sy0 + Math.sin(p.parallels[1] * RAD)) / 2;
  const c = 1 + sy0 * (2 * n - sy0);
  const r0 = Math.sqrt(c) / n;
  const raw = { n, c, r0, cx: 0, cy: 0 };
  const [cx, cy] = forwardRaw(raw, p.center[0] * RAD, p.center[1] * RAD);
  raw.cx = cx;
  raw.cy = cy;
  return raw;
}

function forwardRaw(raw: Raw, lambda: number, phi: number): [number, number] {
  const r = Math.sqrt(Math.max(0, raw.c - 2 * raw.n * Math.sin(phi))) / raw.n;
  return [r * Math.sin(lambda * raw.n), raw.r0 - r * Math.cos(lambda * raw.n)];
}

const RAWS: Record<MapComponent, Raw> = {
  l48: conicRaw(COMPONENTS.l48),
  ak: conicRaw(COMPONENTS.ak),
  hi: conicRaw(COMPONENTS.hi),
};

/** Wrap degrees into [-180, 180). */
function wrap(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * Which inset a coordinate belongs to, by geography rather than by clip box.
 *
 * Alaska: north of 50.5° and either west of 129.5°W (the panhandle's eastern
 * edge is ~130°W) or east of 165°E (the western Aleutians). Hawaii: the main
 * islands' box. Everything else is the lower 48 — including DC and the few
 * border stations whose metadata carries no state.
 */
export function componentOf(lng: number, lat: number): MapComponent {
  if (lat > 50.5 && (lng < -129.5 || lng > 165)) return 'ak';
  if (lat > 18 && lat < 23.5 && lng > -161 && lng < -154) return 'hi';
  return 'l48';
}

/** Project into the landscape composite frame (y down, ~960×500). */
export function projectComponent(
  component: MapComponent,
  lng: number,
  lat: number,
): [number, number] {
  const p = COMPONENTS[component];
  const raw = RAWS[component];
  const [x, y] = forwardRaw(raw, wrap(lng + p.rotate) * RAD, lat * RAD);
  const k = COMPOSITE_SCALE * p.scale;
  const tx = COMPOSITE_ORIGIN[0] + p.offset[0] * COMPOSITE_SCALE;
  const ty = COMPOSITE_ORIGIN[1] + p.offset[1] * COMPOSITE_SCALE;
  return [tx + k * (x - raw.cx), ty - k * (y - raw.cy)];
}

export function project(lng: number, lat: number): [number, number] {
  return projectComponent(componentOf(lng, lat), lng, lat);
}

/** Landscape-frame point → [lng, lat] within a known component (d3's conicEqualAreaRaw.invert). */
export function invertComponent(component: MapComponent, fx: number, fy: number): [number, number] {
  const p = COMPONENTS[component];
  const raw = RAWS[component];
  const k = COMPOSITE_SCALE * p.scale;
  const tx = COMPOSITE_ORIGIN[0] + p.offset[0] * COMPOSITE_SCALE;
  const ty = COMPOSITE_ORIGIN[1] + p.offset[1] * COMPOSITE_SCALE;
  const x = (fx - tx) / k + raw.cx;
  const y = -(fy - ty) / k + raw.cy;
  const r0y = raw.r0 - y;
  let l = Math.atan2(x, Math.abs(r0y)) * Math.sign(r0y);
  if (r0y * raw.n < 0) l -= Math.PI * Math.sign(x) * Math.sign(r0y);
  const s = (raw.c - (x * x + r0y * r0y) * raw.n * raw.n) / (2 * raw.n);
  const lambda = l / raw.n;
  const phi = Math.asin(Math.max(-1, Math.min(1, s)));
  return [wrap(lambda / RAD - p.rotate), phi / RAD];
}

// ── Layouts ─────────────────────────────────────────────────────────────────
// Everything is stored in the landscape frame. A layout is one affine per
// component (uniform scale + offset), so portrait can move the insets under
// the lower 48 without re-projecting or stretching any geography.

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Affine {
  s: number;
  dx: number;
  dy: number;
}

export type LayoutKind = 'landscape' | 'portrait' | 'wall';

export interface Layout {
  kind: LayoutKind;
  affine: Record<MapComponent, Affine>;
  /** The composed frame every camera fit targets. */
  bounds: Bounds;
  /** Each component's laid-out bounds (where an inset sits in this layout). */
  parts: Record<MapComponent, Bounds>;
}

/**
 * Which component a laid-out point belongs to, and where it is in the
 * landscape (projected) frame. This — not the layout point — is what names a
 * PLACE: the wall moves and enlarges the insets, so the same layout point is
 * a different place in another layout (a centred Anchorage view once landed
 * near Fairbanks). Insets are tested first; the lower 48 is the default.
 */
export function locate(layout: Layout, lx: number, ly: number): { component: MapComponent; x: number; y: number } {
  let component: MapComponent = 'l48';
  for (const c of ['ak', 'hi'] as MapComponent[]) {
    const b = layout.parts[c];
    if (lx >= b.minX && lx <= b.maxX && ly >= b.minY && ly <= b.maxY) component = c;
  }
  const a = layout.affine[component];
  return { component, x: (lx - a.dx) / a.s, y: (ly - a.dy) / a.s };
}

const IDENTITY: Affine = { s: 1, dx: 0, dy: 0 };

export function applyAffine(a: Affine, x: number, y: number): [number, number] {
  return [x * a.s + a.dx, y * a.s + a.dy];
}

function affineBounds(a: Affine, b: Bounds): Bounds {
  const [minX, minY] = applyAffine(a, b.minX, b.minY);
  const [maxX, maxY] = applyAffine(a, b.maxX, b.maxY);
  return { minX, minY, maxX, maxY };
}

function union(list: Bounds[]): Bounds {
  return {
    minX: Math.min(...list.map((b) => b.minX)),
    minY: Math.min(...list.map((b) => b.minY)),
    maxX: Math.max(...list.map((b) => b.maxX)),
    maxY: Math.max(...list.map((b) => b.maxY)),
  };
}

/** Viewports at least this wide-for-their-height get the landscape composition. */
export const PORTRAIT_BELOW_ASPECT = 1.05;

export function layoutKindFor(width: number, height: number): LayoutKind {
  return height > 0 && width / height < PORTRAIT_BELOW_ASPECT ? 'portrait' : 'landscape';
}

/**
 * Build a layout from each component's landscape-frame bounds (the geometry
 * asset ships them, so a layout never has to scan coordinates).
 *
 * Portrait: the lower 48 on top; Alaska and Hawaii side by side beneath it,
 * scaled together so the pair spans the lower 48's width. Their relative size
 * stays geoAlbersUsa's — only position and a shared scale change.
 */
/** Wall display: Alaska and Hawaii enlarged so they read across a room. */
export const WALL_AK_SCALE = 1.3;
export const WALL_HI_SCALE = 1.25;

export function buildLayout(kind: LayoutKind, componentBounds: Record<MapComponent, Bounds>): Layout {
  if (kind === 'wall') {
    // The landscape composition, with the insets enlarged and set into the
    // Pacific / Gulf corner below the Southwest — still separate, still in
    // proper geometry, now large enough to be seen on a TV. Offsets are
    // relative to the lower 48's bounds so a geometry rebuild keeps them.
    const l48 = componentBounds.l48;
    const ak = componentBounds.ak;
    const hi = componentBounds.hi;
    const w = l48.maxX - l48.minX;
    const akRight = l48.minX + w * 0.21;
    const akTop = l48.maxY - (l48.maxY - l48.minY) * 0.215;
    const akA: Affine = { s: WALL_AK_SCALE, dx: akRight - ak.maxX * WALL_AK_SCALE, dy: akTop - ak.minY * WALL_AK_SCALE };
    const akBottom = akTop + (ak.maxY - ak.minY) * WALL_AK_SCALE;
    const hiLeft = akRight + w * 0.017;
    const hiA: Affine = {
      s: WALL_HI_SCALE,
      dx: hiLeft - hi.minX * WALL_HI_SCALE,
      dy: akBottom - (hi.maxY - hi.minY) * WALL_HI_SCALE - hi.minY * WALL_HI_SCALE,
    };
    const affine = { l48: IDENTITY, ak: akA, hi: hiA };
    const parts = { l48, ak: affineBounds(akA, ak), hi: affineBounds(hiA, hi) };
    return { kind, affine, bounds: union(Object.values(parts)), parts };
  }
  if (kind === 'landscape') {
    const affine = { l48: IDENTITY, ak: IDENTITY, hi: IDENTITY };
    return { kind, affine, bounds: union(Object.values(componentBounds)), parts: { ...componentBounds } };
  }
  const l48 = componentBounds.l48;
  const ak = componentBounds.ak;
  const hi = componentBounds.hi;
  const width = l48.maxX - l48.minX;
  const akW = ak.maxX - ak.minX;
  const hiW = hi.maxX - hi.minX;
  const gap = width * 0.04;
  const s = (width - gap) / (akW + hiW);
  const top = l48.maxY + gap;
  const akA: Affine = { s, dx: l48.minX - ak.minX * s, dy: top - ak.minY * s };
  const akBottom = top + (ak.maxY - ak.minY) * s;
  const hiH = (hi.maxY - hi.minY) * s;
  // Hawaii sits level with Alaska's lower half — its islands are small, and
  // floating them at the top of the row leaves a hole under them.
  const hiA: Affine = {
    s,
    dx: l48.minX + akW * s + gap - hi.minX * s,
    dy: akBottom - hiH - hi.minY * s,
  };
  const affine = { l48: IDENTITY, ak: akA, hi: hiA };
  const parts = { l48, ak: affineBounds(akA, ak), hi: affineBounds(hiA, hi) };
  return { kind, affine, bounds: union(Object.values(parts)), parts };
}
