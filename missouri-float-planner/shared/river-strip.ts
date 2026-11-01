/**
 * River strip: one river drawn as a ribbon from its first access point to its
 * last, with the floats a search found marked along it.
 *
 * Pure geometry, like chart-geometry.ts: no browser, React or native code, so
 * the web Find a Float results and, later, the iOS app draw the same strip.
 *
 * River miles are to scale along x. The bends are NOT the river's real shape:
 * y is a few summed sine waves seeded from the river's slug, so each river keeps
 * one recognisable wiggle while the mile positions stay true. Say so wherever
 * the strip is shown.
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

export type RiverStripView = 'whole' | 'stretch';

export interface RiverStripInput {
  /** Seeds the bends; the river slug, so a river always has the same shape. */
  seedKey: string;
  points: readonly RiverStripPoint[];
  routes: readonly RiverStripRoute[];
  selectedId: string | null;
  hoveredId?: string | null;
  /** 'stretch' frames the selected route; without a selection it falls back to 'whole'. */
  view: RiverStripView;
  width: number;
  height: number;
  /**
   * Narrow screens: tighter margins, and on the whole-river view only the chosen
   * put-in and take-out are named, since a hundred miles across a phone leaves
   * no room for the rest.
   */
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
  /** Where the number sits, or null when the route's midpoint is out of view. */
  chip: { x: number; y: number } | null;
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

export interface RiverStripLayout {
  domain: { start: number; end: number };
  view: RiverStripView;
  window: { start: number; end: number };
  river: string;
  routes: StripRoute[];
  /** Access points in view, minus the selected route's two ends (drawn as flags). */
  dots: StripDot[];
  labels: StripLabel[];
  ticks: { mile: number; x: number }[];
  /** Fractions of the whole river, for the small overview bar. */
  overview: {
    routes: { id: string; start: number; end: number; selected: boolean }[];
    window: { start: number; end: number } | null;
  };
}

const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100];
/** Half a label's line box at 12–13px, plus a little air. */
const LABEL_HALF_HEIGHT = 10;

/** A stable phase in [0, 2π) from a string. */
export function riverStripSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 6283) / 1000;
}

/** Half the size of a route's number chip and of an end flag, with air. */
const CHIP_HALF = 16;
const FLAG_HALF = 18;

interface Box { x0: number; x1: number; y0: number; y1: number }
const box = (cx: number, cy: number, halfW: number, halfH: number): Box => ({ x0: cx - halfW, x1: cx + halfW, y0: cy - halfH, y1: cy + halfH });
const round = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function riverStripLayout(input: RiverStripInput): RiverStripLayout | null {
  const { width, height, compact = false } = input;
  const points = [...input.points]
    .filter((p) => Number.isFinite(p.mile))
    .sort((a, b) => a.mile - b.mile);
  if (points.length < 2 || width <= 0 || height <= 0) return null;
  const domain = { start: points[0].mile, end: points[points.length - 1].mile };
  if (!(domain.end > domain.start)) return null;

  const byId = new Map(points.map((p) => [p.id, p]));
  const resolved = input.routes.flatMap((r) => {
    const put = byId.get(r.putInId);
    const take = byId.get(r.takeOutId);
    // Floats run downstream; anything else is data we cannot place honestly.
    return put && take && take.mile > put.mile ? [{ ...r, put, take }] : [];
  });
  const selected = resolved.find((r) => r.id === input.selectedId) ?? null;
  const view: RiverStripView = input.view === 'stretch' && selected ? 'stretch' : 'whole';

  let a = domain.start;
  let b = domain.end;
  if (view === 'stretch' && selected) {
    const pad = Math.max((selected.take.mile - selected.put.mile) * 0.35, 2);
    a = Math.max(domain.start, selected.put.mile - pad);
    b = Math.min(domain.end, selected.take.mile + pad);
  }

  const padX = compact ? 22 : 44;
  const ppm = (width - 2 * padX) / (b - a);
  const seed = riverStripSeed(input.seedKey);
  // Detail fades in as miles get wider, so a long river does not turn to noise.
  const mid = clamp((ppm - 3) / 10, 0, 1);
  const fine = clamp((ppm - 8) / 30, 0, 1);
  const x = (m: number) => padX + (m - a) * ppm;
  const y = (m: number) =>
    height * 0.49 +
    height * 0.11 * Math.sin(m * 0.157 + seed) +
    height * 0.048 * mid * Math.sin(m * 0.9 + seed * 2.3) +
    height * 0.02 * fine * Math.sin(m * 3.9 + seed * 4.1);
  const line = (m0: number, m1: number) => {
    const n = Math.max(8, Math.round(((m1 - m0) * ppm) / 4));
    let d = '';
    for (let i = 0; i <= n; i++) {
      const m = m0 + ((m1 - m0) * i) / n;
      d += `${i ? 'L' : 'M'}${round(x(m))},${round(y(m))}`;
    }
    return d;
  };
  const inView = (m: number) => m >= a - 1e-6 && m <= b + 1e-6;
  // Off-screen river past the frame keeps the ribbon running out of a zoomed view.
  const overrun = view === 'stretch' ? padX / ppm : 0;

  const routes: StripRoute[] = resolved.map((r) => {
    const midMile = (r.put.mile + r.take.mile) / 2;
    const state: RouteState = r === selected ? 'selected' : r.id === input.hoveredId ? 'hovered' : 'other';
    return {
      id: r.id,
      number: r.number,
      state,
      path: line(Math.max(r.put.mile, a - overrun), Math.min(r.take.mile, b + overrun)),
      putIn: { id: r.put.id, name: r.put.name, mile: r.put.mile, x: round(x(r.put.mile)), y: round(y(r.put.mile)) },
      takeOut: { id: r.take.id, name: r.take.name, mile: r.take.mile, x: round(x(r.take.mile)), y: round(y(r.take.mile)) },
      miles: round(r.take.mile - r.put.mile),
      chip: inView(midMile) ? { x: round(x(midMile)), y: round(y(midMile)) } : null,
    };
  });

  const flagged = new Set(selected ? [selected.put.id, selected.take.id] : []);
  const visible = points.filter((p) => inView(p.mile));
  const dots: StripDot[] = visible
    .filter((p) => !flagged.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, mile: p.mile, x: round(x(p.mile)), y: round(y(p.mile)), endpoint: p.endpoint }));

  // Names must not sit under a number or a flag.
  const obstacles = [
    ...routes.flatMap((r) => (r.chip ? [box(r.chip.x, r.chip.y, CHIP_HALF, CHIP_HALF)] : [])),
    ...(selected ? [selected.put, selected.take].map((p) => box(x(p.mile), y(p.mile), FLAG_HALF, FLAG_HALF)) : []),
  ];
  const labels = placeLabels({
    obstacles,
    points,
    visible,
    resolved,
    selected,
    namesOnlySelected: compact && view === 'whole',
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
    river: line(Math.max(domain.start, a - overrun), Math.min(domain.end, b + overrun)),
    routes,
    dots,
    labels,
    ticks,
    overview: {
      routes: resolved.map((r) => ({ id: r.id, start: frac(r.put.mile), end: frac(r.take.mile), selected: r === selected })),
      window: view === 'stretch' ? { start: frac(a), end: frac(b) } : null,
    },
  };
}

