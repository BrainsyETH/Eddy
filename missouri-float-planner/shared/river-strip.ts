/**
 * River strip: one river drawn as a ribbon, with the floats a search found
 * marked along it, each by a numbered callout matching its card.
 *
 * Pure geometry, like chart-geometry.ts: no browser, React or native code, so
 * the web Find a Float results and, later, the iOS app draw the same strip.
 *
 * River miles are to scale along x. The bends are NOT the river's real shape:
 * y is a few summed sine waves seeded from the river's slug, so each river keeps
 * one recognisable wiggle while the mile positions stay true. Say so wherever
 * the strip is shown.
 *
 * Vertical bands, top to bottom: callout lanes, the ribbon with its names above
 * and below, then more callout lanes when one row cannot hold every number.
 * Callouts never share a tap area with each other or with the end flags, which
 * sit on the ribbon, outside every lane.
 */

export interface RiverStripPoint {
  id: string;
  name: string;
  mile: number;
  /** False for places on the water that are not launches (AccessPoint.isFloatEndpoint). */
  endpoint: boolean;
}

export interface RiverStripRoute {
  id: string;
  /** The number shown on the strip and on the route's card. */
  number: number;
  putInId: string;
  takeOutId: string;
}

/** 'all' fits every route the search found; 'stretch' frames the selected one. */
export type RiverStripView = 'all' | 'stretch';

export interface RiverStripInput {
  /** Seeds the bends; the river slug, so a river always has the same shape. */
  seedKey: string;
  points: readonly RiverStripPoint[];
  routes: readonly RiverStripRoute[];
  selectedId: string | null;
  hoveredId?: string | null;
  /** 'stretch' without a placeable selection falls back to 'all'. */
  view: RiverStripView;
  width: number;
  /** Narrow screens: tighter margins, a thinner ribbon, fewer names. */
  compact?: boolean;
}

export type RouteState = 'selected' | 'hovered' | 'other';

export interface StripRoute {
  id: string;
  number: number;
  state: RouteState;
  path: string;
  putIn: { id: string; name: string; mile: number; x: number; y: number };
  takeOut: { id: string; name: string; mile: number; x: number; y: number };
  miles: number;
}

export interface StripCallout {
  id: string;
  number: number;
  state: RouteState;
  /** Centre of the number and of its square tap area (CALLOUT_SIZE). */
  x: number;
  y: number;
  /** Where the connector meets the route on the ribbon. */
  anchor: { x: number; y: number };
  /** The connector's end at the callout's rim. */
  from: { x: number; y: number };
}

export interface StripDot {
  id: string;
  name: string;
  mile: number;
  x: number;
  y: number;
  endpoint: boolean;
}

export interface StripLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  emphasis: 'selected' | 'route' | 'other';
}

export interface Box { x0: number; x1: number; y0: number; y1: number }

export interface StripFlag {
  x: number;
  y: number;
  at: { x: number; y: number };
}

export interface RiverStripLayout {
  domain: { start: number; end: number };
  view: RiverStripView;
  window: { start: number; end: number };
  width: number;
  height: number;
  river: string;
  /** Routes in view, in draw order: others, then the selected, then the hovered on top. */
  routes: StripRoute[];
  callouts: StripCallout[];
  /**
   * The selected route's ends, drawn as flags; null without a selection in view.
   * `at` is the true river position. When a short float's flags would overlap,
   * they are drawn apart (x, y) and `offset` asks for a connector to `at`.
   */
  flags: { putIn: StripFlag; takeOut: StripFlag; offset: boolean } | null;
  /** Access points in view, minus the selected route's two ends. */
  dots: StripDot[];
  labels: StripLabel[];
  ticks: { mile: number; x: number }[];
  /** Fractions of the whole river, for the small overview bar. */
  overview: {
    routes: { id: string; start: number; end: number; selected: boolean }[];
    window: { start: number; end: number };
  };
}

/** Behind the strip's ⓘ: Find a Float puts no explainer copy on the surface. */
export const RIVER_STRIP_INFO = [
  'Each float sits at its real place on the river: river miles are to scale.',
  'The bends are drawn for illustration, not traced from the river.',
];

/** A callout's tap area: square, the minimum touch target. */
export const CALLOUT_SIZE = 44;
/** An end flag's drawn size; its keep-clear box adds FLAG_MARGIN. */
export const FLAG_SIZE = 32;
const FLAG_MARGIN = 4;
/** Flag centres at least this far apart: neither flag's keep-clear box covers the other. */
const FLAG_PITCH = FLAG_SIZE + 2 * FLAG_MARGIN;
/** Centre-to-centre spacing of callouts in a lane: tap areas plus a gutter. */
const CALLOUT_PITCH = CALLOUT_SIZE + 4;
const LANE = CALLOUT_SIZE;
/** Ribbon centreline swing (max), name offset from it, and half a name's line box. */
const SWING = 22;
const NAME_OFFSET = { selected: 30, other: 26 };
const LABEL_HALF_HEIGHT = 10;
/** Half the band the ribbon and its names need. */
const HALF_BAND = SWING + NAME_OFFSET.selected + LABEL_HALF_HEIGHT;
const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100];

/** A stable phase in [0, 2π) from a string. */
export function riverStripSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 6283) / 1000;
}

/**
 * The routes the strip can draw: both ends among the river's access points and
 * the take-out downstream of the put-in. Anything else is data the strip cannot
 * place honestly, so callers must not offer "show on the river" for it.
 */