/**
 * Names above and below the ribbon, most important first, dropping any that
 * would overlap one already placed on the same side. The selected put-in is
 * always named above and its take-out below.
 */
function placeLabels(args: {
  obstacles: Box[];
  points: RiverStripPoint[];
  visible: RiverStripPoint[];
  resolved: { id: string; put: RiverStripPoint; take: RiverStripPoint }[];
  selected: { put: RiverStripPoint; take: RiverStripPoint } | null;
  namesOnlySelected: boolean;
  x: (m: number) => number;
  y: (m: number) => number;
  width: number;
  charWidth: number;
}): StripLabel[] {
  const { selected, x, y, width, charWidth } = args;
  const onRoute = new Set(args.resolved.flatMap((r) => [r.put.id, r.take.id]));
  // Alternate sides by position on the whole river, so a label keeps its side as the view zooms.
  const order = new Map(args.points.map((p, i) => [p.id, i]));
  const priority = (p: RiverStripPoint) =>
    selected && (p.id === selected.put.id || p.id === selected.take.id) ? 0 : onRoute.has(p.id) ? 1 : p.endpoint ? 2 : 3;
  const candidates = args.visible
    .map((p) => ({ p, rank: priority(p) }))
    .filter((c) => !args.namesOnlySelected || c.rank === 0)
    .sort((m, n) => m.rank - n.rank || m.p.mile - n.p.mile);

  const taken: Box[] = [];
  const labels: StripLabel[] = [];
  for (const { p, rank } of candidates) {
    const w = p.name.length * charWidth + 14;
    const cx = clamp(x(p.mile), w / 2, width - w / 2);
    const at = (side: -1 | 1) => y(p.mile) + side * (rank === 0 ? 34 : 28);
    const free = (side: -1 | 1) => {
      const cy = at(side);
      return [...taken, ...args.obstacles].every((b) => cx + w / 2 < b.x0 || cx - w / 2 > b.x1 || cy + LABEL_HALF_HEIGHT < b.y0 || cy - LABEL_HALF_HEIGHT > b.y1);
    };
    let side: -1 | 1 = (order.get(p.id) ?? 0) % 2 === 0 ? -1 : 1;
    if (rank === 0) side = p.id === selected!.put.id ? -1 : 1;
    else if (!free(side)) {
      side = side === -1 ? 1 : -1;
      if (!free(side)) continue;
    }
    const cy = at(side);
    taken.push(box(cx, cy, w / 2, LABEL_HALF_HEIGHT));
    labels.push({
      id: p.id,
      name: p.name,
      x: round(cx),
      y: round(cy),
      emphasis: rank === 0 ? 'selected' : rank === 1 ? 'route' : 'other',
    });
  }
  return labels;
}