export function riverStripPlaceable(points: readonly RiverStripPoint[], routes: readonly RiverStripRoute[]): Set<string> {
  const mile = new Map(points.filter((p) => Number.isFinite(p.mile)).map((p) => [p.id, p.mile]));
  return new Set(
    routes
      .filter((r) => {
        const put = mile.get(r.putInId);
        const take = mile.get(r.takeOutId);
        return put !== undefined && take !== undefined && take > put;
      })
      .map((r) => r.id),
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const box = (cx: number, cy: number, halfW: number, halfH: number): Box => ({ x0: cx - halfW, x1: cx + halfW, y0: cy - halfH, y1: cy + halfH });
export const boxesOverlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function riverStripLayout(input: RiverStripInput): RiverStripLayout | null {
  const { width, compact = false } = input;
  const points = [...input.points].filter((p) => Number.isFinite(p.mile)).sort((a, b) => a.mile - b.mile);
  if (points.length < 2 || width <= CALLOUT_SIZE * 2) return null;
  const domain = { start: points[0].mile, end: points[points.length - 1].mile };
  if (!(domain.end > domain.start)) return null;

  const placeable = riverStripPlaceable(points, input.routes);
  const byId = new Map(points.map((p) => [p.id, p]));
  const resolved = input.routes
    .filter((r) => placeable.has(r.id))
    .map((r) => ({ ...r, put: byId.get(r.putInId)!, take: byId.get(r.takeOutId)! }));
  if (resolved.length === 0) return null;
  const selected = resolved.find((r) => r.id === input.selectedId) ?? null;
  const hovered = resolved.find((r) => r.id === input.hoveredId && r !== selected) ?? null;
  const view: RiverStripView = input.view === 'stretch' && selected ? 'stretch' : 'all';

  // The window: the selected float with room either side, or every float found.
  const lo = view === 'stretch' ? selected!.put.mile : Math.min(...resolved.map((r) => r.put.mile));
  const hi = view === 'stretch' ? selected!.take.mile : Math.max(...resolved.map((r) => r.take.mile));
  const pad = view === 'stretch' ? Math.max((hi - lo) * 0.35, 2) : Math.max((hi - lo) * 0.06, 1.5);
  let a = Math.max(domain.start, lo - pad);
  let b = Math.min(domain.end, hi + pad);
  if (b - a < 2) {
    const c = (a + b) / 2;
    a = Math.max(domain.start, c - 1);
    b = Math.min(domain.end, c + 1);
  }

  const padX = compact ? 22 : 40;
  const ppm = (width - 2 * padX) / (b - a);
  const x = (m: number) => padX + (m - a) * ppm;

  // Callouts first: how many lanes they need sets the strip's height.
  const inView = resolved
    .map((r) => {
      const start = Math.max(r.put.mile, a);
      const end = Math.min(r.take.mile, b);
      return end > start ? { r, anchorMile: (start + end) / 2 } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((m, n) => m.anchorMile - n.anchorMile || m.r.number - n.r.number);
  const perLane = Math.max(1, Math.floor((width - CALLOUT_SIZE) / CALLOUT_PITCH) + 1);
  const laneCount = Math.max(1, Math.ceil(inView.length / perLane));
  const topLanes = Math.ceil(laneCount / 2);
  const bottomLanes = laneCount - topLanes;
  const bandTop = topLanes * LANE;
  const mid = bandTop + HALF_BAND;
  const height = bandTop + 2 * HALF_BAND + bottomLanes * LANE;
  // Lanes alternate top, bottom, top, … with the first of each side nearest the ribbon.
  const laneY = (j: number) => {
    const k = Math.floor(j / 2);
    return j % 2 === 0 ? bandTop - LANE / 2 - k * LANE : bandTop + 2 * HALF_BAND + LANE / 2 + k * LANE;
  };

  const seed = riverStripSeed(input.seedKey);
  // Detail fades in as miles get wider, so a long river does not turn to noise.
  const midDetail = clamp((ppm - 3) / 10, 0, 1);
  const fine = clamp((ppm - 8) / 30, 0, 1);
  const y = (m: number) =>
    mid + 13 * Math.sin(m * 0.157 + seed) + 6 * midDetail * Math.sin(m * 0.9 + seed * 2.3) + 3 * fine * Math.sin(m * 3.9 + seed * 4.1);
  const line = (m0: number, m1: number) => {
    const n = Math.max(8, Math.round(((m1 - m0) * ppm) / 4));
    let d = '';
    for (let i = 0; i <= n; i++) {
      const m = m0 + ((m1 - m0) * i) / n;
      d += `${i ? 'L' : 'M'}${round(x(m))},${round(y(m))}`;
    }
    return d;
  };
  // River past the frame keeps the ribbon running out of a zoomed view.
  const overrun = padX / ppm;
  const visible = (m: number) => m >= a - 1e-6 && m <= b + 1e-6;
  const stateOf = (r: { id: string }): RouteState => (r === selected ? 'selected' : r === hovered ? 'hovered' : 'other');

  const lanes: (typeof inView)[] = Array.from({ length: laneCount }, () => []);
  inView.forEach((c, i) => lanes[i % laneCount].push(c));
  const callouts: StripCallout[] = lanes.flatMap((lane, j) => {
    const xs = spread(lane.map((c) => x(c.anchorMile)), CALLOUT_SIZE / 2, width - CALLOUT_SIZE / 2, CALLOUT_PITCH);
    const cy = laneY(j);
    const above = j % 2 === 0;
    return lane.map((c, i) => {
      const anchor = { x: round(x(c.anchorMile)), y: round(y(c.anchorMile)) };
      return {
        id: c.r.id,
        number: c.r.number,
        state: stateOf(c.r),
        x: round(xs[i]),
        y: round(cy),
        anchor,
        from: { x: round(xs[i]), y: round(cy + (above ? 1 : -1) * 14) },
      };
    });
  });

  const routes: StripRoute[] = resolved
    .filter((r) => r.take.mile > a && r.put.mile < b)
    .map((r) => ({
      id: r.id,
      number: r.number,
      state: stateOf(r),
      path: line(Math.max(r.put.mile, a - overrun), Math.min(r.take.mile, b + overrun)),
      putIn: { id: r.put.id, name: r.put.name, mile: r.put.mile, x: round(x(r.put.mile)), y: round(y(r.put.mile)) },
      takeOut: { id: r.take.id, name: r.take.name, mile: r.take.mile, x: round(x(r.take.mile)), y: round(y(r.take.mile)) },
      miles: round(r.take.mile - r.put.mile),
    }))
    .sort((m, n) => drawRank(m.state) - drawRank(n.state));

  const flags = selected && visible(selected.put.mile) && visible(selected.take.mile)
    ? endFlags(
      { x: x(selected.put.mile), y: y(selected.put.mile) },
      { x: x(selected.take.mile), y: y(selected.take.mile) },
      width,
    )
    : null;
  const flagged = new Set(flags && selected ? [selected.put.id, selected.take.id] : []);
  const shown = points.filter((p) => visible(p.mile));
  const dots: StripDot[] = shown
    .filter((p) => !flagged.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, mile: p.mile, x: round(x(p.mile)), y: round(y(p.mile)), endpoint: p.endpoint }));

  const flagHalf = FLAG_SIZE / 2 + FLAG_MARGIN;
  const flagBoxes = flags ? { put: box(flags.putIn.x, flags.putIn.y, flagHalf, flagHalf), take: box(flags.takeOut.x, flags.takeOut.y, flagHalf, flagHalf) } : null;
  const obstacles = [
    ...callouts.map((c) => box(c.x, c.y, CALLOUT_SIZE / 2, CALLOUT_SIZE / 2)),
    ...(flagBoxes ? [flagBoxes.put, flagBoxes.take] : []),
  ];
  const connectors = callouts.map((c) => [c.from, c.anchor] as const);
  const labels = placeLabels({
    points,
    shown,
    resolved,
    selected: flags ? selected : null,
    maxRank: compact && view === 'all' ? 1 : 3,
    obstacles,
    flagBoxes,
    connectors,
    x,
    y,
    width,
    charWidth: compact ? 6.6 : 7.2,
  });

  const target = compact ? 56 : 72;
  const step = TICK_STEPS.find((s) => s * ppm >= target) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: { mile: number; x: number }[] = [];
  for (let m = Math.ceil(a / step) * step; m <= b + 1e-6; m += step) ticks.push({ mile: m, x: round(x(m)) });

  const span = domain.end - domain.start;
  const frac = (m: number) => Math.round(((m - domain.start) / span) * 10000) / 10000;
  return {
    domain,
    view,
    window: { start: a, end: b },
    width,
    height,
    river: line(Math.max(domain.start, a - overrun), Math.min(domain.end, b + overrun)),
    routes,
    callouts,
    flags,
    dots,
    labels,
    ticks,
    overview: {
      routes: resolved.map((r) => ({ id: r.id, start: frac(r.put.mile), end: frac(r.take.mile), selected: r === selected })),
      window: { start: frac(a), end: frac(b) },
    },
  };
}

/**
 * Flags for the selected float's two ends. On a short float at a wide zoom the
 * true positions can sit closer than one flag; then the flags are pushed apart
 * along the river's axis, each keeping its true y, and marked `offset` so the
 * drawing joins each to its true point. Mile positions never move.
 */
function endFlags(put: { x: number; y: number }, take: { x: number; y: number }, width: number) {
  const half = FLAG_SIZE / 2;
  let px = put.x;
  let tx = take.x;
  const offset = tx - px < FLAG_PITCH;
  if (offset) {
    const push = (FLAG_PITCH - (tx - px)) / 2;
    px -= push;
    tx += push;
    if (px < half) { px = half; tx = half + FLAG_PITCH; }
    if (tx > width - half) { tx = width - half; px = tx - FLAG_PITCH; }
  }
  const flag = (cx: number, at: { x: number; y: number }): StripFlag => ({ x: round(cx), y: round(at.y), at: { x: round(at.x), y: round(at.y) } });
  return { putIn: flag(px, put), takeOut: flag(tx, take), offset };
}

function drawRank(state: RouteState) {
  return state === 'other' ? 0 : state === 'selected' ? 1 : 2;
}

/**
 * Centres as near their desired x as possible, at least `gap` apart, inside
 * [min, max]. Callers keep the count within what fits.
 */
function spread(desired: number[], min: number, max: number, gap: number): number[] {
  const xs = desired.map((d) => clamp(d, min, max));
  for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + gap);
  for (let i = xs.length - 1; i >= 0; i--) xs[i] = Math.min(xs[i], i === xs.length - 1 ? max : xs[i + 1] - gap);
  for (let i = 0; i < xs.length; i++) xs[i] = Math.max(xs[i], i === 0 ? min : xs[i - 1] + gap);
  return xs;
}

/** Does the segment p→q pass through the box? (Liang–Barsky clipping.) */
function segmentHitsBox(p: { x: number; y: number }, q: { x: number; y: number }, b: Box) {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const edges: [number, number][] = [[-dx, p.x - b.x0], [dx, b.x1 - p.x], [-dy, p.y - b.y0], [dy, b.y1 - p.y]];
  for (const [pk, qk] of edges) {
    if (pk === 0) {
      if (qk < 0) return false;
      continue;
    }
    const t = qk / pk;
    if (pk < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Names above and below the ribbon, most important first, dropping any that
 * would cover another name, a callout, a connector or a flag. The selected
 * route's ends are always named: put-in above and take-out below by default,
 * moving off the other flag when the two sit close together.
 */
function placeLabels(args: {
  points: RiverStripPoint[];
  shown: RiverStripPoint[];
  resolved: { id: string; put: RiverStripPoint; take: RiverStripPoint }[];
  selected: { put: RiverStripPoint; take: RiverStripPoint } | null;
  /** 0 selected ends, 1 other route ends, 2 other launches, 3 non-launch places. */
  maxRank: number;
  obstacles: Box[];
  flagBoxes: { put: Box; take: Box } | null;
  connectors: (readonly [{ x: number; y: number }, { x: number; y: number }])[];
  x: (m: number) => number;
  y: (m: number) => number;
  width: number;
  charWidth: number;
}): StripLabel[] {
  const { selected, x, y, width, charWidth } = args;
  const onRoute = new Set(args.resolved.flatMap((r) => [r.put.id, r.take.id]));
  // Alternate sides by position on the whole river, so a name keeps its side as the view zooms.
  const order = new Map(args.points.map((p, i) => [p.id, i]));
  const rankOf = (p: RiverStripPoint) =>
    selected && (p.id === selected.put.id || p.id === selected.take.id) ? 0 : onRoute.has(p.id) ? 1 : p.endpoint ? 2 : 3;
  const candidates = args.shown
    .map((p) => ({ p, rank: rankOf(p) }))
    .filter((c) => c.rank <= args.maxRank)
    .sort((m, n) => m.rank - n.rank || m.p.mile - n.p.mile);

  const taken: Box[] = [];
  const labels: StripLabel[] = [];
  for (const { p, rank } of candidates) {
    const halfW = (p.name.length * charWidth + 14) / 2;
    const at = (side: -1 | 1) => y(p.mile) + side * (rank === 0 ? NAME_OFFSET.selected : NAME_OFFSET.other);
    const place = (side: -1 | 1, cx: number) => box(clamp(cx, halfW, width - halfW), at(side), halfW, LABEL_HALF_HEIGHT);
    const clear = (b: Box, blockers: Box[], withConnectors: boolean) =>
      blockers.every((o) => !boxesOverlap(o, b)) && (!withConnectors || args.connectors.every(([from, to]) => !segmentHitsBox(from, to, b)));

    let chosen: Box | null = null;
    if (rank === 0) {
      // Always named. Put-in above, take-out below, centred on the flag; when
      // the other flag is in the way, try the other side, then lean the name
      // away from it (upstream for the put-in, downstream for the take-out).
      // Connectors are thin; only flags, callouts and names block here.
      const isPut = p.id === selected!.put.id;
      const home: -1 | 1 = isPut ? -1 : 1;
      const other = args.flagBoxes ? (isPut ? args.flagBoxes.take : args.flagBoxes.put) : null;
      // Its own flag sits exactly one name-offset away; only the other flag blocks.
      const own = args.flagBoxes ? (isPut ? args.flagBoxes.put : args.flagBoxes.take) : null;
      // Centre the name on the flag as drawn, which a crowded float may have moved.
      const fx = own ? (own.x0 + own.x1) / 2 : x(p.mile);
      const lean = !other ? fx
        : isPut ? Math.min(fx, other.x0 - halfW - 1) : Math.max(fx, other.x1 + halfW + 1);
      const blockers = [...taken, ...args.obstacles.filter((o) => o !== own)];
      const options = [place(home, fx), place(home === -1 ? 1 : -1, fx), place(home, lean)];
      chosen = options.find((b) => clear(b, blockers, false)) ?? options[0];
    } else {
      const preferred: -1 | 1 = (order.get(p.id) ?? 0) % 2 === 0 ? -1 : 1;
      chosen = [place(preferred, x(p.mile)), place(preferred === -1 ? 1 : -1, x(p.mile))]
        .find((b) => clear(b, [...taken, ...args.obstacles], true)) ?? null;
      if (!chosen) continue;
    }
    taken.push(chosen);
    labels.push({
      id: p.id,
      name: p.name,
      x: round((chosen.x0 + chosen.x1) / 2),
      y: round((chosen.y0 + chosen.y1) / 2),
      emphasis: rank === 0 ? 'selected' : rank === 1 ? 'route' : 'other',
    });
  }
  return labels;
}
